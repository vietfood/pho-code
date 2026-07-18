use std::collections::{HashSet, VecDeque};
use std::rc::Rc;

use gpui::{
    AnyElement, Context, Entity, FocusHandle, Focusable as _, FontStyle, HighlightStyle, Hsla,
    PathPromptOptions, Render, StyledText, Subscription, Task, Window, WindowAppearance, div,
    prelude::*, px, rgb,
};

use crate::agent::types::{ApprovalId, ItemId, ToolCallId, ToolStatus, TurnId};
use crate::app::action::RuntimeEvent;
use crate::app::markdown::{
    InlineNode, MAX_SOURCE_BYTES as MAX_MARKDOWN_SOURCE_BYTES, MarkdownBlock, MarkdownDocument,
};
use crate::app::syntax::{HighlightKind, Language, MAX_HIGHLIGHT_BYTES, highlight};
use crate::app::terminal_surface::{
    TerminalRestoreFocus, TerminalSurfaceEffect, TerminalSurfacePresentation,
};
use crate::app::transcript::{
    AssistantPhaseRecord, Disclosure, ProductVerb, ProvisionalKey, RowId, TerminalState,
    ToolActivityKind, ToolLifecycleState, ToolResultRecord, ToolTerminalStatus, TranscriptEvent,
    TranscriptProjection, TranscriptRow, UsageRecord,
};
use crate::app::workbench_controller::{
    TerminalPanelStatus, TerminalSurfaceDimensions, WorkbenchCommand, WorkbenchCommandKind,
    WorkbenchControllerEvent, WorkbenchSnapshot,
};
use crate::app::workbench_lifecycle::{
    NativeStartupState, StartupEffect, StartupEvent, StartupGeneration, WorkbenchStartupProjection,
    reduce_startup,
};
use crate::app::workbench_preferences::{
    PaneFractionsV2, PaneVisibilityPreferences, ThemePreference,
};
use crate::app::workbench_state::WorkbenchPane;
use crate::auth::CredentialState;
use crate::tools::{ApprovalDecision, ApprovalResponse};

use super::composer::{Composer, ComposerEvent};
use super::fonts::WORKBENCH_FONT_FAMILY;
use super::secure_input::SecureInput;
use super::workbench_theme::{Rgb, SemanticColors, SystemAppearance, ThemeProfile};

pub const DEFAULT_WINDOW_WIDTH: f32 = 1_400.0;
pub const DEFAULT_WINDOW_HEIGHT: f32 = 900.0;
pub const MINIMUM_WINDOW_WIDTH: f32 = 960.0;
pub const MINIMUM_WINDOW_HEIGHT: f32 = 640.0;
pub const NAVIGATION_PREFERRED_WIDTH: f32 = 220.0;
pub const FILE_TREE_PREFERRED_WIDTH: f32 = 250.0;
pub const COLLAPSED_REGION_WIDTH: f32 = 44.0;
pub const ALL_REGIONS_MINIMUM_WIDTH: f32 = 1_150.0;
pub const NAVIGATION_COLLAPSE_WIDTH: f32 = 900.0;
const NAVIGATION_MIN_WIDTH: f32 = 160.0;
const NAVIGATION_MAX_WIDTH: f32 = 260.0;
const MAX_REASONING_EXPANSIONS: usize = 64;
const TERMINAL_PANE_HEIGHT: f32 = 240.0;

gpui::actions!(
    pho_workbench,
    [
        FocusNavigation,
        FocusChat,
        FocusInspection,
        FocusTerminal,
        ToggleTerminalSurface,
        FocusFiles,
        ToggleNavigationSurface,
        ToggleInspectionSurface,
        ToggleFilesSurface,
        OpenCredentialSettings
    ]
);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LayoutDecision {
    pub navigation_collapsed: bool,
    pub file_tree_collapsed: bool,
}

pub fn layout_for_width(width: f32) -> LayoutDecision {
    let bounded = if width.is_finite() {
        width.max(0.0)
    } else {
        0.0
    };
    LayoutDecision {
        file_tree_collapsed: bounded < ALL_REGIONS_MINIMUM_WIDTH,
        navigation_collapsed: bounded < NAVIGATION_COLLAPSE_WIDTH,
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SemanticPalette {
    pub background: Hsla,
    pub surface: Hsla,
    pub raised: Hsla,
    pub hover: Hsla,
    pub selected: Hsla,
    pub border: Hsla,
    pub separator: Hsla,
    pub text: Hsla,
    pub muted_text: Hsla,
    pub focus: Hsla,
    pub success: Hsla,
    pub warning: Hsla,
    pub error: Hsla,
    pub link: Hsla,
    pub inline_code: Hsla,
    pub fenced_code: Hsla,
}

impl SemanticPalette {
    pub fn for_theme(theme: ThemePreference) -> Self {
        let profile = match theme {
            ThemePreference::System | ThemePreference::Light => ThemeProfile::Light,
            ThemePreference::Dark => ThemeProfile::Dark,
            ThemePreference::HighContrast => ThemeProfile::HighContrast,
        };
        Self::from_semantic(SemanticColors::for_profile(profile))
    }

    pub fn for_window(theme: ThemePreference, appearance: WindowAppearance) -> Self {
        let profile = match theme {
            ThemePreference::System => ThemeProfile::System,
            ThemePreference::Light => ThemeProfile::Light,
            ThemePreference::Dark => ThemeProfile::Dark,
            ThemePreference::HighContrast => ThemeProfile::HighContrast,
        };
        let appearance = match appearance {
            WindowAppearance::Dark | WindowAppearance::VibrantDark => SystemAppearance::Dark,
            WindowAppearance::Light | WindowAppearance::VibrantLight => SystemAppearance::Light,
        };
        Self::from_semantic(profile.resolve(appearance).colors)
    }

    fn from_semantic(colors: SemanticColors) -> Self {
        Self {
            background: gpui_color(colors.background),
            surface: gpui_color(colors.surface),
            raised: gpui_color(colors.raised),
            hover: gpui_color(colors.hover),
            selected: gpui_color(colors.selected),
            border: gpui_color(colors.border),
            separator: gpui_color(colors.separator),
            text: gpui_color(colors.primary_text),
            muted_text: gpui_color(colors.muted_text),
            focus: gpui_color(colors.focus),
            success: gpui_color(colors.success),
            warning: gpui_color(colors.warning),
            error: gpui_color(colors.error),
            link: gpui_color(colors.link),
            inline_code: gpui_color(colors.inline_code),
            fenced_code: gpui_color(colors.fenced_code),
        }
    }
}

fn gpui_color(color: Rgb) -> Hsla {
    let encoded =
        (u32::from(color.red) << 16) | (u32::from(color.green) << 8) | u32::from(color.blue);
    rgb(encoded).into()
}

pub struct StartupView {
    projection: WorkbenchStartupProjection,
    theme: ThemePreference,
    retry_action: Option<RetryStartupAction>,
    retry_in_progress: bool,
    credential_input: Entity<SecureInput>,
    composer: Entity<Composer>,
    terminal_composer: Entity<Composer>,
    navigation_focus: FocusHandle,
    chat_focus: FocusHandle,
    inspection_focus: FocusHandle,
    terminal_focus: FocusHandle,
    files_focus: FocusHandle,
    terminal_surface: TerminalSurfacePresentation,
    command_sender: Option<tokio::sync::mpsc::Sender<WorkbenchCommand>>,
    cancellation_sender: Option<tokio::sync::mpsc::Sender<TurnId>>,
    approval_sender: Option<tokio::sync::mpsc::Sender<ApprovalResponse>>,
    snapshot: Option<WorkbenchSnapshot>,
    active_turn_id: Option<TurnId>,
    live_transcript: Option<TranscriptProjection>,
    live_key: Option<ProvisionalKey>,
    expanded_reasoning: HashSet<ItemId>,
    presentation_generation: u64,
    trace: VecDeque<String>,
    pending_approval: Option<PendingApproval>,
    approval_response_pending: bool,
    workbench_error: Option<&'static str>,
    credential_dialog_open: bool,
    credential_operation_active: bool,
    credential_error: Option<&'static str>,
    workbench_events: Task<()>,
    _subscriptions: Vec<Subscription>,
}

#[derive(Clone)]
struct PendingApproval {
    turn_id: TurnId,
    approval_id: ApprovalId,
    tool_call_id: ToolCallId,
    effect_digest: String,
    summary: String,
}

pub type RetryStartupAction = Rc<
    dyn Fn(
        WorkbenchStartupProjection,
        gpui::WeakEntity<StartupView>,
        &mut Window,
        &mut Context<StartupView>,
    ),
>;

impl StartupView {
    pub fn new(
        projection: WorkbenchStartupProjection,
        theme: ThemePreference,
        retry_action: Option<RetryStartupAction>,
        credential_input: Entity<SecureInput>,
        composer: Entity<Composer>,
        terminal_composer: Entity<Composer>,
        cx: &mut Context<Self>,
    ) -> Self {
        let chat_subscription = cx.subscribe(&composer, |view, _, event, cx| {
            if let ComposerEvent::Submitted(text) = event {
                view.send_prompt(text.clone(), cx);
            }
        });
        let terminal_subscription = cx.subscribe(&terminal_composer, |view, _, event, cx| {
            if let ComposerEvent::Submitted(text) = event {
                view.send_terminal_input(text.clone(), cx);
            }
        });
        Self {
            projection,
            theme,
            retry_action,
            retry_in_progress: false,
            credential_input,
            composer,
            terminal_composer,
            navigation_focus: cx.focus_handle(),
            chat_focus: cx.focus_handle(),
            inspection_focus: cx.focus_handle(),
            terminal_focus: cx.focus_handle(),
            files_focus: cx.focus_handle(),
            terminal_surface: TerminalSurfacePresentation::new(),
            command_sender: None,
            cancellation_sender: None,
            approval_sender: None,
            snapshot: None,
            active_turn_id: None,
            live_transcript: None,
            live_key: None,
            expanded_reasoning: HashSet::new(),
            presentation_generation: 0,
            trace: VecDeque::new(),
            pending_approval: None,
            approval_response_pending: false,
            workbench_error: None,
            credential_dialog_open: false,
            credential_operation_active: false,
            credential_error: None,
            workbench_events: Task::ready(()),
            _subscriptions: vec![chat_subscription, terminal_subscription],
        }
    }

    pub fn attach_workbench_runtime(
        &mut self,
        sender: tokio::sync::mpsc::Sender<WorkbenchCommand>,
        mut receiver: tokio::sync::mpsc::Receiver<WorkbenchControllerEvent>,
        cancellations: tokio::sync::mpsc::Sender<TurnId>,
        approvals: tokio::sync::mpsc::Sender<ApprovalResponse>,
        cx: &mut Context<Self>,
    ) {
        self.command_sender = Some(sender);
        self.cancellation_sender = Some(cancellations);
        self.approval_sender = Some(approvals);
        self.workbench_events = cx.spawn(async move |this, cx| {
            while let Some(event) = receiver.recv().await {
                if this
                    .update(cx, |view, cx| view.apply_controller_event(event, cx))
                    .is_err()
                {
                    break;
                }
            }
        });
        cx.notify();
    }

    pub fn replace_startup(
        &mut self,
        projection: WorkbenchStartupProjection,
        theme: ThemePreference,
        cx: &mut Context<Self>,
    ) {
        self.projection = projection;
        self.theme = theme;
        self.retry_in_progress = false;
        cx.notify();
    }

    pub fn begin_shutdown(&mut self, cx: &mut Context<Self>) -> Option<StartupGeneration> {
        self.credential_dialog_open = false;
        self.credential_operation_active = false;
        self.credential_error = None;
        self.credential_input
            .update(cx, |input, cx| input.clear(cx));
        let effect = reduce_startup(&mut self.projection, StartupEvent::ShutdownRequested);
        cx.notify();
        match effect {
            Some(StartupEffect::BeginShutdown { generation }) => Some(generation),
            _ => None,
        }
    }

    pub fn complete_shutdown(&mut self, generation: StartupGeneration, cx: &mut Context<Self>) {
        let _ = reduce_startup(
            &mut self.projection,
            StartupEvent::ShutdownCompleted { generation },
        );
        cx.notify();
    }

    fn apply_controller_event(&mut self, event: WorkbenchControllerEvent, cx: &mut Context<Self>) {
        match event {
            WorkbenchControllerEvent::Snapshot(snapshot) => {
                if let Some(effect) = self
                    .terminal_surface
                    .set_workspace_generation(snapshot.workspace_generation)
                {
                    self.send_terminal_surface_effect_without_focus(effect);
                }
                self.terminal_surface.observe_terminal(
                    snapshot.workspace_generation,
                    snapshot.terminal_identity,
                    snapshot.terminal_status,
                );
                let generation = self.projection.generation;
                let _ = reduce_startup(
                    &mut self.projection,
                    StartupEvent::CredentialChanged {
                        generation,
                        state: snapshot.credentials,
                    },
                );
                let composer_enabled = snapshot.credentials == CredentialState::Ready
                    && snapshot.selected_session_id.is_some()
                    && !snapshot.session_read_only
                    && snapshot.workspace_available
                    && !snapshot.turn_active;
                self.composer.update(cx, |composer, cx| {
                    composer.set_enabled(composer_enabled, cx)
                });
                let terminal_enabled = matches!(
                    snapshot.terminal_status,
                    TerminalPanelStatus::Starting | TerminalPanelStatus::Running
                );
                self.terminal_composer.update(cx, |composer, cx| {
                    composer.set_enabled(terminal_enabled, cx)
                });
                if !snapshot.turn_active {
                    self.live_transcript = None;
                    self.live_key = None;
                }
                self.snapshot = Some(*snapshot);
            }
            WorkbenchControllerEvent::Runtime(event) => self.apply_runtime_event(event, cx),
            WorkbenchControllerEvent::CommandFinished {
                kind,
                succeeded,
                code,
            } => match kind {
                WorkbenchCommandKind::Credential => {
                    self.credential_operation_active = false;
                    if succeeded {
                        self.credential_dialog_open = false;
                        self.credential_error = None;
                        self.credential_input
                            .update(cx, |input, cx| input.clear(cx));
                    } else {
                        self.credential_error =
                            Some("The credential operation did not complete. Review the status.");
                    }
                }
                WorkbenchCommandKind::Workspace
                | WorkbenchCommandKind::Session
                | WorkbenchCommandKind::Turn
                | WorkbenchCommandKind::Terminal => {
                    self.workbench_error = if succeeded {
                        None
                    } else {
                        Some(code.unwrap_or("operation_failed"))
                    };
                }
            },
        }
        cx.notify();
    }

    fn apply_runtime_event(&mut self, event: RuntimeEvent, cx: &mut Context<Self>) {
        match event {
            RuntimeEvent::CredentialChanged { state } => {
                let generation = self.projection.generation;
                let _ = reduce_startup(
                    &mut self.projection,
                    StartupEvent::CredentialChanged { generation, state },
                );
            }
            RuntimeEvent::UserMessageCommitted {
                session_id,
                item_id,
                text,
                ..
            } => {
                self.presentation_generation = self.presentation_generation.saturating_add(1);
                let transcript = self
                    .live_transcript
                    .get_or_insert_with(|| TranscriptProjection::for_session(session_id));
                if transcript.session_id() != session_id {
                    *transcript = TranscriptProjection::for_session(session_id);
                }
                transcript.apply(TranscriptEvent::UserMessage { item_id, text });
            }
            RuntimeEvent::TurnPrepared { turn_id } => {
                self.active_turn_id = Some(turn_id);
                if let Some(transcript) = self.live_transcript.as_mut() {
                    transcript.apply(TranscriptEvent::Preparing { turn_id });
                }
                self.pending_approval = None;
                self.approval_response_pending = false;
                self.composer
                    .update(cx, |composer, cx| composer.set_enabled(false, cx));
                self.push_trace("Preparing turn");
            }
            RuntimeEvent::ModelStreamStarted {
                turn_id,
                request_id,
                model,
            } => {
                let key = ProvisionalKey {
                    turn_id,
                    request_id,
                    generation: self.presentation_generation,
                };
                self.live_key = Some(key);
                if let Some(transcript) = self.live_transcript.as_mut() {
                    transcript.apply(TranscriptEvent::RequestStarted {
                        turn_id,
                        request_id,
                    });
                }
                self.push_trace(format!("Thinking with {model}"));
            }
            RuntimeEvent::ReasoningDelta { text, .. } => {
                if let (Some(transcript), Some(key)) =
                    (self.live_transcript.as_mut(), self.live_key)
                {
                    transcript.apply(TranscriptEvent::ReasoningDelta { key, text });
                }
            }
            RuntimeEvent::TextDelta { text, .. } => {
                if let (Some(transcript), Some(key)) =
                    (self.live_transcript.as_mut(), self.live_key)
                {
                    transcript.apply(TranscriptEvent::TextDelta { key, text });
                }
            }
            RuntimeEvent::AssistantPhaseCompleted { turn_id, phase } => {
                if let (Some(transcript), Some(key)) =
                    (self.live_transcript.as_mut(), self.live_key)
                {
                    transcript.apply(TranscriptEvent::AssistantPhaseCompleted {
                        turn_id,
                        key,
                        phase: AssistantPhaseRecord::from(phase),
                    });
                }
            }
            RuntimeEvent::ToolValidated {
                turn_id,
                tool_call_id,
                name,
                ..
            } => {
                if let Some(transcript) = self.live_transcript.as_mut() {
                    transcript.apply(TranscriptEvent::ToolState {
                        turn_id,
                        tool_call_id,
                        state: ToolLifecycleState::Validated,
                    });
                }
                self.push_trace(format!("Validated tool: {name}"))
            }
            RuntimeEvent::ApprovalRequested {
                turn_id,
                approval_id,
                tool_call_id,
                effect_digest,
                summary,
            } => {
                self.pending_approval = Some(PendingApproval {
                    turn_id,
                    approval_id,
                    tool_call_id,
                    effect_digest,
                    summary,
                });
                self.approval_response_pending = false;
                if let Some(transcript) = self.live_transcript.as_mut() {
                    transcript.apply(TranscriptEvent::AwaitingApproval);
                    transcript.apply(TranscriptEvent::ToolState {
                        turn_id,
                        tool_call_id,
                        state: ToolLifecycleState::AwaitingApproval,
                    });
                }
                self.push_trace("Waiting for approval");
            }
            RuntimeEvent::ApprovalResolved { decision, .. } => {
                self.pending_approval = None;
                self.approval_response_pending = false;
                self.push_trace(format!("Approval: {decision:?}"));
            }
            RuntimeEvent::ToolStarted {
                turn_id,
                tool_call_id,
                name,
                ..
            } => {
                if let Some(transcript) = self.live_transcript.as_mut() {
                    transcript.apply(TranscriptEvent::RunningTool {
                        kind: tool_activity_kind(&name),
                    });
                    transcript.apply(TranscriptEvent::ToolState {
                        turn_id,
                        tool_call_id,
                        state: ToolLifecycleState::Running,
                    });
                }
                self.push_trace(format!("Running tool: {name}"))
            }
            RuntimeEvent::ToolCompleted {
                turn_id,
                tool_call_id,
                provider_call_id,
                name,
                output,
                status,
                ..
            } => {
                if let Some(transcript) = self.live_transcript.as_mut() {
                    transcript.apply(TranscriptEvent::ToolResult {
                        turn_id,
                        result: ToolResultRecord {
                            tool_call_id,
                            provider_call_id,
                            output,
                            status: tool_terminal_status(status),
                        },
                    });
                }
                self.push_trace(format!("Tool {name}: {status:?}"));
            }
            RuntimeEvent::ContinuationStarted { index, .. } => {
                if let Some(transcript) = self.live_transcript.as_mut() {
                    transcript.apply(TranscriptEvent::Continuing);
                }
                self.push_trace(format!("Continuation {}", index + 1))
            }
            RuntimeEvent::LimitReached { limit, .. } => {
                self.push_trace(format!("Limit reached: {limit:?}"))
            }
            RuntimeEvent::UsageUpdated { turn_id, usage } => {
                if let Some(transcript) = self.live_transcript.as_mut() {
                    transcript.apply(TranscriptEvent::Usage {
                        turn_id,
                        usage: UsageRecord {
                            prompt_tokens: usage.prompt_tokens,
                            cache_hit_tokens: usage.cache_hit_tokens,
                            cache_miss_tokens: usage.cache_miss_tokens,
                            output_tokens: usage.output_tokens,
                            reasoning_tokens: usage.reasoning_tokens,
                            total_tokens: usage.total_tokens,
                        },
                    });
                }
            }
            RuntimeEvent::TurnCompleted { turn_id } => {
                self.apply_live_terminal(turn_id, TerminalState::Completed, None);
                self.finish_turn("Turn completed", cx);
            }
            RuntimeEvent::TurnFailed { turn_id, code } => {
                self.apply_live_terminal(turn_id, TerminalState::Failed, Some(code));
                self.workbench_error = Some(code);
                self.finish_turn("Turn failed", cx);
            }
            RuntimeEvent::TurnCancelled { turn_id } => {
                self.apply_live_terminal(turn_id, TerminalState::Cancelled, None);
                self.finish_turn("Turn cancelled", cx);
            }
            RuntimeEvent::TurnInterrupted { turn_id } => {
                self.apply_live_terminal(turn_id, TerminalState::Interrupted, None);
                self.finish_turn("Turn interrupted", cx);
            }
            RuntimeEvent::TurnUncertain { turn_id } => {
                self.apply_live_terminal(turn_id, TerminalState::Uncertain, None);
                self.finish_turn("Turn outcome uncertain", cx);
            }
            RuntimeEvent::StartupReady { .. } | RuntimeEvent::SessionLoaded { .. } => {}
        }
    }

    fn apply_live_terminal(&mut self, turn_id: TurnId, state: TerminalState, code: Option<&str>) {
        let Some(transcript) = self.live_transcript.as_mut() else {
            return;
        };
        transcript.apply(match state {
            TerminalState::Completed => TranscriptEvent::TurnCompleted { turn_id },
            TerminalState::Failed => TranscriptEvent::TurnFailed {
                turn_id,
                code: code.unwrap_or("turn_failed").to_owned(),
            },
            TerminalState::Cancelled => TranscriptEvent::TurnCancelled { turn_id },
            TerminalState::Interrupted => TranscriptEvent::TurnInterrupted { turn_id },
            TerminalState::Uncertain => TranscriptEvent::TurnUncertain { turn_id },
        });
    }

    fn push_trace(&mut self, line: impl Into<String>) {
        if self.trace.len() >= 256 {
            self.trace.pop_front();
        }
        self.trace.push_back(line.into());
    }

    fn finish_turn(&mut self, label: &'static str, cx: &mut Context<Self>) {
        self.push_trace(label);
        self.active_turn_id = None;
        self.pending_approval = None;
        self.approval_response_pending = false;
        let enabled = self.snapshot.as_ref().is_some_and(|snapshot| {
            snapshot.credentials == CredentialState::Ready
                && snapshot.selected_session_id.is_some()
                && !snapshot.session_read_only
                && snapshot.workspace_available
        });
        self.composer
            .update(cx, |composer, cx| composer.set_enabled(enabled, cx));
    }

    fn open_credential_dialog(
        &mut self,
        _: &gpui::ClickEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.show_credential_dialog(window, cx);
    }

    fn show_credential_dialog(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.command_sender.is_none() || self.credential_operation_active {
            return;
        }
        self.credential_dialog_open = true;
        self.credential_error = None;
        self.credential_input
            .read(cx)
            .focus_handle(cx)
            .focus(window, cx);
        cx.notify();
    }

    fn focus_navigation(
        &mut self,
        _: &FocusNavigation,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.reveal_pane(WorkbenchPane::Navigation);
        self.navigation_focus.focus(window, cx);
    }

    fn focus_chat(&mut self, _: &FocusChat, window: &mut Window, cx: &mut Context<Self>) {
        self.chat_focus.focus(window, cx);
    }

    fn focus_inspection(
        &mut self,
        _: &FocusInspection,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.reveal_pane(WorkbenchPane::Inspection);
        self.inspection_focus.focus(window, cx);
    }

    fn focus_terminal(&mut self, _: &FocusTerminal, window: &mut Window, cx: &mut Context<Self>) {
        self.terminal_focus.focus(window, cx);
    }

    // The terminal actor owns process lifecycle. This action is intentionally a presentation
    // transition only; the terminal-surface reducer decides whether a first, dimension-checked
    // creation request is required after reveal.
    fn toggle_terminal_surface(
        &mut self,
        _: &ToggleTerminalSurface,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.terminal_surface.visible() {
            for effect in self.terminal_surface.toggle(None) {
                self.apply_terminal_surface_effect(effect, window, cx);
            }
            self.toggle_pane(WorkbenchPane::Terminal);
            cx.notify();
            return;
        }
        self.reveal_pane(WorkbenchPane::Terminal);
        // The viewport is valid only after a real window exists. This conservative conversion
        // establishes nonzero clamped PTY dimensions without granting the view process authority.
        let viewport = window.viewport_size();
        let dimensions = TerminalSurfaceDimensions::new(
            (viewport.width.as_f32() / 8.0).clamp(1.0, 512.0) as u16,
            (viewport.height.as_f32() / 18.0).clamp(1.0, 256.0) as u16,
            viewport.width.as_f32().clamp(1.0, 4096.0) as u16,
            viewport.height.as_f32().clamp(1.0, 4096.0) as u16,
        );
        if let Some(effect) = self.terminal_surface.set_dimensions(dimensions) {
            self.apply_terminal_surface_effect(effect, window, cx);
        }
        for effect in self
            .terminal_surface
            .toggle(Some(TerminalRestoreFocus::Chat))
        {
            self.apply_terminal_surface_effect(effect, window, cx);
        }
        cx.notify();
    }

    fn apply_terminal_surface_effect(
        &mut self,
        effect: TerminalSurfaceEffect,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match effect {
            TerminalSurfaceEffect::FocusTerminal => self.terminal_focus.focus(window, cx),
            TerminalSurfaceEffect::RestoreFocus(target) => match target {
                TerminalRestoreFocus::Navigation => self.navigation_focus.focus(window, cx),
                TerminalRestoreFocus::Chat => self.chat_focus.focus(window, cx),
                TerminalRestoreFocus::Inspection => self.inspection_focus.focus(window, cx),
                TerminalRestoreFocus::Files => self.files_focus.focus(window, cx),
            },
            TerminalSurfaceEffect::CreateTerminal {
                workspace_generation,
                dimensions,
            } => self.send_terminal_surface_command(WorkbenchCommand::CreateTerminal {
                workspace_generation,
                dimensions,
            }),
            TerminalSurfaceEffect::RestartTerminal {
                workspace_generation,
                identity,
                dimensions,
            } => self.send_terminal_surface_command(WorkbenchCommand::RestartTerminal {
                workspace_generation,
                terminal_identity: identity,
                dimensions,
            }),
            TerminalSurfaceEffect::ResizeTerminal {
                workspace_generation,
                identity,
                dimensions,
            } => self.send_terminal_surface_command(WorkbenchCommand::ResizeTerminal {
                workspace_generation,
                terminal_identity: identity,
                dimensions,
            }),
        }
    }

    fn send_terminal_surface_command(&mut self, command: WorkbenchCommand) {
        if self
            .command_sender
            .as_ref()
            .is_none_or(|sender| sender.try_send(command).is_err())
        {
            self.workbench_error = Some("terminal_busy");
        }
    }

    fn send_terminal_surface_effect_without_focus(&mut self, effect: TerminalSurfaceEffect) {
        match effect {
            TerminalSurfaceEffect::CreateTerminal {
                workspace_generation,
                dimensions,
            } => self.send_terminal_surface_command(WorkbenchCommand::CreateTerminal {
                workspace_generation,
                dimensions,
            }),
            TerminalSurfaceEffect::RestartTerminal {
                workspace_generation,
                identity,
                dimensions,
            } => self.send_terminal_surface_command(WorkbenchCommand::RestartTerminal {
                workspace_generation,
                terminal_identity: identity,
                dimensions,
            }),
            TerminalSurfaceEffect::ResizeTerminal {
                workspace_generation,
                identity,
                dimensions,
            } => self.send_terminal_surface_command(WorkbenchCommand::ResizeTerminal {
                workspace_generation,
                terminal_identity: identity,
                dimensions,
            }),
            TerminalSurfaceEffect::FocusTerminal | TerminalSurfaceEffect::RestoreFocus(_) => {}
        }
    }

    fn focus_files(&mut self, _: &FocusFiles, window: &mut Window, cx: &mut Context<Self>) {
        self.reveal_pane(WorkbenchPane::Files);
        self.files_focus.focus(window, cx);
    }

    fn toggle_navigation_surface(
        &mut self,
        _: &ToggleNavigationSurface,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.toggle_pane(WorkbenchPane::Navigation);
        cx.notify();
    }

    fn toggle_inspection_surface(
        &mut self,
        _: &ToggleInspectionSurface,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.toggle_pane(WorkbenchPane::Inspection);
        cx.notify();
    }

    fn toggle_files_surface(
        &mut self,
        _: &ToggleFilesSurface,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.toggle_pane(WorkbenchPane::Files);
        cx.notify();
    }

    fn click_toggle_navigation(
        &mut self,
        _: &gpui::ClickEvent,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.toggle_pane(WorkbenchPane::Navigation);
        cx.notify();
    }

    fn click_toggle_inspection(
        &mut self,
        _: &gpui::ClickEvent,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.toggle_pane(WorkbenchPane::Inspection);
        cx.notify();
    }

    fn click_toggle_files(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        self.toggle_pane(WorkbenchPane::Files);
        cx.notify();
    }

    fn click_toggle_terminal(
        &mut self,
        _: &gpui::ClickEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.toggle_terminal_surface(&ToggleTerminalSurface, window, cx);
    }

    fn reset_chat_first_layout(
        &mut self,
        _: &gpui::ClickEvent,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.persist_pane_presentation(
            PaneVisibilityPreferences::default(),
            PaneFractionsV2::default(),
        );
        cx.notify();
    }

    fn reveal_pane(&mut self, pane: WorkbenchPane) {
        let Some(snapshot) = self.snapshot.as_ref() else {
            return;
        };
        let mut visibility = snapshot.pane_visibility;
        match pane {
            WorkbenchPane::Navigation => visibility.navigation = true,
            WorkbenchPane::Inspection => visibility.inspection = true,
            WorkbenchPane::Files => visibility.files = true,
            WorkbenchPane::Terminal => visibility.terminal = true,
        }
        self.persist_pane_presentation(visibility, snapshot.pane_fractions);
    }

    fn toggle_pane(&mut self, pane: WorkbenchPane) {
        let Some(snapshot) = self.snapshot.as_ref() else {
            return;
        };
        let mut visibility = snapshot.pane_visibility;
        match pane {
            WorkbenchPane::Navigation => visibility.navigation = !visibility.navigation,
            WorkbenchPane::Inspection => visibility.inspection = !visibility.inspection,
            WorkbenchPane::Files => visibility.files = !visibility.files,
            WorkbenchPane::Terminal => visibility.terminal = !visibility.terminal,
        }
        self.persist_pane_presentation(visibility, snapshot.pane_fractions);
    }

    fn toggle_lifecycle_disclosure(&mut self, id: RowId, cx: &mut Context<Self>) {
        let Some(transcript) = self.live_transcript.as_mut() else {
            return;
        };
        let default_expanded = transcript
            .lifecycle(&id)
            .is_some_and(|lifecycle| lifecycle.disclosure == Disclosure::Expanded);
        let currently_expanded = default_expanded || transcript.lifecycle_is_expanded(&id);
        if currently_expanded {
            // Default-expanded rows stay expanded; user overrides only expand collapsed rows.
            if !default_expanded {
                transcript.set_lifecycle_expanded(id, false);
            }
        } else {
            transcript.set_lifecycle_expanded(id, true);
        }
        cx.notify();
    }

    fn toggle_reasoning_disclosure(&mut self, phase_item_id: ItemId, cx: &mut Context<Self>) {
        if self.expanded_reasoning.contains(&phase_item_id) {
            self.expanded_reasoning.remove(&phase_item_id);
        } else if self.expanded_reasoning.len() < MAX_REASONING_EXPANSIONS {
            self.expanded_reasoning.insert(phase_item_id);
        }
        cx.notify();
    }

    fn persist_pane_presentation(
        &mut self,
        visibility: PaneVisibilityPreferences,
        fractions: PaneFractionsV2,
    ) {
        if self.command_sender.as_ref().is_none_or(|sender| {
            sender
                .try_send(WorkbenchCommand::SetPanePresentation {
                    visibility,
                    fractions,
                })
                .is_err()
        }) {
            self.workbench_error = Some("pane_preferences_busy");
        }
    }

    fn render_terminal_pane(
        &self,
        visible: bool,
        palette: SemanticPalette,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let terminal_status = self
            .snapshot
            .as_ref()
            .map_or(TerminalPanelStatus::Inactive, |snapshot| {
                snapshot.terminal_status
            });
        let terminal_rows = self
            .snapshot
            .as_ref()
            .and_then(|snapshot| snapshot.terminal.as_ref())
            .map_or_else(Vec::new, |terminal| terminal.visible_rows.clone());
        let can_start = self
            .snapshot
            .as_ref()
            .is_some_and(|snapshot| snapshot.workspace_available)
            && matches!(
                terminal_status,
                TerminalPanelStatus::Inactive | TerminalPanelStatus::Closed
            );
        let can_control = matches!(
            terminal_status,
            TerminalPanelStatus::Starting | TerminalPanelStatus::Running
        );
        div()
            .id("terminal-pane")
            .aria_label("User terminal")
            .track_focus(&self.terminal_focus)
            .h(px(if visible { TERMINAL_PANE_HEIGHT } else { 0.0 }))
            .flex_none()
            .min_h_0()
            .when(!visible, |terminal| terminal.overflow_hidden())
            .flex()
            .flex_col()
            .bg(palette.background)
            .border_t_1()
            .border_color(palette.separator)
            .child(
                div()
                    .h(px(34.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_between()
                    .px_3()
                    .gap_2()
                    .bg(palette.surface)
                    .border_b_1()
                    .border_color(palette.separator)
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_2()
                            .child(
                                div()
                                    .h(px(8.0))
                                    .w(px(8.0))
                                    .rounded_full()
                                    .flex_none()
                                    .when(
                                        matches!(terminal_status, TerminalPanelStatus::Running),
                                        |dot| dot.bg(palette.success),
                                    )
                                    .when(
                                        !matches!(terminal_status, TerminalPanelStatus::Running),
                                        |dot| dot.bg(palette.muted_text),
                                    ),
                            )
                            .child(
                                div()
                                    .text_xs()
                                    .font_weight(gpui::FontWeight::MEDIUM)
                                    .text_color(palette.muted_text)
                                    .child(format!(
                                        "Terminal · {}",
                                        terminal_status_label(terminal_status)
                                    )),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .gap_1()
                            .child(
                                outline_button(
                                    "start-terminal",
                                    "Start",
                                    "Start or restart terminal",
                                    palette,
                                    !can_start,
                                )
                                .when(can_start, |button| {
                                    button
                                        .hover(move |style| style.bg(palette.hover))
                                        .on_click(cx.listener(Self::start_terminal))
                                }),
                            )
                            .child(
                                outline_button(
                                    "interrupt-terminal",
                                    "Interrupt",
                                    "Interrupt terminal command",
                                    palette,
                                    !can_control,
                                )
                                .when(can_control, |button| {
                                    button
                                        .hover(move |style| style.bg(palette.hover))
                                        .on_click(cx.listener(Self::interrupt_terminal))
                                }),
                            )
                            .child(
                                outline_button(
                                    "close-terminal",
                                    "Close",
                                    "Close terminal",
                                    palette,
                                    !can_control,
                                )
                                .when(can_control, |button| {
                                    button
                                        .hover(move |style| style.bg(palette.hover))
                                        .on_click(cx.listener(Self::close_terminal))
                                }),
                            ),
                    ),
            )
            .child(
                div()
                    .id("terminal-output")
                    .aria_label("Terminal output")
                    .flex_1()
                    .min_h_0()
                    .overflow_scroll()
                    .px_3()
                    .py_2()
                    .text_sm()
                    .children(terminal_rows.into_iter().map(|row| {
                        div().child(if row.is_empty() {
                            " ".to_owned()
                        } else {
                            row
                        })
                    })),
            )
            .when(can_control, |terminal| {
                terminal.child(
                    div()
                        .h(px(44.0))
                        .flex_none()
                        .border_t_1()
                        .border_color(palette.separator)
                        .child(self.terminal_composer.clone()),
                )
            })
    }

    fn open_credential_settings(
        &mut self,
        _: &OpenCredentialSettings,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.show_credential_dialog(window, cx);
    }

    fn dismiss_credential_dialog(
        &mut self,
        _: &gpui::ClickEvent,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.credential_operation_active {
            return;
        }
        self.credential_dialog_open = false;
        self.credential_error = None;
        self.credential_input
            .update(cx, |input, cx| input.clear(cx));
        cx.notify();
    }

    fn submit_credential(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        if self.credential_operation_active {
            return;
        }
        let Some(sender) = self.command_sender.as_ref() else {
            return;
        };
        let Some(candidate) = self
            .credential_input
            .update(cx, |input, cx| input.take_secret(cx))
        else {
            self.credential_error = Some("Enter a credential before validating.");
            cx.notify();
            return;
        };
        match sender.try_send(WorkbenchCommand::InstallCredential { candidate }) {
            Ok(()) => {
                self.credential_operation_active = true;
                self.credential_error = None;
            }
            Err(error) => {
                drop(error);
                self.credential_error =
                    Some("Credential validation is busy or unavailable. Try again.");
            }
        }
        cx.notify();
    }

    fn remove_credential(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        if self.credential_operation_active {
            return;
        }
        let Some(sender) = self.command_sender.as_ref() else {
            return;
        };
        match sender.try_send(WorkbenchCommand::RemoveCredential) {
            Ok(()) => {
                self.credential_operation_active = true;
                self.credential_error = None;
            }
            Err(error) => {
                drop(error);
                self.credential_error =
                    Some("Credential removal is busy or unavailable. Try again.");
            }
        }
        cx.notify();
    }

    fn send_prompt(&mut self, text: String, cx: &mut Context<Self>) {
        let Some(sender) = self.command_sender.as_ref() else {
            self.composer.update(cx, |composer, cx| {
                let _ = composer.set_text(text, cx);
            });
            self.workbench_error = Some("runtime_unavailable");
            return;
        };
        match sender.try_send(WorkbenchCommand::SendPrompt { text }) {
            Ok(()) => {
                self.workbench_error = None;
                self.composer
                    .update(cx, |composer, cx| composer.set_enabled(false, cx));
            }
            Err(error) => {
                let WorkbenchCommand::SendPrompt { text } = error.into_inner() else {
                    return;
                };
                self.composer.update(cx, |composer, cx| {
                    let _ = composer.set_text(text, cx);
                });
                self.workbench_error = Some("runtime_busy");
            }
        }
        cx.notify();
    }

    fn send_terminal_input(&mut self, text: String, cx: &mut Context<Self>) {
        let mut bytes = text.into_bytes();
        bytes.push(b'\n');
        let result = self.command_sender.as_ref().ok_or(()).and_then(|sender| {
            sender
                .try_send(WorkbenchCommand::TerminalInput {
                    bytes: bytes.clone(),
                })
                .map_err(|_| ())
        });
        if result.is_err() {
            let text =
                String::from_utf8_lossy(&bytes[..bytes.len().saturating_sub(1)]).into_owned();
            self.terminal_composer.update(cx, |composer, cx| {
                let _ = composer.set_text(text, cx);
            });
            self.workbench_error = Some("terminal_busy");
        } else {
            self.workbench_error = None;
        }
        cx.notify();
    }

    fn start_terminal(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        let result = self.command_sender.as_ref().ok_or(()).and_then(|sender| {
            sender
                .try_send(WorkbenchCommand::StartTerminal)
                .map_err(|_| ())
        });
        self.workbench_error = result.err().map(|_| "terminal_busy");
        cx.notify();
    }

    fn interrupt_terminal(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        let result = self.command_sender.as_ref().ok_or(()).and_then(|sender| {
            sender
                .try_send(WorkbenchCommand::InterruptTerminal)
                .map_err(|_| ())
        });
        self.workbench_error = result.err().map(|_| "terminal_busy");
        cx.notify();
    }

    fn close_terminal(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        let result = self.command_sender.as_ref().ok_or(()).and_then(|sender| {
            sender
                .try_send(WorkbenchCommand::CloseTerminal)
                .map_err(|_| ())
        });
        self.workbench_error = result.err().map(|_| "terminal_busy");
        cx.notify();
    }

    fn choose_workspace(
        &mut self,
        _: &gpui::ClickEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(sender) = self.command_sender.clone() else {
            return;
        };
        if self.active_turn_id.is_some() {
            self.workbench_error = Some("turn_active");
            cx.notify();
            return;
        }
        let selection = cx.prompt_for_paths(PathPromptOptions {
            files: false,
            directories: true,
            multiple: false,
            prompt: Some("Open workspace".into()),
        });
        cx.spawn_in(window, async move |this, window| {
            let path = selection.await.ok()?.ok()??.into_iter().next()?;
            this.update(window, |view, cx| {
                match sender.try_send(WorkbenchCommand::OpenWorkspace { path }) {
                    Ok(()) => view.workbench_error = None,
                    Err(_) => view.workbench_error = Some("runtime_busy"),
                }
                cx.notify();
            })
            .ok()
        })
        .detach();
    }

    fn new_session(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        let result = self.command_sender.as_ref().ok_or(()).and_then(|sender| {
            sender
                .try_send(WorkbenchCommand::NewSession)
                .map_err(|_| ())
        });
        self.workbench_error = result.err().map(|_| "runtime_busy");
        cx.notify();
    }

    fn cancel_turn(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        let result = self
            .active_turn_id
            .zip(self.cancellation_sender.as_ref())
            .ok_or(())
            .and_then(|(turn_id, sender)| sender.try_send(turn_id).map_err(|_| ()));
        if result.is_ok() {
            self.push_trace("Cancelling turn…");
        } else {
            self.workbench_error = Some("cancel_unavailable");
        }
        cx.notify();
    }

    fn approve(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        self.resolve_pending_approval(ApprovalDecision::Approved, cx);
    }

    fn deny(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        self.resolve_pending_approval(ApprovalDecision::Denied, cx);
    }

    fn resolve_pending_approval(&mut self, decision: ApprovalDecision, cx: &mut Context<Self>) {
        if self.approval_response_pending {
            return;
        }
        let Some(pending) = self.pending_approval.clone() else {
            self.workbench_error = Some("stale_approval");
            cx.notify();
            return;
        };
        let response = ApprovalResponse {
            turn_id: pending.turn_id,
            approval_id: pending.approval_id,
            tool_call_id: pending.tool_call_id,
            effect_digest: pending.effect_digest,
            decision,
        };
        let result = self
            .approval_sender
            .as_ref()
            .ok_or(())
            .and_then(|sender| sender.try_send(response).map_err(|_| ()));
        if result.is_ok() {
            // Keep the exact card visible until the runtime emits ApprovalResolved. Submission
            // only proves that the bounded UI channel accepted the response, not that the
            // coordinator accepted its identities or decision.
            self.approval_response_pending = true;
            self.push_trace("Approval response submitted; awaiting confirmation");
        } else {
            self.workbench_error = Some("approval_unavailable");
        }
        cx.notify();
    }

    fn retry_lock(&mut self, _: &gpui::ClickEvent, window: &mut Window, cx: &mut Context<Self>) {
        if self.retry_in_progress {
            return;
        }
        let Some(retry_action) = self.retry_action.clone() else {
            return;
        };
        if reduce_startup(&mut self.projection, StartupEvent::RetryLock).is_none() {
            return;
        }
        self.retry_in_progress = true;
        cx.notify();
        retry_action(self.projection.clone(), cx.entity().downgrade(), window, cx);
    }

    fn status_text(&self) -> &'static str {
        if self.retry_in_progress {
            return "Retrying the local application-state lock…";
        }
        if matches!(
            self.projection.state,
            NativeStartupState::ReadyOffline
                | NativeStartupState::NeedsCredential
                | NativeStartupState::CredentialUnavailable
                | NativeStartupState::Ready
        ) && let Some(snapshot) = self.snapshot.as_ref()
        {
            return match snapshot.credentials {
                CredentialState::Ready
                    if snapshot.selected_session_id.is_some() && snapshot.workspace_available =>
                {
                    "Pho Code is ready."
                }
                CredentialState::Ready => "Local workbench ready. Select a session to send.",
                CredentialState::Installing | CredentialState::Validating => {
                    "Validating the DeepSeek credential…"
                }
                CredentialState::Missing
                | CredentialState::Invalid
                | CredentialState::Malformed => {
                    "Local workbench ready. A DeepSeek credential is required to send."
                }
                CredentialState::TemporarilyUnavailable | CredentialState::RemovalFailed => {
                    "Local workbench ready. Credential service is temporarily unavailable."
                }
            };
        }
        match self.projection.state {
            NativeStartupState::Booting => "Starting Pho Code…",
            NativeStartupState::LockUnavailable => {
                "Another Pho Code process owns local application state."
            }
            NativeStartupState::LoadingPreferences => "Loading workbench preferences…",
            NativeStartupState::ScanningSessions => "Scanning local sessions…",
            NativeStartupState::InspectingCredentials => "Inspecting credential status…",
            NativeStartupState::RestoringSelection => "Restoring local selection…",
            NativeStartupState::ReadyOffline => "Local workbench ready. Select a session to send.",
            NativeStartupState::NeedsCredential => {
                "Local workbench ready. A DeepSeek credential is required to send."
            }
            NativeStartupState::CredentialUnavailable => {
                "Local workbench ready. Credential service is temporarily unavailable."
            }
            NativeStartupState::Ready => "Pho Code is ready.",
            NativeStartupState::ShuttingDown => "Shutting down safely…",
            NativeStartupState::Terminated => "Pho Code stopped.",
            NativeStartupState::Failed => "Pho Code could not initialize local services.",
        }
    }
}

impl Render for StartupView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl gpui::IntoElement {
        window.set_window_title("Pho Code");
        let palette = SemanticPalette::for_window(self.theme, window.appearance());
        let layout = layout_for_width(window.viewport_size().width.as_f32());
        let terminal_surface_visible = self.terminal_surface.visible();
        let pane_visibility = self
            .snapshot
            .as_ref()
            .map(|snapshot| snapshot.pane_visibility)
            .unwrap_or_default();
        let pane_fractions = self
            .snapshot
            .as_ref()
            .map(|snapshot| snapshot.pane_fractions)
            .unwrap_or_default();
        let viewport_width = window.viewport_size().width.as_f32();
        let navigation_visible = pane_visibility.navigation && !layout.navigation_collapsed;
        let inspection_visible = pane_visibility.inspection;
        let files_visible = pane_visibility.files && !layout.file_tree_collapsed;
        let navigation_width = if !navigation_visible {
            0.0
        } else if layout.navigation_collapsed {
            COLLAPSED_REGION_WIDTH
        } else {
            (viewport_width * pane_fractions.navigation as f32)
                .clamp(NAVIGATION_MIN_WIDTH, NAVIGATION_MAX_WIDTH)
        };
        let file_tree_width = if !files_visible {
            0.0
        } else if layout.file_tree_collapsed {
            COLLAPSED_REGION_WIDTH
        } else {
            (viewport_width * pane_fractions.files as f32).clamp(160.0, 300.0)
        };
        let inspection_width =
            (viewport_width * pane_fractions.inspection as f32).clamp(320.0, 760.0);
        div()
            .id("pho-workbench")
            .aria_label("Pho Code native workbench")
            .size_full()
            .flex()
            .flex_col()
            .bg(palette.background)
            .text_color(palette.text)
            .font_family(WORKBENCH_FONT_FAMILY)
            .on_action(cx.listener(Self::focus_navigation))
            .on_action(cx.listener(Self::focus_chat))
            .on_action(cx.listener(Self::focus_inspection))
            .on_action(cx.listener(Self::focus_terminal))
            .on_action(cx.listener(Self::toggle_terminal_surface))
            .on_action(cx.listener(Self::focus_files))
            .on_action(cx.listener(Self::toggle_navigation_surface))
            .on_action(cx.listener(Self::toggle_inspection_surface))
            .on_action(cx.listener(Self::toggle_files_surface))
            .on_action(cx.listener(Self::open_credential_settings))
            .child(
                div()
                    .id("workbench-status")
                    .aria_label(self.status_text())
                    .h(px(44.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .px_4()
                    .bg(palette.background)
                    .border_b_1()
                    .border_color(palette.separator)
                    .text_sm()
                    .justify_between()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_2()
                            .child(
                                div()
                                    .font_weight(gpui::FontWeight::SEMIBOLD)
                                    .text_color(palette.text)
                                    .child("pho"),
                            )
                            .child(
                                div()
                                    .text_color(palette.muted_text)
                                    .child(self.status_text()),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_1()
                            .child(
                                pane_toggle_button(
                                    "toggle-navigation-button",
                                    "Nav",
                                    "Toggle navigation",
                                    pane_visibility.navigation,
                                    palette,
                                )
                                .on_click(cx.listener(Self::click_toggle_navigation)),
                            )
                            .child(
                                pane_toggle_button(
                                    "toggle-inspection-button",
                                    "Inspect",
                                    "Toggle editor",
                                    pane_visibility.inspection,
                                    palette,
                                )
                                .on_click(cx.listener(Self::click_toggle_inspection)),
                            )
                            .child(
                                pane_toggle_button(
                                    "toggle-files-button",
                                    "Files",
                                    "Toggle files",
                                    pane_visibility.files,
                                    palette,
                                )
                                .on_click(cx.listener(Self::click_toggle_files)),
                            )
                            .child(
                                pane_toggle_button(
                                    "toggle-terminal-button",
                                    "Terminal",
                                    "Toggle terminal (Control-backtick)",
                                    terminal_surface_visible,
                                    palette,
                                )
                                .on_click(cx.listener(Self::click_toggle_terminal)),
                            )
                            .child(
                                pane_toggle_button(
                                    "reset-layout-button",
                                    "Chat only",
                                    "Reset to chat-first layout",
                                    false,
                                    palette,
                                )
                                .on_click(cx.listener(Self::reset_chat_first_layout)),
                            ),
                    )
                    .when(
                        self.projection.state == NativeStartupState::LockUnavailable,
                        |header| {
                            header.child(
                                outline_button(
                                    "retry-application-lock",
                                    if self.retry_in_progress {
                                        "Retrying…"
                                    } else {
                                        "Retry"
                                    },
                                    "Retry opening Pho Code",
                                    palette,
                                    self.retry_in_progress,
                                )
                                .when(!self.retry_in_progress, |button| {
                                    button
                                        .hover(move |style| style.bg(palette.surface))
                                        .on_click(cx.listener(Self::retry_lock))
                                }),
                            )
                        },
                    )
                    .when(
                        matches!(
                            self.projection.state,
                            NativeStartupState::ReadyOffline
                                | NativeStartupState::NeedsCredential
                                | NativeStartupState::CredentialUnavailable
                                | NativeStartupState::Ready
                        ) && self.command_sender.is_some(),
                        |header| {
                            header.child(
                                outline_button(
                                    "open-credential-dialog",
                                    "Credential",
                                    "Open DeepSeek credential settings",
                                    palette,
                                    false,
                                )
                                .cursor_pointer()
                                .hover(move |style| style.bg(palette.surface))
                                .on_click(cx.listener(Self::open_credential_dialog)),
                            )
                        },
                    ),
            )
            .child(
                div()
                    .id("workbench-regions")
                    .aria_label("Workbench regions")
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .child({
                        let workspaces = self
                            .snapshot
                            .as_ref()
                            .map_or_else(Vec::new, |snapshot| snapshot.workspaces.clone());
                        let sessions = self
                            .snapshot
                            .as_ref()
                            .map_or_else(Vec::new, |snapshot| snapshot.sessions.clone());
                        let mut navigation = pane_header(
                            if layout.navigation_collapsed {
                                "W"
                            } else {
                                "Nav"
                            },
                            "Registered workspaces and recent sessions",
                            palette,
                        )
                        .w(px(navigation_width))
                        .when(!navigation_visible, |navigation| navigation.overflow_hidden())
                        .track_focus(&self.navigation_focus)
                        .flex_none()
                        .border_r_1()
                        .border_color(palette.separator);
                        if navigation_visible && !layout.navigation_collapsed {
                            navigation = navigation.child(
                                div()
                                    .px_2()
                                    .py_1p5()
                                    .flex()
                                    .flex_col()
                                    .gap_0p5()
                                    .child(
                                        outline_button(
                                            "open-workspace",
                                            "Open…",
                                            "Open workspace folder",
                                            palette,
                                            false,
                                        )
                                        .w_full()
                                        .hover(move |style| style.bg(palette.hover))
                                        .on_click(cx.listener(Self::choose_workspace)),
                                    )
                                    .child(
                                        div()
                                            .pt_1p5()
                                            .pb_0p5()
                                            .text_xs()
                                            .font_weight(gpui::FontWeight::MEDIUM)
                                            .text_color(palette.muted_text)
                                            .child("Workspaces"),
                                    )
                                    .children(workspaces.into_iter().map(|workspace| {
                                        let sender = self.command_sender.clone();
                                        let selected = workspace.selected;
                                        let display_name = workspace.display_name.clone();
                                        div()
                                            .id(workspace.registration_id.to_string())
                                            .role(gpui::Role::Button)
                                            .aria_label(format!(
                                                "Select workspace {}",
                                                display_name
                                            ))
                                            .px_1p5()
                                            .py_1()
                                            .rounded_sm()
                                            .text_sm()
                                            .relative()
                                            .overflow_hidden()
                                            .when(selected, |row| row.bg(palette.selected))
                                            .when(!selected, |row| {
                                                row.cursor_pointer().hover(move |style| {
                                                    style.bg(palette.hover)
                                                })
                                            })
                                            .when(selected, |row| {
                                                row.child(
                                                    div()
                                                        .absolute()
                                                        .left_0()
                                                        .top_0()
                                                        .bottom_0()
                                                        .w(px(2.0))
                                                        .bg(palette.focus),
                                                )
                                            })
                                            .on_click(move |_, _, _| {
                                                if let Some(sender) = sender.as_ref() {
                                                    let _ = sender.try_send(
                                                        WorkbenchCommand::SelectWorkspace {
                                                            registration_id:
                                                                workspace.registration_id,
                                                        },
                                                    );
                                                }
                                            })
                                            .child(display_name)
                                    }))
                                    .when(
                                        self.snapshot
                                            .as_ref()
                                            .is_some_and(|snapshot| {
                                                snapshot.selected_registration_id.is_some()
                                            }),
                                        |list| {
                                            list.child(
                                                div()
                                                    .pt_2()
                                                    .pb_0p5()
                                                    .text_xs()
                                                    .font_weight(gpui::FontWeight::MEDIUM)
                                                    .text_color(palette.muted_text)
                                                    .child("Chats"),
                                            )
                                            .child(
                                                outline_button(
                                                    "new-session",
                                                    "+ New",
                                                    "Create new chat session",
                                                    palette,
                                                    false,
                                                )
                                                .w_full()
                                                .hover(move |style| style.bg(palette.hover))
                                                .on_click(cx.listener(Self::new_session)),
                                            )
                                        },
                                    )
                                    .children(sessions.into_iter().map(|session| {
                                        let sender = self.command_sender.clone();
                                        let selected = session.selected;
                                        let read_only = session.read_only;
                                        let title = session.title.clone();
                                        div()
                                            .id(session.session_id.to_string())
                                            .role(gpui::Role::Button)
                                            .aria_label(format!("Open chat session {}", title))
                                            .px_1p5()
                                            .py_1()
                                            .pl_2()
                                            .rounded_sm()
                                            .text_sm()
                                            .relative()
                                            .overflow_hidden()
                                            .when(selected, |row| row.bg(palette.selected))
                                            .when(!selected, |row| {
                                                row.cursor_pointer().hover(move |style| {
                                                    style.bg(palette.hover)
                                                })
                                            })
                                            .when(selected, |row| {
                                                row.child(
                                                    div()
                                                        .absolute()
                                                        .left_0()
                                                        .top_0()
                                                        .bottom_0()
                                                        .w(px(2.0))
                                                        .bg(palette.focus),
                                                )
                                            })
                                            .when(read_only, |row| {
                                                row.text_color(palette.muted_text)
                                            })
                                            .on_click(move |_, _, _| {
                                                if let Some(sender) = sender.as_ref() {
                                                    let _ = sender.try_send(
                                                        WorkbenchCommand::OpenSession {
                                                            session_id: session.session_id,
                                                        },
                                                    );
                                                }
                                            })
                                            .child(title)
                                    })),
                            );
                        }
                        navigation
                    })
                    .child({
                        let messages = self
                            .snapshot
                            .as_ref()
                            .map_or_else(Vec::new, |snapshot| snapshot.messages.clone());
                        let live_rows = self
                            .live_transcript
                            .as_ref()
                            .map_or_else(Vec::new, |transcript| transcript.rows().to_vec());
                        let live_verb = self
                            .live_transcript
                            .as_ref()
                            .map(|transcript| transcript.product_verb());
                        let expanded_tool_ids = self
                            .live_transcript
                            .as_ref()
                            .map(|transcript| {
                                live_rows
                                    .iter()
                                    .filter_map(|row| match row {
                                        TranscriptRow::ToolCallGroup { id, .. } => {
                                            let lifecycle = transcript.lifecycle(id)?;
                                            let expanded = lifecycle.disclosure
                                                == Disclosure::Expanded
                                                || transcript.lifecycle_is_expanded(id);
                                            expanded.then(|| id.clone())
                                        }
                                        _ => None,
                                    })
                                    .collect::<HashSet<_>>()
                            })
                            .unwrap_or_default();
                        let approval = self.pending_approval.clone();
                        let approval_response_pending = self.approval_response_pending;
                        let expanded_reasoning = self.expanded_reasoning.clone();
                        pane_header("Chat", "Chat execution trace and composer", palette)
                            .track_focus(&self.chat_focus)
                            .flex_1()
                            .min_w(px(280.0))
                            .when(inspection_visible || files_visible, |chat| {
                                chat.border_r_1().border_color(palette.separator)
                            })
                            .child(
                                div()
                                    .id("chat-transcript")
                                    .aria_label("Chat transcript")
                                    .flex_1()
                                    .min_h_0()
                                    .overflow_scroll()
                                    .p_4()
                                    .flex()
                                    .flex_col()
                                    .gap_3()
                                    .children(messages.into_iter().filter_map(|message| {
                                        render_backend_message(message, palette)
                                    }))
                                    .children(live_rows.into_iter().filter_map(|row| {
                                        let disclosure = match &row {
                                            TranscriptRow::ToolCallGroup { id, .. } => {
                                                if expanded_tool_ids.contains(id) {
                                                    Disclosure::Expanded
                                                } else {
                                                    Disclosure::Collapsed
                                                }
                                            }
                                            TranscriptRow::ProviderReasoning {
                                                phase_item_id,
                                                provisional,
                                                ..
                                            } => {
                                                if *provisional
                                                    || expanded_reasoning.contains(phase_item_id)
                                                {
                                                    Disclosure::Expanded
                                                } else {
                                                    Disclosure::Collapsed
                                                }
                                            }
                                            _ => Disclosure::Expanded,
                                        };
                                        let row_id = match &row {
                                            TranscriptRow::ToolCallGroup { id, .. } => {
                                                Some(id.clone())
                                            }
                                            _ => None,
                                        };
                                        let reasoning_id = match &row {
                                            TranscriptRow::ProviderReasoning {
                                                phase_item_id,
                                                ..
                                            } => Some(*phase_item_id),
                                            _ => None,
                                        };
                                        render_live_transcript_row(row, disclosure, palette).map(
                                            |element| {
                                                let mut element = element;
                                                if let Some(id) = row_id {
                                                    element = element.cursor_pointer().on_click(
                                                        cx.listener(move |view, _, _, cx| {
                                                            view.toggle_lifecycle_disclosure(
                                                                id.clone(),
                                                                cx,
                                                            );
                                                        }),
                                                    );
                                                }
                                                if let Some(phase_item_id) = reasoning_id {
                                                    element = element.cursor_pointer().on_click(
                                                        cx.listener(move |view, _, _, cx| {
                                                            view.toggle_reasoning_disclosure(
                                                                phase_item_id,
                                                                cx,
                                                            );
                                                        }),
                                                    );
                                                }
                                                element
                                            },
                                        )
                                    }))
                                    .when_some(live_verb, |transcript, verb| {
                                        let label = product_verb_label(verb);
                                        transcript.when(!label.is_empty(), |transcript| {
                                            transcript.child(
                                                div()
                                                    .id("live-activity")
                                                    .flex()
                                                    .items_center()
                                                    .gap_2()
                                                    .px_1()
                                                    .text_xs()
                                                    .text_color(palette.muted_text)
                                                    .child(
                                                        div()
                                                            .h(px(6.0))
                                                            .w(px(6.0))
                                                            .rounded_full()
                                                            .bg(palette.focus),
                                                    )
                                                    .child(label),
                                            )
                                        })
                                    })
                                    .when_some(approval, |transcript, approval| {
                                        transcript.child(
                                            div()
                                                .id("approval-card")
                                                .aria_label("Tool approval required")
                                                .p_4()
                                                .flex()
                                                .flex_col()
                                                .gap_3()
                                                .rounded_md()
                                                .border_1()
                                                .border_color(palette.warning)
                                                .bg(palette.surface)
                                                .child(
                                                    div()
                                                        .flex()
                                                        .items_center()
                                                        .gap_2()
                                                        .child(
                                                            div()
                                                                .h(px(8.0))
                                                                .w(px(8.0))
                                                                .rounded_full()
                                                                .bg(palette.warning)
                                                                .flex_none(),
                                                        )
                                                        .child(
                                                            div()
                                                                .text_sm()
                                                                .font_weight(
                                                                    gpui::FontWeight::SEMIBOLD,
                                                                )
                                                                .child("Approval required"),
                                                        ),
                                                )
                                                .child(
                                                    div()
                                                        .text_sm()
                                                        .text_color(palette.muted_text)
                                                        .child(bounded_display(
                                                            &approval.summary,
                                                            4 * 1024,
                                                        )),
                                                )
                                                .child(
                                                    div()
                                                        .flex()
                                                        .gap_2()
                                                        .pt_1()
                                                        .child(
                                                            outline_button(
                                                                "deny-tool",
                                                                if approval_response_pending {
                                                                    "Awaiting confirmation"
                                                                } else {
                                                                    "Deny"
                                                                },
                                                                "Deny tool",
                                                                palette,
                                                                approval_response_pending,
                                                            )
                                                            .when(
                                                                !approval_response_pending,
                                                                |button| {
                                                                    button
                                                                        .hover(move |style| {
                                                                            style.bg(palette.raised)
                                                                        })
                                                                        .on_click(
                                                                            cx.listener(Self::deny),
                                                                        )
                                                                },
                                                            ),
                                                        )
                                                        .child(
                                                            primary_button(
                                                                "approve-tool-once",
                                                                if approval_response_pending {
                                                                    "Awaiting confirmation"
                                                                } else {
                                                                    "Approve once"
                                                                },
                                                                "Approve tool once",
                                                                palette,
                                                                approval_response_pending,
                                                            )
                                                            .when(
                                                                !approval_response_pending,
                                                                |button| {
                                                                    button
                                                                        .hover(move |style| {
                                                                            style.bg(palette.focus)
                                                                                .opacity(0.9)
                                                                        })
                                                                        .on_click(cx.listener(
                                                                            Self::approve,
                                                                        ))
                                                                },
                                                            ),
                                                        ),
                                                ),
                                        )
                                    }),
                            )
                            .when_some(self.workbench_error, |chat, error| {
                                chat.child(
                                    div()
                                        .px_3()
                                        .py_1p5()
                                        .mx_4()
                                        .mb_2()
                                        .rounded_md()
                                        .bg(palette.warning)
                                        .opacity(0.15)
                                        .text_sm()
                                        .text_color(palette.warning)
                                        .child(error),
                                )
                            })
                            .child(
                                div()
                                    .p_3()
                                    .flex_none()
                                    .border_t_1()
                                    .border_color(palette.separator)
                                    .flex()
                                    .gap_2()
                                    .child(
                                        div()
                                            .h(px(96.0))
                                            .flex_1()
                                            .rounded_md()
                                            .border_1()
                                            .border_color(palette.separator)
                                            .bg(palette.background)
                                            .hover(move |style| {
                                                style.border_color(palette.focus)
                                            })
                                            .child(self.composer.clone()),
                                    )
                                    .when(self.active_turn_id.is_some(), |composer| {
                                        composer.child(
                                            outline_button(
                                                "cancel-turn",
                                                "Cancel",
                                                "Cancel active turn",
                                                palette,
                                                false,
                                            )
                                            .flex()
                                            .items_center()
                                            .hover(move |style| style.bg(palette.hover))
                                            .on_click(cx.listener(Self::cancel_turn)),
                                        )
                                    }),
                            )
                            .child(self.render_terminal_pane(
                                terminal_surface_visible,
                                palette,
                                cx,
                            ))
                    })
                    .child(
                        div()
                            .id("inspection-region")
                            .aria_label("Inspection")
                            .track_focus(&self.inspection_focus)
                            .w(px(inspection_width))
                            .flex_none()
                            .min_w(px(280.0))
                            .flex()
                            .flex_col()
                            .border_r_1()
                            .border_color(palette.separator)
                            .when(!inspection_visible, |inspection| {
                                inspection
                                    .w(px(0.0))
                                    .min_w(px(0.0))
                                    .max_w(px(0.0))
                                    .overflow_hidden()
                                    .flex_none()
                            })
                            .child({
                                let file = self
                                    .snapshot
                                    .as_ref()
                                    .and_then(|snapshot| snapshot.file.clone());
                                let git = self
                                    .snapshot
                                    .as_ref()
                                    .and_then(|snapshot| snapshot.git.clone());
                                let git_diff = self
                                    .snapshot
                                    .as_ref()
                                    .and_then(|snapshot| snapshot.git_diff.clone());
                                let git_sender = self.command_sender.clone();
                                let diff_sender = self.command_sender.clone();
                                pane_header(
                                    "Viewer",
                                    "Read-only file and Git viewer",
                                    palette,
                                )
                                .flex_1()
                                .child(
                                    div()
                                        .px_3()
                                        .py_1p5()
                                        .flex()
                                        .items_center()
                                        .justify_between()
                                        .border_b_1()
                                        .border_color(palette.separator)
                                        .child(
                                            div()
                                                .text_sm()
                                                .text_color(palette.muted_text)
                                                .child(git.as_ref().map_or_else(
                                                    || "Git status not loaded".to_owned(),
                                                    |git| {
                                                        format!(
                                                            "Git {:?} · {}",
                                                            git.state,
                                                            git.branch
                                                                .as_deref()
                                                                .unwrap_or("detached")
                                                        )
                                                    },
                                                )),
                                        )
                                        .child(
                                            div()
                                                .flex()
                                                .gap_2()
                                                .child(
                                                    outline_button(
                                                        "refresh-git",
                                                        "Refresh Git",
                                                        "Refresh Git status",
                                                        palette,
                                                        false,
                                                    )
                                                    .hover(move |style| style.bg(palette.raised))
                                                    .on_click(move |_, _, _| {
                                                        if let Some(sender) = git_sender.as_ref() {
                                                            let _ = sender.try_send(
                                                                WorkbenchCommand::RefreshGit,
                                                            );
                                                        }
                                                    }),
                                                )
                                                .child(
                                                    outline_button(
                                                        "refresh-git-diff",
                                                        "Load diff",
                                                        "Load uncommitted Git diff",
                                                        palette,
                                                        false,
                                                    )
                                                    .hover(move |style| style.bg(palette.raised))
                                                    .on_click(move |_, _, _| {
                                                        if let Some(sender) =
                                                            diff_sender.as_ref()
                                                        {
                                                            let _ = sender.try_send(
                                                                WorkbenchCommand::RefreshGitDiff,
                                                            );
                                                        }
                                                    }),
                                                ),
                                        ),
                                )
                                .child(
                                    div()
                                        .id("file-viewer")
                                        .aria_label("Read-only file content")
                                        .flex_1()
                                        .min_h_0()
                                        .overflow_scroll()
                                        .bg(palette.background)
                                        .child(file.map_or_else(
                                            || {
                                                div()
                                                    .flex()
                                                    .h_full()
                                                    .items_center()
                                                    .justify_center()
                                                    .text_color(palette.muted_text)
                                                    .child("Select a file from the file tree.")
                                                    .into_any_element()
                                            },
                                            |file| {
                                                render_file_source(
                                                    &file.relative_path,
                                                    &file.source_utf8,
                                                    palette,
                                                )
                                            },
                                        ))
                                        .when_some(git_diff, |viewer, diff| {
                                            let preview = diff
                                                .sections
                                                .iter()
                                                .map(|section| {
                                                    format!(
                                                        "{}{}\n{}",
                                                        if section.staged {
                                                            "staged · "
                                                        } else {
                                                            "unstaged · "
                                                        },
                                                        section.path,
                                                        section.preview
                                                    )
                                                })
                                                .collect::<Vec<_>>()
                                                .join("\n\n");
                                            viewer.child(
                                                div()
                                                    .pt_4()
                                                    .mt_2()
                                                    .border_t_1()
                                                    .border_color(palette.separator)
                                                    .child(
                                                        div()
                                                            .text_xs()
                                                            .font_weight(
                                                                gpui::FontWeight::SEMIBOLD,
                                                            )
                                                            .text_color(palette.muted_text)
                                                            .pt_3()
                                                            .child(format!(
                                                                "Uncommitted diff · {:?}",
                                                                diff.state
                                                            )),
                                                    )
                                                    .child(
                                                        div()
                                                            .text_color(palette.text)
                                                            .pt_2()
                                                            .child(bounded_display(
                                                                &preview,
                                                                512 * 1024,
                                                            )),
                                                    ),
                                            )
                                        }),
                                )
                            }),
                    )
                    .child({
                        let directories = self
                            .snapshot
                            .as_ref()
                            .map_or_else(Vec::new, |snapshot| snapshot.directories.clone());
                        let entries = flatten_directory_entries(&directories);
                        let refresh_sender = self.command_sender.clone();
                        let mut files = pane_header(
                            if layout.file_tree_collapsed {
                                "F"
                            } else {
                                "Files"
                            },
                            "Workspace file tree",
                            palette,
                        )
                        .w(px(file_tree_width))
                        .when(!files_visible, |files| files.overflow_hidden())
                        .track_focus(&self.files_focus)
                        .flex_none();
                        if files_visible && !layout.file_tree_collapsed {
                            files = files.child(
                                div()
                                    .id("file-tree-list")
                                    .flex_1()
                                    .min_h_0()
                                    .overflow_scroll()
                                    .px_2()
                                    .py_1()
                                    .flex()
                                    .flex_col()
                                    .gap_0()
                                    .child(
                                        outline_button(
                                            "refresh-files",
                                            "Refresh",
                                            "Refresh workspace files",
                                            palette,
                                            false,
                                        )
                                        .w_full()
                                        .hover(move |style| style.bg(palette.raised))
                                        .on_click(move |_, _, _| {
                                            if let Some(sender) = refresh_sender.as_ref() {
                                                let _ = sender.try_send(
                                                    WorkbenchCommand::RefreshWorkspace,
                                                );
                                            }
                                        }),
                                    )
                                    .children(entries.into_iter().map(|(entry, depth, expanded)| {
                                        let is_file = entry.kind
                                            == crate::app::workspace_inspection::TreeEntryKind::File;
                                        let is_directory = entry.kind
                                            == crate::app::workspace_inspection::TreeEntryKind::Directory;
                                        let sender = self.command_sender.clone();
                                        let path = entry.relative_path.clone();
                                        let display_name = entry.display_name.clone();
                                        div()
                                            .id(entry.relative_path.clone())
                                            .role(gpui::Role::Button)
                                            .aria_label(format!(
                                                "{:?} {}",
                                                entry.kind, display_name
                                            ))
                                            .h(px(25.0))
                                            .px_1()
                                            .rounded_md()
                                            .pl(px(4.0 + depth as f32 * 13.0))
                                            .flex()
                                            .items_center()
                                            .gap_1()
                                            .text_xs()
                                            .when(!is_file && !is_directory, |row| {
                                                row.text_color(palette.muted_text)
                                            })
                                            .when(is_file || is_directory, |row| {
                                                row.cursor_pointer().hover(move |style| {
                                                    style.bg(palette.raised).opacity(0.6)
                                                })
                                            })
                                            .when(is_directory, |row| {
                                                row.font_weight(gpui::FontWeight::MEDIUM)
                                            })
                                            .when(is_file || is_directory, |row| {
                                                row.on_click(move |_, _, _| {
                                                    if let Some(sender) = sender.as_ref() {
                                                        let command = if is_file {
                                                            WorkbenchCommand::OpenFile {
                                                                relative_path: path.clone(),
                                                            }
                                                        } else {
                                                            WorkbenchCommand::ExpandDirectory {
                                                                relative_path: path.clone(),
                                                            }
                                                        };
                                                        let _ = sender.try_send(command);
                                                    }
                                                })
                                            })
                                            .child(
                                                div()
                                                    .w(px(12.0))
                                                    .flex_none()
                                                    .text_color(palette.muted_text)
                                                    .child(if is_directory {
                                                        if expanded { "⌄" } else { "›" }
                                                    } else {
                                                        ""
                                                    }),
                                            )
                                            .child(
                                                div()
                                                    .w(px(14.0))
                                                    .flex_none()
                                                    .text_color(if is_directory {
                                                        palette.focus
                                                    } else {
                                                        file_icon_color(
                                                            &entry.relative_path,
                                                            palette,
                                                        )
                                                    })
                                                    .child(if is_directory {
                                                        "▰"
                                                    } else if is_file {
                                                        file_icon(&entry.relative_path)
                                                    } else {
                                                        "·"
                                                    }),
                                            )
                                            .child(
                                                div()
                                                    .min_w_0()
                                                    .overflow_hidden()
                                                    .child(display_name),
                                            )
                                    })),
                            );
                        }
                        files
                    }),
            )
            .when(self.credential_dialog_open, |root| {
                root.child(
                    div()
                        .id("credential-dialog-backdrop")
                        .absolute()
                        .inset_0()
                        .flex()
                        .items_center()
                        .justify_center()
                        .bg(gpui::black().opacity(0.6))
                        .child(
                            div()
                                .id("credential-dialog")
                                .aria_label("DeepSeek credential settings")
                                .w(px(560.0))
                                .max_w(px(560.0))
                                .p_6()
                                .flex()
                                .flex_col()
                                .gap_4()
                                .rounded_lg()
                                .border_1()
                                .border_color(palette.border)
                                .bg(palette.surface)
                                .child(
                                    div()
                                        .flex()
                                        .items_center()
                                        .gap_2()
                                        .child(
                                            div()
                                                .h(px(10.0))
                                                .w(px(3.0))
                                                .rounded_sm()
                                                .bg(palette.focus),
                                        )
                                        .child(
                                            div()
                                                .text_lg()
                                                .font_weight(gpui::FontWeight::SEMIBOLD)
                                                .child("DeepSeek credential"),
                                        ),
                                )
                                .child(
                                    div()
                                        .text_sm()
                                        .text_color(palette.muted_text)
                                        .child(
                                            "The key is validated and stored in macOS Keychain. It is never written to workbench preferences.",
                                        ),
                                )
                                .child(
                                    div()
                                        .flex()
                                        .flex_col()
                                        .gap_1p5()
                                        .child(
                                            div()
                                                .text_xs()
                                                .font_weight(gpui::FontWeight::SEMIBOLD)
                                                .text_color(palette.muted_text)
                                                .child("API KEY"),
                                        )
                                        .child(
                                            div()
                                                .border_1()
                                                .border_color(palette.border)
                                                .rounded_md()
                                                .bg(palette.background)
                                                .hover(move |style| style.border_color(palette.focus))
                                                .child(self.credential_input.clone()),
                                        ),
                                )
                                .when_some(self.credential_error, |dialog, error| {
                                    dialog.child(
                                        div()
                                            .id("credential-error")
                                            .aria_label(error)
                                            .px_3()
                                            .py_2()
                                            .rounded_md()
                                            .bg(palette.warning)
                                            .opacity(0.15)
                                            .text_sm()
                                            .text_color(palette.warning)
                                            .child(error),
                                    )
                                })
                                .when(self.credential_operation_active, |dialog| {
                                    dialog.child(
                                        div()
                                            .id("credential-validation-status")
                                            .aria_label("Credential validation in progress")
                                            .flex()
                                            .items_center()
                                            .gap_2()
                                            .text_sm()
                                            .text_color(palette.muted_text)
                                            .child(
                                                div()
                                                    .h(px(8.0))
                                                    .w(px(8.0))
                                                    .rounded_full()
                                                    .bg(palette.focus),
                                            )
                                            .child("Validating credential…"),
                                    )
                                })
                                .child(
                                    div()
                                        .flex()
                                        .justify_between()
                                        .pt_2()
                                        .child(
                                            outline_button(
                                                "remove-credential",
                                                "Remove stored key",
                                                "Remove stored DeepSeek credential",
                                                palette,
                                                self.credential_operation_active,
                                            )
                                            .when(!self.credential_operation_active, |button| {
                                                button
                                                    .hover(move |style| style.bg(palette.raised))
                                                    .on_click(cx.listener(Self::remove_credential))
                                            }),
                                        )
                                        .child(
                                            div()
                                                .flex()
                                                .gap_2()
                                                .child(
                                                    outline_button(
                                                        "dismiss-credential-dialog",
                                                        "Cancel",
                                                        "Cancel credential changes",
                                                        palette,
                                                        self.credential_operation_active,
                                                    )
                                                    .when(
                                                        !self.credential_operation_active,
                                                        |button| {
                                                            button
                                                                .hover(move |style| {
                                                                    style.bg(palette.raised)
                                                                })
                                                                .on_click(cx.listener(
                                                                    Self::dismiss_credential_dialog,
                                                                ))
                                                        },
                                                    ),
                                                )
                                                .child(
                                                    primary_button(
                                                        "validate-credential",
                                                        "Validate and save",
                                                        "Validate and save DeepSeek credential",
                                                        palette,
                                                        self.credential_operation_active,
                                                    )
                                                    .when(
                                                        !self.credential_operation_active,
                                                        |button| {
                                                            button
                                                                .hover(move |style| {
                                                                    style.bg(palette.focus)
                                                                        .opacity(0.9)
                                                                })
                                                                .on_click(cx.listener(
                                                                    Self::submit_credential,
                                                                ))
                                                        },
                                                    ),
                                                ),
                                        ),
                                ),
                        ),
                )
            })
    }
}

fn pane_header(
    title: &'static str,
    accessible_label: &'static str,
    palette: SemanticPalette,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(title)
        .aria_label(accessible_label)
        .min_h_0()
        .flex()
        .flex_col()
        .bg(palette.surface)
        .child(
            div()
                .h(px(34.0))
                .flex_none()
                .flex()
                .items_center()
                .px_3()
                .gap_2()
                .bg(palette.surface)
                .border_b_1()
                .border_color(palette.separator)
                .child(
                    div()
                        .text_xs()
                        .font_weight(gpui::FontWeight::MEDIUM)
                        .text_color(palette.muted_text)
                        .child(title),
                ),
        )
}

fn pane_toggle_button(
    id: &'static str,
    label: &'static str,
    aria_label: &'static str,
    active: bool,
    palette: SemanticPalette,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(aria_label)
        .h(px(28.0))
        .min_w(px(28.0))
        .px_2()
        .rounded_md()
        .flex()
        .items_center()
        .justify_center()
        .cursor_pointer()
        .text_xs()
        .text_color(if active {
            palette.text
        } else {
            palette.muted_text
        })
        .when(active, |button| button.bg(palette.selected))
        .hover(move |style| style.bg(palette.hover))
        .child(label)
}

/// A consistent secondary (outline) button used across the workbench. The caller
/// supplies the id, accessible label, and an optional disabled flag; interaction
/// and hover styling are wired by the caller via `on_click`/`hover` on the returned
/// div. The helper intentionally does not set a hover color because the correct
/// hover target depends on the surrounding region's background.
pub fn outline_button(
    id: &'static str,
    label: &'static str,
    aria_label: &'static str,
    palette: SemanticPalette,
    disabled: bool,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(aria_label)
        .px_3()
        .py_1p5()
        .rounded_md()
        .border_1()
        .border_color(palette.separator)
        .text_sm()
        .when(disabled, |button| button.text_color(palette.muted_text))
        .when(!disabled, |button| button.cursor_pointer())
        .child(label)
}

/// A consistent primary (filled) button used for the strongest call to action
/// in a region (for example "Approve once" or "Validate and save"). As with
/// `outline_button`, the caller wires `on_click`/`hover` so the hover color can
/// match the surrounding region.
pub fn primary_button(
    id: &'static str,
    label: &'static str,
    aria_label: &'static str,
    palette: SemanticPalette,
    disabled: bool,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(aria_label)
        .px_3()
        .py_1p5()
        .rounded_md()
        .bg(palette.focus)
        .text_color(palette.background)
        .text_sm()
        .font_weight(gpui::FontWeight::SEMIBOLD)
        .when(disabled, |button| button.opacity(0.5))
        .when(!disabled, |button| button.cursor_pointer())
        .child(label)
}

fn terminal_status_label(status: TerminalPanelStatus) -> &'static str {
    match status {
        TerminalPanelStatus::Inactive => "not started",
        TerminalPanelStatus::Starting => "starting",
        TerminalPanelStatus::Running => "running",
        TerminalPanelStatus::Exited => "exited",
        TerminalPanelStatus::Closing => "closing",
        TerminalPanelStatus::Closed => "closed",
        TerminalPanelStatus::Failed => "failed",
        TerminalPanelStatus::Uncertain => "cleanup uncertain",
    }
}

fn flatten_directory_entries(
    directories: &[crate::app::workspace_inspection::DirectorySnapshot],
) -> Vec<(crate::app::workspace_inspection::TreeEntry, usize, bool)> {
    fn append(
        relative_directory: &str,
        depth: usize,
        directories: &[crate::app::workspace_inspection::DirectorySnapshot],
        rows: &mut Vec<(crate::app::workspace_inspection::TreeEntry, usize, bool)>,
    ) {
        let Some(directory) = directories
            .iter()
            .find(|directory| directory.relative_directory == relative_directory)
        else {
            return;
        };
        for entry in &directory.entries {
            let expanded = entry.kind == crate::app::workspace_inspection::TreeEntryKind::Directory
                && directories
                    .iter()
                    .any(|directory| directory.relative_directory == entry.relative_path);
            rows.push((entry.clone(), depth, expanded));
            if expanded {
                append(
                    &entry.relative_path,
                    depth.saturating_add(1),
                    directories,
                    rows,
                );
            }
        }
    }

    let mut rows = Vec::new();
    append(".", 0, directories, &mut rows);
    rows
}

fn file_icon(_relative_path: &str) -> &'static str {
    "▱"
}

fn file_icon_color(relative_path: &str, palette: SemanticPalette) -> Hsla {
    match Language::from_path(relative_path) {
        Language::Rust | Language::Toml => palette.warning,
        Language::JavaScript | Language::TypeScript | Language::Tsx | Language::Json => {
            palette.focus
        }
        Language::Python | Language::Shell => palette.success,
        Language::Markdown | Language::Latex => palette.link,
        Language::Html | Language::Css => palette.error,
        Language::Yaml | Language::CFamily | Language::Sql | Language::Plain => palette.muted_text,
    }
}

fn render_backend_message(
    message: crate::backend::BackendMessage,
    palette: SemanticPalette,
) -> Option<gpui::Stateful<gpui::Div>> {
    match message {
        crate::backend::BackendMessage::User(message) => Some(transcript_bubble(
            format!("user-{}", message.item_id),
            "You",
            message.text,
            palette,
            true,
        )),
        crate::backend::BackendMessage::Assistant(phase) => {
            let has_content = phase.text.as_ref().is_some_and(|text| !text.is_empty())
                || phase
                    .reasoning
                    .as_ref()
                    .is_some_and(|reasoning| !reasoning.is_empty())
                || !phase.tool_calls.is_empty();
            has_content.then(|| {
                div()
                    .id(format!("assistant-{}", phase.item_id))
                    .aria_label("Assistant")
                    .flex()
                    .flex_col()
                    .gap_2()
                    .py_2()
                    .when_some(phase.reasoning, |content, reasoning| {
                        content.child(reasoning_block(
                            format!("reasoning-{}", phase.item_id),
                            "Reasoning from provider",
                            reasoning,
                            palette,
                            false,
                            false,
                        ))
                    })
                    .when_some(
                        phase.text.filter(|text| !text.is_empty()),
                        |content, text| content.child(render_markdown(&text, true, palette)),
                    )
                    .children(phase.tool_calls.into_iter().map(|call| {
                        tool_activity_row(
                            format!("tool-call-{}", call.tool_call_id),
                            "◇",
                            format!("{} · requested", friendly_tool_name(&call.name)),
                            None,
                            false,
                            palette,
                            false,
                        )
                    }))
            })
        }
        crate::backend::BackendMessage::Tool(result) => Some(tool_activity_row(
            format!("tool-result-{}", result.tool_call_id),
            "✓",
            "Tool completed".to_owned(),
            None,
            false,
            palette,
            false,
        )),
    }
}

fn render_live_transcript_row(
    row: TranscriptRow,
    disclosure: Disclosure,
    palette: SemanticPalette,
) -> Option<gpui::Stateful<gpui::Div>> {
    match row {
        TranscriptRow::UserMessage { item_id, text, .. } => Some(transcript_bubble(
            format!("live-user-{item_id}"),
            "You",
            text,
            palette,
            true,
        )),
        TranscriptRow::AssistantText {
            phase_item_id,
            text,
            provisional,
            ..
        } => (!text.is_empty()).then(|| {
            assistant_text_block(
                format!("live-assistant-{phase_item_id}"),
                if provisional {
                    "Assistant · writing"
                } else {
                    "Assistant"
                },
                text,
                palette,
                !provisional,
            )
        }),
        TranscriptRow::ProviderReasoning {
            phase_item_id,
            text,
            provisional,
            ..
        } => (!text.is_empty()).then(|| {
            reasoning_block(
                format!("live-reasoning-{phase_item_id}"),
                if provisional {
                    "Thinking…"
                } else {
                    "Reasoning from provider"
                },
                text,
                palette,
                provisional,
                disclosure == Disclosure::Expanded,
            )
        }),
        TranscriptRow::ToolCallGroup {
            id,
            call,
            result,
            state,
            ..
        } => {
            let name = call
                .as_ref()
                .map(|call| friendly_tool_name(&call.name))
                .unwrap_or("Tool");
            let (icon, state_label, failed) = match state {
                ToolLifecycleState::Validated | ToolLifecycleState::Queued => ("◇", "ready", false),
                ToolLifecycleState::AwaitingApproval => ("!", "awaiting approval", false),
                ToolLifecycleState::Running => ("●", "running", false),
                ToolLifecycleState::Succeeded => ("✓", "completed", false),
                ToolLifecycleState::Denied => ("–", "denied", false),
                ToolLifecycleState::Failed => ("×", "failed", true),
                ToolLifecycleState::TimedOut => ("×", "timed out", true),
                ToolLifecycleState::Cancelled => ("–", "cancelled", false),
                ToolLifecycleState::Interrupted => ("×", "interrupted", true),
                ToolLifecycleState::Stale => ("×", "stale", true),
                ToolLifecycleState::Uncertain => ("?", "outcome uncertain", true),
            };
            let mut summary = format!("{name} · {state_label}");
            let detail = if disclosure == Disclosure::Expanded {
                result
                    .as_ref()
                    .filter(|result| !result.output.is_empty())
                    .map(|result| bounded_display(&result.output, 480))
                    .or_else(|| {
                        call.as_ref().and_then(|call| {
                            (!call.arguments.is_empty())
                                .then(|| bounded_display(&call.arguments, 320))
                        })
                    })
            } else {
                None
            };
            if failed
                && disclosure == Disclosure::Collapsed
                && let Some(result) = result.as_ref()
                && !result.output.is_empty()
            {
                summary.push_str(" — ");
                summary.push_str(&bounded_display(&result.output, 160));
            }
            let tool_id = match id {
                RowId::ToolGroup { tool_call_id, .. } => tool_call_id.to_string(),
                _ => "unknown".to_owned(),
            };
            Some(tool_activity_row(
                format!("live-tool-{tool_id}"),
                icon,
                summary,
                detail,
                disclosure == Disclosure::Expanded,
                palette,
                failed,
            ))
        }
        TranscriptRow::TurnStatus { state, code, .. } => match state {
            TerminalState::Completed => None,
            TerminalState::Failed | TerminalState::Interrupted | TerminalState::Uncertain => {
                Some(tool_activity_row(
                    format!("turn-{state:?}"),
                    "×",
                    code.unwrap_or_else(|| format!("{state:?}").to_ascii_lowercase()),
                    None,
                    true,
                    palette,
                    true,
                ))
            }
            TerminalState::Cancelled => Some(tool_activity_row(
                "turn-cancelled".to_owned(),
                "–",
                "Turn cancelled".to_owned(),
                None,
                false,
                palette,
                false,
            )),
        },
        TranscriptRow::Usage { .. } | TranscriptRow::Diagnostic { .. } => None,
    }
}

fn reasoning_block(
    id: String,
    label: &'static str,
    text: String,
    palette: SemanticPalette,
    streaming: bool,
    expanded: bool,
) -> gpui::Stateful<gpui::Div> {
    let chevron = if expanded { "▾" } else { "▸" };
    div()
        .id(id)
        .aria_label(label)
        .aria_expanded(expanded)
        .py_1p5()
        .px_3()
        .flex()
        .flex_col()
        .gap_1p5()
        .rounded_md()
        .border_l_2()
        .border_color(if streaming {
            palette.focus
        } else {
            palette.separator
        })
        .when(expanded || streaming, |block| block.bg(palette.raised))
        .child(
            div()
                .flex()
                .items_center()
                .gap_2()
                .text_xs()
                .font_weight(gpui::FontWeight::SEMIBOLD)
                .text_color(if streaming {
                    palette.focus
                } else {
                    palette.muted_text
                })
                .child(chevron)
                .child(label),
        )
        .when(expanded, |block| {
            block.child(
                div()
                    .text_xs()
                    .text_color(palette.muted_text)
                    .whitespace_normal()
                    .child(bounded_display(&text, 16 * 1024)),
            )
        })
}

fn tool_activity_row(
    id: String,
    icon: &'static str,
    summary: String,
    detail: Option<String>,
    expanded: bool,
    palette: SemanticPalette,
    failed: bool,
) -> gpui::Stateful<gpui::Div> {
    let chevron = if expanded { "▾" } else { "▸" };
    div()
        .id(id)
        .aria_label("Tool activity")
        .aria_expanded(expanded)
        .flex()
        .flex_col()
        .gap_1()
        .px_2()
        .py_1p5()
        .rounded_md()
        .when(expanded || failed, |row| row.bg(palette.raised))
        .child(
            div()
                .flex()
                .items_center()
                .gap_2()
                .text_xs()
                .text_color(if failed {
                    palette.error
                } else {
                    palette.muted_text
                })
                .child(div().w(px(12.0)).flex_none().child(icon))
                .child(div().flex_1().child(summary))
                .child(
                    div()
                        .text_color(palette.muted_text)
                        .child(chevron),
                ),
        )
        .when_some(detail.filter(|_| expanded), |row, detail| {
            row.child(
                div()
                    .pl_5()
                    .text_xs()
                    .text_color(palette.muted_text)
                    .whitespace_normal()
                    .child(detail),
            )
        })
}

fn transcript_bubble(
    id: String,
    label: &'static str,
    text: String,
    palette: SemanticPalette,
    user: bool,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .aria_label(label)
        .py_2()
        .px_3()
        .flex()
        .flex_col()
        .gap_1p5()
        .rounded_md()
        .when(user, |bubble| bubble.ml(px(44.0)).bg(palette.raised))
        .child(
            div()
                .flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .h(px(8.0))
                        .w(px(8.0))
                        .rounded_full()
                        .flex_none()
                        .when(user, |dot| dot.bg(palette.focus))
                        .when(!user, |dot| dot.bg(palette.muted_text)),
                )
                .child(
                    div()
                        .text_xs()
                        .font_weight(gpui::FontWeight::SEMIBOLD)
                        .text_color(palette.muted_text)
                        .child(label),
                ),
        )
        .child(div().text_sm().whitespace_normal().child(text))
}

fn assistant_text_block(
    id: String,
    label: &'static str,
    source: String,
    palette: SemanticPalette,
    complete: bool,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .aria_label(label)
        .py_2()
        .flex()
        .flex_col()
        .gap_1p5()
        .child(
            div()
                .text_xs()
                .font_weight(gpui::FontWeight::SEMIBOLD)
                .text_color(palette.muted_text)
                .child(label),
        )
        .child(render_markdown(&source, complete, palette))
}

fn render_markdown(source: &str, complete: bool, palette: SemanticPalette) -> gpui::Div {
    let document = MarkdownDocument::parse(source, complete);
    div().flex().flex_col().gap_2().text_sm().children(
        document
            .blocks()
            .iter()
            .map(|block| render_markdown_block(block, palette)),
    )
}

fn render_markdown_block(block: &MarkdownBlock, palette: SemanticPalette) -> AnyElement {
    match block {
        MarkdownBlock::Paragraph { inlines } => div()
            .whitespace_normal()
            .child(styled_inlines(inlines, palette))
            .into_any_element(),
        MarkdownBlock::Heading { level, inlines } => div()
            .pt_1()
            .when(*level <= 2, |heading| {
                heading.text_lg().font_weight(gpui::FontWeight::BOLD)
            })
            .when(*level > 2, |heading| {
                heading.text_base().font_weight(gpui::FontWeight::SEMIBOLD)
            })
            .child(styled_inlines(inlines, palette))
            .into_any_element(),
        MarkdownBlock::List { ordered, items } => div()
            .flex()
            .flex_col()
            .gap_1()
            .children(items.iter().enumerate().map(|(index, item)| {
                div()
                    .flex()
                    .items_start()
                    .gap_2()
                    .pl_2()
                    .child(
                        div()
                            .w(px(22.0))
                            .flex_none()
                            .text_color(palette.muted_text)
                            .child(if *ordered {
                                format!("{}.", index + 1)
                            } else {
                                "•".to_owned()
                            }),
                    )
                    .child(
                        div()
                            .flex_1()
                            .whitespace_normal()
                            .child(styled_inlines(item, palette)),
                    )
            }))
            .into_any_element(),
        MarkdownBlock::Quote { inlines } => div()
            .border_l_2()
            .border_color(palette.separator)
            .pl_3()
            .py_1()
            .text_color(palette.muted_text)
            .child(styled_inlines(inlines, palette))
            .into_any_element(),
        MarkdownBlock::Rule => div()
            .h(px(1.0))
            .my_2()
            .bg(palette.separator)
            .into_any_element(),
        MarkdownBlock::Table { rows } => div()
            .rounded_md()
            .border_1()
            .border_color(palette.separator)
            .overflow_hidden()
            .children(rows.iter().enumerate().map(|(row_index, row)| {
                div()
                    .flex()
                    .when(row_index == 0, |header| {
                        header
                            .bg(palette.raised)
                            .font_weight(gpui::FontWeight::SEMIBOLD)
                    })
                    .when(row_index > 0, |body| {
                        body.border_t_1().border_color(palette.separator)
                    })
                    .children(row.iter().map(|cell| {
                        div()
                            .flex_1()
                            .min_w_0()
                            .px_2()
                            .py_1p5()
                            .whitespace_normal()
                            .child(styled_inlines(cell, palette))
                    }))
            }))
            .into_any_element(),
        MarkdownBlock::CodeFence { language, source } => render_code_block(
            source,
            Language::from_fence(language.as_deref()),
            MAX_MARKDOWN_SOURCE_BYTES,
            palette,
        )
        .into_any_element(),
        MarkdownBlock::Math(math) => {
            let formula = bounded_display(&math.source, 16 * 1024);
            let formula_len = formula.len();
            div()
                .px_3()
                .py_2()
                .rounded_md()
                .bg(palette.raised)
                .text_center()
                .text_color(palette.focus)
                .text_base()
                .child(StyledText::new(formula).with_highlights([(
                    0..formula_len,
                    HighlightStyle {
                        color: Some(palette.focus),
                        font_style: Some(FontStyle::Italic),
                        ..Default::default()
                    },
                )]))
                .into_any_element()
        }
        MarkdownBlock::InertHtml { source } => div()
            .px_3()
            .py_2()
            .rounded_md()
            .bg(palette.raised)
            .text_xs()
            .text_color(palette.muted_text)
            .child(format!(
                "Embedded markup is inert\n{}",
                bounded_display(source, 8 * 1024)
            ))
            .into_any_element(),
        MarkdownBlock::Literal { source, .. } => div()
            .whitespace_normal()
            .child(bounded_display(source, MAX_MARKDOWN_SOURCE_BYTES))
            .into_any_element(),
    }
}

fn styled_inlines(inlines: &[InlineNode], palette: SemanticPalette) -> StyledText {
    let mut text = String::new();
    let mut highlights = Vec::new();
    for inline in inlines {
        let start = text.len();
        let style = match inline {
            InlineNode::Text(value) => {
                text.push_str(value);
                None
            }
            InlineNode::Emphasis(value) => {
                text.push_str(value);
                Some(HighlightStyle {
                    font_style: Some(FontStyle::Italic),
                    ..Default::default()
                })
            }
            InlineNode::Strikethrough(value) => {
                text.push_str(value);
                Some(HighlightStyle {
                    color: Some(palette.muted_text),
                    ..Default::default()
                })
            }
            InlineNode::Code(value) => {
                text.push_str(value);
                Some(HighlightStyle {
                    color: Some(palette.warning),
                    background_color: Some(palette.inline_code),
                    ..Default::default()
                })
            }
            InlineNode::Link { label, .. } => {
                text.push_str(label);
                Some(HighlightStyle {
                    color: Some(palette.link),
                    ..Default::default()
                })
            }
            InlineNode::InertImage { alt } => {
                text.push_str("[image: ");
                text.push_str(alt);
                text.push(']');
                Some(HighlightStyle {
                    color: Some(palette.muted_text),
                    font_style: Some(FontStyle::Italic),
                    ..Default::default()
                })
            }
            InlineNode::InertMarkup(value) => {
                text.push_str(value);
                Some(HighlightStyle {
                    color: Some(palette.muted_text),
                    ..Default::default()
                })
            }
            InlineNode::Math(math) => {
                text.push_str(&math.source);
                Some(HighlightStyle {
                    color: Some(palette.focus),
                    font_style: Some(FontStyle::Italic),
                    ..Default::default()
                })
            }
        };
        if let Some(style) = style
            && start < text.len()
        {
            highlights.push((start..text.len(), style));
        }
    }
    StyledText::new(text).with_highlights(highlights)
}

fn render_code_block(
    source: &str,
    language: Language,
    maximum_bytes: usize,
    palette: SemanticPalette,
) -> gpui::Div {
    let source = bounded_display(source, maximum_bytes);
    let highlights = syntax_highlights(&source, language, palette);
    div()
        .rounded_md()
        .bg(palette.fenced_code)
        .border_1()
        .border_color(palette.separator)
        .px_3()
        .py_2()
        .text_xs()
        .whitespace_nowrap()
        .child(StyledText::new(source).with_highlights(highlights))
}

/// Read-only code viewer patterned on gpui-component's code-editor presentation:
/// language label, line-number gutter, syntax highlights, and no soft wrap.
/// Editable InputState / LSP features are intentionally not adopted.
fn render_code_viewer(
    relative_path: &str,
    source: &str,
    language: Language,
    palette: SemanticPalette,
) -> gpui::Stateful<gpui::Div> {
    let source = bounded_display(source, MAX_HIGHLIGHT_BYTES);
    let spans = highlight(&source, language);
    let mut offset = 0usize;
    let rows: Vec<(usize, &str)> = source
        .split('\n')
        .map(|line| {
            let content = line.strip_suffix('\r').unwrap_or(line);
            let start = offset;
            offset += line.len() + 1;
            (start, content)
        })
        .collect();
    let line_count = rows.len();
    let gutter_digits = line_count.to_string().len().clamp(2, 6);
    let gutter_width = px(12.0 + gutter_digits as f32 * 8.0);

    div()
        .id("code-viewer")
        .aria_label(format!("Read-only {relative_path}"))
        .flex()
        .flex_col()
        .size_full()
        .min_h_0()
        .bg(palette.background)
        .child(
            div()
                .h(px(30.0))
                .flex_none()
                .flex()
                .items_center()
                .justify_between()
                .px_3()
                .gap_2()
                .border_b_1()
                .border_color(palette.separator)
                .bg(palette.surface)
                .child(
                    div()
                        .text_xs()
                        .font_weight(gpui::FontWeight::MEDIUM)
                        .text_color(palette.text)
                        .child(relative_path.to_owned()),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap_2()
                        .child(
                            div()
                                .text_xs()
                                .text_color(palette.muted_text)
                                .child(language.label().to_owned()),
                        )
                        .child(
                            div()
                                .text_xs()
                                .text_color(palette.muted_text)
                                .child(format!("{line_count} lines")),
                        ),
                ),
        )
        .child(
            div()
                .id("code-viewer-body")
                .flex_1()
                .min_h_0()
                .overflow_scroll()
                .flex()
                .flex_col()
                .text_xs()
                .children(rows.into_iter().enumerate().map(|(index, (line_start, line))| {
                    let line_end = line_start + line.len();
                    let line_highlights = spans
                        .iter()
                        .filter_map(|span| {
                            let start = span.range.start.max(line_start);
                            let end = span.range.end.min(line_end);
                            (start < end).then(|| {
                                (
                                    start - line_start..end - line_start,
                                    highlight_style(span.kind, palette),
                                )
                            })
                        })
                        .collect::<Vec<_>>();
                    let display = if line.is_empty() { " " } else { line };
                    div()
                        .id(format!("code-line-{index}"))
                        .flex()
                        .flex_row()
                        .items_start()
                        .min_w_full()
                        .child(
                            div()
                                .w(gutter_width)
                                .flex_none()
                                .pr_2()
                                .text_right()
                                .text_color(palette.muted_text)
                                .child(format!("{:>width$}", index + 1, width = gutter_digits)),
                        )
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .pl_2()
                                .border_l_1()
                                .border_color(palette.separator)
                                .whitespace_nowrap()
                                .child(
                                    StyledText::new(display.to_owned())
                                        .with_highlights(line_highlights),
                                ),
                        )
                })),
        )
}

fn highlight_style(kind: HighlightKind, palette: SemanticPalette) -> HighlightStyle {
    let color = match kind {
        HighlightKind::Comment => palette.muted_text,
        HighlightKind::String => palette.success,
        HighlightKind::Number => palette.warning,
        HighlightKind::Keyword => palette.focus,
        HighlightKind::Type => palette.warning,
        HighlightKind::Function => palette.link,
        HighlightKind::Property => palette.link,
        HighlightKind::Operator => palette.muted_text,
        HighlightKind::Markup => palette.error,
    };
    HighlightStyle {
        color: Some(color),
        font_style: (kind == HighlightKind::Comment).then_some(FontStyle::Italic),
        font_weight: matches!(kind, HighlightKind::Keyword | HighlightKind::Type)
            .then_some(gpui::FontWeight::SEMIBOLD),
        ..Default::default()
    }
}

fn syntax_highlights(
    source: &str,
    language: Language,
    palette: SemanticPalette,
) -> Vec<(std::ops::Range<usize>, HighlightStyle)> {
    highlight(source, language)
        .into_iter()
        .map(|span| (span.range, highlight_style(span.kind, palette)))
        .collect()
}

fn render_file_source(relative_path: &str, source: &str, palette: SemanticPalette) -> AnyElement {
    let language = Language::from_path(relative_path);
    if language == Language::Markdown {
        div()
            .p_4()
            .child(render_markdown(source, true, palette))
            .into_any_element()
    } else {
        render_code_viewer(relative_path, source, language, palette).into_any_element()
    }
}

fn friendly_tool_name(name: &str) -> &str {
    match name {
        "read" => "Read",
        "search" => "Search",
        "list" | "ls" => "List",
        "patch" | "apply_patch" => "Edit",
        "shell" => "Terminal",
        _ => name,
    }
}

fn tool_activity_kind(name: &str) -> ToolActivityKind {
    match name {
        "read" | "list" | "ls" => ToolActivityKind::Read,
        "search" => ToolActivityKind::Search,
        "patch" | "apply_patch" => ToolActivityKind::Patch,
        "shell" => ToolActivityKind::Shell,
        _ => ToolActivityKind::Other,
    }
}

fn tool_terminal_status(status: ToolStatus) -> ToolTerminalStatus {
    match status {
        ToolStatus::Completed => ToolTerminalStatus::Completed,
        ToolStatus::Failed => ToolTerminalStatus::Failed,
        ToolStatus::Cancelled | ToolStatus::Denied => ToolTerminalStatus::Cancelled,
        ToolStatus::Uncertain => ToolTerminalStatus::Uncertain,
        ToolStatus::Requested
        | ToolStatus::Validated
        | ToolStatus::AwaitingApproval
        | ToolStatus::Running => ToolTerminalStatus::Interrupted,
    }
}

fn product_verb_label(verb: ProductVerb) -> &'static str {
    match verb {
        ProductVerb::None => "",
        ProductVerb::Preparing => "Preparing…",
        ProductVerb::Thinking => "Thinking…",
        ProductVerb::WaitingForApproval => "Waiting for approval",
        ProductVerb::Reading => "Reading…",
        ProductVerb::Searching => "Searching…",
        ProductVerb::Patching => "Editing…",
        ProductVerb::Running => "Running…",
        ProductVerb::Continuing => "Continuing…",
        ProductVerb::Cancelling => "Cancelling…",
    }
}

fn bounded_display(value: &str, maximum_bytes: usize) -> String {
    if value.len() <= maximum_bytes {
        return value.to_owned();
    }
    let mut end = maximum_bytes.min(value.len());
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &value[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_profiles_keep_text_and_background_distinct() {
        for theme in [
            ThemePreference::System,
            ThemePreference::Light,
            ThemePreference::Dark,
            ThemePreference::HighContrast,
        ] {
            let palette = SemanticPalette::for_theme(theme);
            assert_ne!(palette.text, palette.background);
            assert_ne!(palette.focus, palette.background);
        }
        assert_eq!(
            SemanticPalette::for_window(ThemePreference::System, WindowAppearance::Dark),
            SemanticPalette::for_theme(ThemePreference::Dark)
        );
        assert_eq!(
            SemanticPalette::for_window(ThemePreference::System, WindowAppearance::Light),
            SemanticPalette::for_theme(ThemePreference::Light)
        );
    }

    #[test]
    fn window_and_pane_minima_are_explicit() {
        const {
            assert!(DEFAULT_WINDOW_WIDTH >= MINIMUM_WINDOW_WIDTH);
            assert!(DEFAULT_WINDOW_HEIGHT >= MINIMUM_WINDOW_HEIGHT);
            assert!(NAVIGATION_PREFERRED_WIDTH < MINIMUM_WINDOW_WIDTH);
            assert!(FILE_TREE_PREFERRED_WIDTH < MINIMUM_WINDOW_WIDTH);
        }
    }

    #[test]
    fn layout_collapses_file_tree_before_navigation() {
        assert_eq!(
            layout_for_width(DEFAULT_WINDOW_WIDTH),
            LayoutDecision {
                navigation_collapsed: false,
                file_tree_collapsed: false,
            }
        );
        assert_eq!(
            layout_for_width(MINIMUM_WINDOW_WIDTH),
            LayoutDecision {
                navigation_collapsed: false,
                file_tree_collapsed: true,
            }
        );
        assert_eq!(
            layout_for_width(NAVIGATION_COLLAPSE_WIDTH - 1.0),
            LayoutDecision {
                navigation_collapsed: true,
                file_tree_collapsed: true,
            }
        );
    }
}
