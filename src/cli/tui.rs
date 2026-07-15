mod driver;
mod input;
mod session;

pub(crate) use driver::{TuiError, run};

use crate::agent::types::ToolCallId;
use crate::app::action::RuntimeEvent;
use crate::backend::Usage;
use crate::backend::profile::estimate_cost;
use input::Composer;
use ratatui::Frame;
use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use unicode_width::{UnicodeWidthChar as _, UnicodeWidthStr as _};

const NORMAL_FOOTER_WIDTH: u16 = 72;
const MAXIMUM_STREAM_ENTRY_BYTES: usize = 512 * 1024;
const MAXIMUM_TOOL_PREVIEW_BYTES: usize = 4 * 1024;
const MAXIMUM_TRANSCRIPT_ENTRIES: usize = 512;
const MAXIMUM_TRANSCRIPT_BYTES: usize = 2 * 1024 * 1024;
const DISPLAY_TRUNCATED: &str = "\n[display truncated]";

pub(super) struct TerminalViewModel {
    transcript: Vec<TranscriptEntry>,
    composer: Composer,
    model: String,
    total_tokens: Option<u64>,
    estimated_cost: CostView,
    activity: ActivityView,
    composer_focused: bool,
    transcript_scroll_offset: u16,
    reasoning_expanded: bool,
    active_reasoning_index: Option<usize>,
    active_assistant_index: Option<usize>,
    active_usage: Option<Usage>,
    completed_usage: Option<Usage>,
    terminal_seen: bool,
    history_truncated: bool,
}

pub(super) enum TranscriptEntry {
    User(String),
    Reasoning {
        content: String,
        expanded: bool,
    },
    Tool {
        tool_call_id: Option<ToolCallId>,
        name: String,
        state: ToolStateView,
        detail: String,
    },
    Assistant(String),
    Notice {
        label: String,
        detail: String,
        severity: NoticeSeverity,
    },
}

#[derive(Clone, Copy)]
pub(super) enum ToolStateView {
    Pending,
    Running,
    Completed,
    Denied,
    Failed,
    Cancelled,
}

#[derive(Clone, Copy)]
pub(super) enum NoticeSeverity {
    Warning,
    Error,
}

pub(super) enum CostView {
    Known(String),
    Unknown,
}

#[derive(Clone, Copy)]
pub(super) enum ActivityView {
    Idle,
    Thinking,
    RunningTool,
    Cancelling,
    Failed,
}

impl TerminalViewModel {
    pub(super) fn new() -> Self {
        Self {
            transcript: Vec::new(),
            composer: Composer::default(),
            model: crate::backend::profile::MODEL.into(),
            total_tokens: None,
            estimated_cost: CostView::Unknown,
            activity: ActivityView::Idle,
            composer_focused: true,
            transcript_scroll_offset: 0,
            reasoning_expanded: false,
            active_reasoning_index: None,
            active_assistant_index: None,
            active_usage: None,
            completed_usage: None,
            terminal_seen: false,
            history_truncated: false,
        }
    }

    pub(super) fn begin_turn(&mut self, prompt: String) {
        self.active_reasoning_index = None;
        self.active_assistant_index = None;
        self.transcript.push(TranscriptEntry::User(bounded_text(
            &prompt,
            MAXIMUM_STREAM_ENTRY_BYTES,
        )));
        self.activity = ActivityView::Thinking;
        self.composer_focused = false;
        self.transcript_scroll_offset = 0;
        self.active_usage = None;
        self.terminal_seen = false;
        self.refresh_usage();
        self.enforce_transcript_bounds();
    }

    pub(super) fn apply_event(&mut self, event: &RuntimeEvent) {
        match event {
            RuntimeEvent::StartupReady { .. } | RuntimeEvent::CredentialChanged { .. } => {}
            RuntimeEvent::TurnPrepared { .. } => self.activity = ActivityView::Thinking,
            RuntimeEvent::ModelStreamStarted { model, .. } => {
                self.model.clone_from(model);
                self.activity = ActivityView::Thinking;
            }
            RuntimeEvent::ReasoningDelta { text, .. } => {
                let index = self.reasoning_entry();
                append_bounded(
                    reasoning_content(&mut self.transcript[index]),
                    text,
                    MAXIMUM_STREAM_ENTRY_BYTES,
                );
            }
            RuntimeEvent::TextDelta { text, .. } => {
                let index = self.assistant_entry();
                append_bounded(
                    assistant_content(&mut self.transcript[index]),
                    text,
                    MAXIMUM_STREAM_ENTRY_BYTES,
                );
            }
            RuntimeEvent::AssistantPhaseCompleted { phase, .. } => {
                self.model.clone_from(&phase.compatibility.model);
                if let Some(reasoning) = &phase.reasoning {
                    let index = self.reasoning_entry();
                    *reasoning_content(&mut self.transcript[index]) =
                        bounded_text(reasoning, MAXIMUM_STREAM_ENTRY_BYTES);
                }
                if let Some(text) = &phase.text {
                    let index = self.assistant_entry();
                    *assistant_content(&mut self.transcript[index]) =
                        bounded_text(text, MAXIMUM_STREAM_ENTRY_BYTES);
                }
                self.active_reasoning_index = None;
                self.active_assistant_index = None;
            }
            RuntimeEvent::ToolValidated {
                tool_call_id, name, ..
            } => {
                self.transcript.push(TranscriptEntry::Tool {
                    tool_call_id: Some(*tool_call_id),
                    name: name.clone(),
                    state: ToolStateView::Pending,
                    detail: "validated".into(),
                });
                self.activity = ActivityView::RunningTool;
            }
            RuntimeEvent::ApprovalRequested { .. } => {
                self.activity = ActivityView::RunningTool;
            }
            RuntimeEvent::ApprovalResolved {
                tool_call_id,
                decision,
                ..
            } => {
                if *decision != crate::tools::ApprovalDecision::Approved {
                    self.update_tool(
                        *tool_call_id,
                        ToolStateView::Denied,
                        match decision {
                            crate::tools::ApprovalDecision::Denied => "approval denied",
                            crate::tools::ApprovalDecision::Unavailable => "approval unavailable",
                            crate::tools::ApprovalDecision::Approved => unreachable!(),
                        },
                    );
                }
            }
            RuntimeEvent::ToolStarted {
                tool_call_id, name, ..
            } => {
                self.update_tool(*tool_call_id, ToolStateView::Running, name);
                self.activity = ActivityView::RunningTool;
            }
            RuntimeEvent::ToolCompleted {
                tool_call_id,
                output,
                executed,
                ..
            } => {
                let state = if *executed {
                    ToolStateView::Completed
                } else {
                    ToolStateView::Denied
                };
                self.update_tool(
                    *tool_call_id,
                    state,
                    &bounded_single_line(output, MAXIMUM_TOOL_PREVIEW_BYTES),
                );
            }
            RuntimeEvent::ContinuationStarted { .. } => {
                self.active_reasoning_index = None;
                self.active_assistant_index = None;
                self.activity = ActivityView::Thinking;
            }
            RuntimeEvent::LimitReached { limit, .. } => {
                self.transcript.push(TranscriptEntry::Notice {
                    label: "Limit reached".into(),
                    detail: format!("{limit:?}"),
                    severity: NoticeSeverity::Error,
                })
            }
            RuntimeEvent::UsageUpdated { usage, .. } => {
                self.active_usage = Some(usage.clone());
                self.refresh_usage();
            }
            RuntimeEvent::TurnCompleted { .. } => self.finish_terminal(None),
            RuntimeEvent::TurnFailed { code, .. } => {
                self.finish_terminal(Some(("Turn failed", *code, NoticeSeverity::Error)))
            }
            RuntimeEvent::TurnCancelled { .. } => self.finish_terminal(Some((
                "Turn cancelled",
                "no further local effect",
                NoticeSeverity::Warning,
            ))),
        }
        self.transcript_scroll_offset = 0;
        self.enforce_transcript_bounds();
    }

    pub(super) fn toggle_reasoning(&mut self) {
        self.reasoning_expanded = !self.reasoning_expanded;
        for entry in &mut self.transcript {
            if let TranscriptEntry::Reasoning { expanded, .. } = entry {
                *expanded = self.reasoning_expanded;
            }
        }
    }

    pub(super) fn scroll_up(&mut self, rows: u16) {
        self.transcript_scroll_offset = self.transcript_scroll_offset.saturating_add(rows);
    }

    pub(super) fn scroll_down(&mut self, rows: u16) {
        self.transcript_scroll_offset = self.transcript_scroll_offset.saturating_sub(rows);
    }

    pub(super) fn notice(&mut self, label: &str, detail: &str, severity: NoticeSeverity) {
        self.transcript.push(TranscriptEntry::Notice {
            label: label.into(),
            detail: detail.into(),
            severity,
        });
        self.enforce_transcript_bounds();
    }

    fn reasoning_entry(&mut self) -> usize {
        if let Some(index) = self.active_reasoning_index {
            return index;
        }
        let index = self.transcript.len();
        self.transcript.push(TranscriptEntry::Reasoning {
            content: String::new(),
            expanded: self.reasoning_expanded,
        });
        self.active_reasoning_index = Some(index);
        index
    }

    fn assistant_entry(&mut self) -> usize {
        if let Some(index) = self.active_assistant_index {
            return index;
        }
        let index = self.transcript.len();
        self.transcript
            .push(TranscriptEntry::Assistant(String::new()));
        self.active_assistant_index = Some(index);
        index
    }

    fn update_tool(&mut self, tool_call_id: ToolCallId, state: ToolStateView, detail: &str) {
        if let Some(TranscriptEntry::Tool {
            state: current,
            detail: current_detail,
            ..
        }) = self.transcript.iter_mut().rev().find(|entry| {
            matches!(
                entry,
                TranscriptEntry::Tool {
                    tool_call_id: Some(candidate),
                    ..
                } if *candidate == tool_call_id
            )
        }) {
            *current = state;
            *current_detail = bounded_single_line(detail, MAXIMUM_TOOL_PREVIEW_BYTES);
        }
    }

    fn finish_terminal(&mut self, notice: Option<(&str, &str, NoticeSeverity)>) {
        if self.terminal_seen {
            return;
        }
        self.terminal_seen = true;
        let terminal_tool_state = notice.as_ref().map(|(_, _, severity)| match severity {
            NoticeSeverity::Error => ToolStateView::Failed,
            NoticeSeverity::Warning => ToolStateView::Cancelled,
        });
        if let Some(terminal_tool_state) = terminal_tool_state {
            for entry in &mut self.transcript {
                if let TranscriptEntry::Tool { state, detail, .. } = entry
                    && matches!(state, ToolStateView::Pending | ToolStateView::Running)
                {
                    *state = match terminal_tool_state {
                        ToolStateView::Failed => ToolStateView::Failed,
                        _ => ToolStateView::Cancelled,
                    };
                    *detail = "turn ended before completion".into();
                }
            }
        }
        self.activity = if notice
            .as_ref()
            .is_some_and(|(_, _, severity)| matches!(severity, NoticeSeverity::Error))
        {
            ActivityView::Failed
        } else {
            ActivityView::Idle
        };
        self.composer_focused = true;
        if let Some(active) = self.active_usage.take() {
            self.completed_usage = match self.completed_usage.take() {
                Some(completed) => completed.checked_add(&active),
                None => Some(active),
            };
        }
        self.refresh_usage();
        if let Some((label, detail, severity)) = notice {
            self.notice(label, detail, severity);
        }
    }

    fn refresh_usage(&mut self) {
        let combined = match (&self.completed_usage, &self.active_usage) {
            (Some(completed), Some(active)) => completed.checked_add(active),
            (Some(completed), None) => Some(completed.clone()),
            (None, Some(active)) => Some(active.clone()),
            (None, None) => None,
        };
        self.total_tokens = combined.as_ref().and_then(|usage| usage.total_tokens);
        self.estimated_cost = combined
            .as_ref()
            .and_then(|usage| estimate_cost(usage).ok().flatten())
            .map_or(CostView::Unknown, |cost| {
                CostView::Known(format!(
                    "${}.{:09}",
                    cost.nano_usd / 1_000_000_000,
                    cost.nano_usd % 1_000_000_000
                ))
            });
    }

    fn enforce_transcript_bounds(&mut self) {
        while self.transcript.len() > 1
            && (self.transcript.len() > MAXIMUM_TRANSCRIPT_ENTRIES
                || transcript_bytes(&self.transcript) > MAXIMUM_TRANSCRIPT_BYTES)
        {
            self.transcript.remove(0);
            self.active_reasoning_index = self
                .active_reasoning_index
                .and_then(|index| index.checked_sub(1));
            self.active_assistant_index = self
                .active_assistant_index
                .and_then(|index| index.checked_sub(1));
            self.history_truncated = true;
        }
    }
}

pub(super) fn render(frame: &mut Frame<'_>, model: &TerminalViewModel) {
    let composer_height = composer_height(&model.composer, frame.area().width);
    let [transcript_area, composer_area, footer_area] = Layout::vertical([
        Constraint::Min(4),
        Constraint::Length(composer_height),
        Constraint::Length(1),
    ])
    .areas(frame.area());

    frame.render_widget(
        Paragraph::new(transcript_text(model, transcript_area.width))
            .wrap(Wrap { trim: false })
            .scroll((
                transcript_scroll(model, transcript_area.width, transcript_area.height),
                0,
            )),
        transcript_area,
    );
    frame.render_widget(
        Paragraph::new(composer_text(model.composer.text()))
            .block(
                Block::default()
                    .borders(Borders::TOP)
                    .border_style(Style::default().fg(Color::DarkGray))
                    .title(Span::styled(
                        " prompt ",
                        Style::default().fg(Color::DarkGray),
                    )),
            )
            .wrap(Wrap { trim: false })
            .scroll((composer_scroll(&model.composer, composer_area), 0)),
        composer_area,
    );
    frame.render_widget(
        Paragraph::new(footer_line(model, footer_area.width)),
        footer_area,
    );
    if model.composer_focused {
        let available = usize::from(composer_area.width.saturating_sub(2)).max(1);
        let (column, row) = model.composer.visual_cursor(available);
        let scroll = usize::from(composer_scroll(&model.composer, composer_area));
        let visible_row = row.saturating_sub(scroll);
        frame.set_cursor_position((
            composer_area
                .x
                .saturating_add(2)
                .saturating_add(column as u16),
            composer_area
                .y
                .saturating_add(1)
                .saturating_add(visible_row as u16),
        ));
    }
}

fn transcript_text(model: &TerminalViewModel, width: u16) -> Text<'static> {
    let mut lines = Vec::new();
    if model.history_truncated {
        lines.push(Line::from(vec![
            Span::styled(
                "Earlier display omitted",
                Style::default().fg(Color::Yellow),
            ),
            Span::styled(" · terminal transcript limit reached", muted()),
        ]));
        if !model.transcript.is_empty() {
            lines.push(Line::default());
        }
    }
    for (index, entry) in model.transcript.iter().enumerate() {
        if index > 0 {
            lines.push(Line::default());
        }
        match entry {
            TranscriptEntry::User(content) => {
                lines.push(label_line("You", Color::Cyan));
                lines.extend(indented_lines(content, "  ", Style::default(), width));
            }
            TranscriptEntry::Reasoning { content, expanded } => {
                if *expanded {
                    lines.push(Line::from(vec![
                        styled_label("Pho", Color::Magenta),
                        Span::raw("  "),
                        Span::styled("Thinking · details shown", muted()),
                    ]));
                    lines.extend(indented_lines(content, "  ", muted(), width));
                } else {
                    lines.push(Line::from(vec![
                        styled_label("Pho", Color::Magenta),
                        Span::raw("  "),
                        Span::styled("Thinking… · details hidden (Ctrl+O)", muted()),
                    ]));
                }
            }
            TranscriptEntry::Tool {
                name,
                state,
                detail,
                ..
            } => {
                lines.push(Line::from(vec![
                    Span::raw("  ● "),
                    Span::styled(name.clone(), Style::default().add_modifier(Modifier::BOLD)),
                ]));
                let (marker, label, color) = match state {
                    ToolStateView::Pending => ("○", "pending", Color::Yellow),
                    ToolStateView::Running => ("◐", "running", Color::Yellow),
                    ToolStateView::Completed => ("✓", "completed", Color::Green),
                    ToolStateView::Denied => ("–", "denied", Color::Yellow),
                    ToolStateView::Failed => ("×", "failed", Color::Red),
                    ToolStateView::Cancelled => ("–", "cancelled", Color::Yellow),
                };
                let detail_prefix_width = 4 + marker.width() + 1 + label.width() + 3;
                let detail_width = usize::from(width)
                    .saturating_sub(detail_prefix_width)
                    .max(1);
                let mut details = wrap_words(detail, detail_width).into_iter();
                lines.push(Line::from(vec![
                    Span::raw("    "),
                    Span::styled(marker, Style::default().fg(color)),
                    Span::raw(" "),
                    Span::styled(label, Style::default().fg(color)),
                    Span::styled(
                        format!(" · {}", details.next().unwrap_or_default()),
                        muted(),
                    ),
                ]));
                lines.extend(details.map(|detail| {
                    Line::from(vec![
                        Span::raw(" ".repeat(detail_prefix_width)),
                        Span::styled(detail, muted()),
                    ])
                }));
            }
            TranscriptEntry::Assistant(content) => {
                lines.push(label_line("Pho", Color::Magenta));
                lines.extend(indented_lines(content, "  ", Style::default(), width));
            }
            TranscriptEntry::Notice {
                label,
                detail,
                severity,
            } => {
                let color = match severity {
                    NoticeSeverity::Warning => Color::Yellow,
                    NoticeSeverity::Error => Color::Red,
                };
                lines.push(Line::from(vec![
                    Span::styled(label.clone(), Style::default().fg(color)),
                    Span::styled(format!(" · {detail}"), muted()),
                ]));
            }
        }
    }
    Text::from(lines)
}

fn label_line(label: &str, color: Color) -> Line<'static> {
    Line::from(styled_label(label, color))
}

fn styled_label(label: &str, color: Color) -> Span<'static> {
    Span::styled(
        label.to_owned(),
        Style::default().fg(color).add_modifier(Modifier::BOLD),
    )
}

fn indented_lines(content: &str, prefix: &str, style: Style, width: u16) -> Vec<Line<'static>> {
    let available = usize::from(width).saturating_sub(prefix.width()).max(1);
    content
        .split('\n')
        .flat_map(|line| {
            wrap_words(line, available).into_iter().map(|line| {
                Line::from(vec![
                    Span::raw(prefix.to_owned()),
                    Span::styled(line, style),
                ])
            })
        })
        .collect()
}

fn wrap_words(content: &str, maximum_width: usize) -> Vec<String> {
    if content.is_empty() {
        return vec![String::new()];
    }
    let mut output = Vec::new();
    let mut current = String::new();
    let mut current_width = 0_usize;
    for word in content.split_whitespace() {
        let word_width = word.width();
        let separator = usize::from(!current.is_empty());
        if current_width + separator + word_width <= maximum_width {
            if separator == 1 {
                current.push(' ');
            }
            current.push_str(word);
            current_width += separator + word_width;
            continue;
        }
        if !current.is_empty() {
            output.push(std::mem::take(&mut current));
            current_width = 0;
        }
        for character in word.chars() {
            let character_width = character.width().unwrap_or(0);
            if current_width + character_width > maximum_width && !current.is_empty() {
                output.push(std::mem::take(&mut current));
                current_width = 0;
            }
            current.push(character);
            current_width += character_width;
        }
    }
    if !current.is_empty() {
        output.push(current);
    }
    output
}

fn composer_text(composer: &str) -> Text<'static> {
    let mut lines = composer.split('\n');
    let mut output = vec![Line::from(vec![
        Span::styled("> ", Style::default().fg(Color::Cyan)),
        Span::raw(lines.next().unwrap_or_default().to_owned()),
    ])];
    output.extend(lines.map(|line| Line::from(format!("  {line}"))));
    Text::from(output)
}

fn composer_height(composer: &Composer, width: u16) -> u16 {
    let available = usize::from(width.saturating_sub(2)).max(1);
    let rows = composer.visual_rows(available);
    u16::try_from(rows.clamp(2, 5)).unwrap_or(5) + 1
}

fn composer_scroll(composer: &Composer, area: ratatui::layout::Rect) -> u16 {
    let available_width = usize::from(area.width.saturating_sub(2)).max(1);
    let (_, cursor_row) = composer.visual_cursor(available_width);
    let visible_rows = usize::from(area.height.saturating_sub(1)).max(1);
    u16::try_from(cursor_row.saturating_add(1).saturating_sub(visible_rows)).unwrap_or(u16::MAX)
}

fn transcript_scroll(model: &TerminalViewModel, width: u16, height: u16) -> u16 {
    let logical_lines = transcript_text(model, width).height();
    let bottom = logical_lines.saturating_sub(usize::from(height));
    u16::try_from(bottom)
        .unwrap_or(u16::MAX)
        .saturating_sub(model.transcript_scroll_offset)
}

fn footer_line(model: &TerminalViewModel, width: u16) -> Line<'static> {
    let activity = match model.activity {
        ActivityView::Idle => "idle",
        ActivityView::Thinking => "thinking",
        ActivityView::RunningTool => "tool running",
        ActivityView::Cancelling => "cancelling",
        ActivityView::Failed => "failed",
    };
    let tokens = model.total_tokens.map_or_else(
        || "tokens unknown".into(),
        |tokens| format!("{tokens} tokens"),
    );
    let cost = match &model.estimated_cost {
        CostView::Known(cost) => format!("{cost} est"),
        CostView::Unknown => "cost unknown".into(),
    };
    let value = if width >= NORMAL_FOOTER_WIDTH {
        format!(
            "{} · {tokens} · {cost} · {activity} · ^C clear · ^D exit · ^O details",
            model.model
        )
    } else {
        format!("{tokens} · {activity} · ^C clear · ^D exit · ^O details")
    };
    Line::from(Span::styled(value, muted()))
}

fn muted() -> Style {
    Style::default().fg(Color::DarkGray)
}

fn reasoning_content(entry: &mut TranscriptEntry) -> &mut String {
    let TranscriptEntry::Reasoning { content, .. } = entry else {
        unreachable!("reasoning index must reference reasoning content")
    };
    content
}

fn assistant_content(entry: &mut TranscriptEntry) -> &mut String {
    let TranscriptEntry::Assistant(content) = entry else {
        unreachable!("assistant index must reference assistant content")
    };
    content
}

fn bounded_text(value: &str, maximum: usize) -> String {
    if value.len() <= maximum {
        return value.to_owned();
    }
    let keep = maximum.saturating_sub(DISPLAY_TRUNCATED.len());
    let boundary = floor_char_boundary(value, keep);
    format!("{}{}", &value[..boundary], DISPLAY_TRUNCATED)
}

fn append_bounded(target: &mut String, value: &str, maximum: usize) {
    if target.ends_with(DISPLAY_TRUNCATED) {
        return;
    }
    let remaining = maximum.saturating_sub(target.len());
    if value.len() <= remaining {
        target.push_str(value);
        return;
    }
    let keep = remaining.saturating_sub(DISPLAY_TRUNCATED.len());
    let boundary = floor_char_boundary(value, keep);
    target.push_str(&value[..boundary]);
    target.push_str(DISPLAY_TRUNCATED);
}

fn bounded_single_line(value: &str, maximum: usize) -> String {
    bounded_text(
        &value.split_whitespace().collect::<Vec<_>>().join(" "),
        maximum,
    )
}

fn transcript_bytes(transcript: &[TranscriptEntry]) -> usize {
    transcript.iter().fold(0, |total, entry| {
        let bytes = match entry {
            TranscriptEntry::User(content) | TranscriptEntry::Assistant(content) => content.len(),
            TranscriptEntry::Reasoning { content, .. } => content.len(),
            TranscriptEntry::Tool { name, detail, .. }
            | TranscriptEntry::Notice {
                label: name,
                detail,
                ..
            } => name.len().saturating_add(detail.len()),
        };
        total.saturating_add(bytes)
    })
}

fn floor_char_boundary(value: &str, mut index: usize) -> usize {
    index = index.min(value.len());
    while !value.is_char_boundary(index) {
        index -= 1;
    }
    index
}

#[cfg(test)]
mod tests {
    use ratatui::Terminal;
    use ratatui::backend::TestBackend;

    use super::*;

    fn gold_standard_model() -> TerminalViewModel {
        let mut model = TerminalViewModel::new();
        model.transcript = vec![
            TranscriptEntry::User(
                "Call the echo tool, then verify that a fake mutation is denied.".into(),
            ),
            TranscriptEntry::Reasoning {
                content: "Provider-returned reasoning remains available on explicit reveal.".into(),
                expanded: false,
            },
            TranscriptEntry::Tool {
                tool_call_id: None,
                name: "phase1b_echo".into(),
                state: ToolStateView::Completed,
                detail: "alpha".into(),
            },
            TranscriptEntry::Tool {
                tool_call_id: None,
                name: "phase3_mutation_probe".into(),
                state: ToolStateView::Denied,
                detail: "no local effect".into(),
            },
            TranscriptEntry::Assistant(
                "The echo returned “alpha”. The fake mutation was denied and did not execute."
                    .into(),
            ),
        ];
        model.composer =
            Composer::with_text("Inspect the next tool call carefully.\nKeep the answer concise.");
        model.model = "deepseek-v4-flash".into();
        model.total_tokens = Some(128);
        model.estimated_cost = CostView::Known("$0.000042".into());
        model.activity = ActivityView::Idle;
        model
    }

    fn render_snapshot(width: u16, height: u16) -> String {
        let backend = TestBackend::new(width, height);
        let mut terminal = Terminal::new(backend).unwrap();
        terminal
            .draw(|frame| render(frame, &gold_standard_model()))
            .unwrap();
        let buffer = terminal.backend().buffer();
        let mut output = String::new();
        for y in 0..height {
            let mut row = String::new();
            for x in 0..width {
                row.push_str(buffer[(x, y)].symbol());
            }
            output.push_str(row.trim_end());
            output.push('\n');
        }
        output.trim_end().to_owned()
    }

    #[test]
    fn gold_standard_normal_width_snapshot() {
        let actual = render_snapshot(96, 17);
        assert_eq!(
            actual,
            include_str!("../../tests/snapshots/phase3b_gold_96x17.txt").trim_end()
        );
    }

    #[test]
    fn gold_standard_narrow_width_snapshot() {
        let actual = render_snapshot(52, 19);
        assert_eq!(
            actual,
            include_str!("../../tests/snapshots/phase3b_gold_52x19.txt").trim_end()
        );
    }

    #[test]
    fn gold_standard_preview_for_manual_review() {
        if std::env::var_os("PHO_SHOW_TUI_GOLD").is_some() {
            println!("--- 96x17 ---\n{}", render_snapshot(96, 17));
            println!("--- 52x19 ---\n{}", render_snapshot(52, 19));
        }
    }

    #[test]
    fn canonical_events_project_tools_usage_and_exactly_one_terminal_outcome() {
        let turn_id = crate::agent::types::TurnId::new();
        let tool_call_id = ToolCallId::new();
        let mut model = TerminalViewModel::new();
        model.begin_turn("test prompt".into());
        model.apply_event(&RuntimeEvent::ModelStreamStarted {
            turn_id,
            model: "test-model".into(),
        });
        model.apply_event(&RuntimeEvent::ReasoningDelta {
            turn_id,
            text: "private detail".into(),
        });
        model.apply_event(&RuntimeEvent::TextDelta {
            turn_id,
            text: "answer".into(),
        });
        model.apply_event(&RuntimeEvent::ToolValidated {
            turn_id,
            tool_call_id,
            name: "phase3_mutation_probe".into(),
            mutating: true,
        });
        model.apply_event(&RuntimeEvent::ToolCompleted {
            turn_id,
            tool_call_id,
            name: "phase3_mutation_probe".into(),
            output: "no local effect".into(),
            executed: false,
        });
        model.apply_event(&RuntimeEvent::UsageUpdated {
            turn_id,
            usage: Usage {
                prompt_tokens: Some(8),
                cache_hit_tokens: Some(0),
                cache_miss_tokens: Some(8),
                output_tokens: Some(4),
                reasoning_tokens: Some(1),
                total_tokens: Some(12),
            },
        });
        model.apply_event(&RuntimeEvent::TurnCompleted { turn_id });
        model.apply_event(&RuntimeEvent::TurnCancelled { turn_id });

        assert_eq!(model.model, "test-model");
        assert_eq!(model.total_tokens, Some(12));
        assert!(matches!(model.activity, ActivityView::Idle));
        assert!(!model.transcript.iter().any(|entry| matches!(
            entry,
            TranscriptEntry::Notice {
                label,
                ..
            } if label == "Turn cancelled"
        )));
        assert!(model.transcript.iter().any(|entry| matches!(
            entry,
            TranscriptEntry::Tool {
                state: ToolStateView::Denied,
                detail,
                ..
            } if detail == "no local effect"
        )));
        assert!(model.transcript.iter().any(|entry| matches!(
            entry,
            TranscriptEntry::Reasoning {
                expanded: false,
                ..
            }
        )));
        model.toggle_reasoning();
        assert!(
            model
                .transcript
                .iter()
                .any(|entry| matches!(entry, TranscriptEntry::Reasoning { expanded: true, .. }))
        );
    }

    #[test]
    fn composer_cursor_is_width_aware_and_kept_in_view() {
        let backend = TestBackend::new(40, 8);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut model = TerminalViewModel::new();
        model.composer = Composer::with_text("界界界界界界界界界界界界界界界界界界界界");
        terminal.draw(|frame| render(frame, &model)).unwrap();
        let position = terminal.backend().cursor_position();
        assert!(position.x < 40);
        assert!(position.y < 8);
    }

    #[test]
    fn retained_display_history_is_bounded_and_reports_omission() {
        let mut model = TerminalViewModel::new();
        for index in 0..=MAXIMUM_TRANSCRIPT_ENTRIES {
            model.notice(
                "Fixture",
                &format!("bounded transcript entry {index}"),
                NoticeSeverity::Warning,
            );
        }

        assert_eq!(model.transcript.len(), MAXIMUM_TRANSCRIPT_ENTRIES);
        assert!(model.history_truncated);
        assert!(
            transcript_text(&model, 80)
                .to_string()
                .contains("Earlier display omitted")
        );
    }
}
