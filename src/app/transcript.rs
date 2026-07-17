//! Bounded, GPUI-neutral transcript projection.
//!
//! Canonical rows are keyed by domain identities rather than their current vector index. Streaming
//! deltas are provisional and generation-bound; only an authoritative assistant phase can replace
//! them. This module deliberately owns no renderer, journal, network, or process operation.

use std::collections::VecDeque;
use std::fmt;

pub const MAX_ROWS: usize = 4_096;
pub const MAX_DIAGNOSTICS: usize = 128;
pub const MAX_PROVISIONAL_BYTES: usize = 512 * 1024;
pub const MAX_DELTA_QUEUE: usize = 256;
pub const MAX_APPROVAL_PREVIEW_BYTES: usize = 4 * 1024;

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ProvisionalKey {
    pub turn_id: u64,
    pub request_id: u64,
    pub generation: u64,
}

#[derive(Clone, Eq, PartialEq)]
pub struct ToolCallRecord {
    pub tool_call_id: u64,
    pub provider_call_id: String,
    pub name: String,
    pub arguments: String,
}

impl fmt::Debug for ToolCallRecord {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ToolCallRecord")
            .field("tool_call_id", &self.tool_call_id)
            .field("provider_call_id", &self.provider_call_id)
            .field("name", &self.name)
            .field("argument_bytes", &self.arguments.len())
            .finish()
    }
}

#[derive(Clone, Eq, PartialEq)]
pub struct ToolResultRecord {
    pub tool_call_id: u64,
    pub provider_call_id: String,
    pub output: String,
    pub status: ToolTerminalStatus,
}

impl fmt::Debug for ToolResultRecord {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ToolResultRecord")
            .field("tool_call_id", &self.tool_call_id)
            .field("provider_call_id", &self.provider_call_id)
            .field("output_bytes", &self.output.len())
            .field("status", &self.status)
            .finish()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ToolTerminalStatus {
    Completed,
    Failed,
    Cancelled,
    Uncertain,
}

#[derive(Clone, Eq, PartialEq)]
pub struct AssistantPhaseRecord {
    pub item_id: u64,
    pub provider_completion_id: String,
    pub text: Option<String>,
    pub reasoning: Option<String>,
    pub reasoning_required_for_replay: bool,
    pub tool_calls: Vec<ToolCallRecord>,
}

impl fmt::Debug for AssistantPhaseRecord {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("AssistantPhaseRecord")
            .field("item_id", &self.item_id)
            .field("provider_completion_id", &self.provider_completion_id)
            .field("text_bytes", &self.text.as_ref().map(String::len))
            .field("reasoning", &self.reasoning.as_ref().map(|_| "[REDACTED]"))
            .field(
                "reasoning_required_for_replay",
                &self.reasoning_required_for_replay,
            )
            .field("tool_calls", &self.tool_calls.len())
            .finish()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UsageRecord {
    pub prompt_tokens: Option<u64>,
    pub cache_hit_tokens: Option<u64>,
    pub cache_miss_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub reasoning_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TerminalState {
    Completed,
    Failed,
    Cancelled,
    Interrupted,
    Uncertain,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ToolActivityKind {
    Read,
    Search,
    Patch,
    Shell,
    Other,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SemanticActivity {
    Idle,
    Preparing,
    RequestingModel,
    StreamingModel,
    AwaitingApproval,
    RunningTool(ToolActivityKind),
    ContinuingModel,
    Cancelling,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProductVerb {
    None,
    Preparing,
    Thinking,
    WaitingForApproval,
    Reading,
    Searching,
    Patching,
    Running,
    Continuing,
    Cancelling,
}

impl SemanticActivity {
    pub fn product_verb(self) -> ProductVerb {
        match self {
            Self::Idle => ProductVerb::None,
            Self::Preparing => ProductVerb::Preparing,
            Self::RequestingModel | Self::StreamingModel => ProductVerb::Thinking,
            Self::AwaitingApproval => ProductVerb::WaitingForApproval,
            Self::RunningTool(ToolActivityKind::Read) => ProductVerb::Reading,
            Self::RunningTool(ToolActivityKind::Search) => ProductVerb::Searching,
            Self::RunningTool(ToolActivityKind::Patch) => ProductVerb::Patching,
            Self::RunningTool(ToolActivityKind::Shell | ToolActivityKind::Other) => {
                ProductVerb::Running
            }
            Self::ContinuingModel => ProductVerb::Continuing,
            Self::Cancelling => ProductVerb::Cancelling,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApprovalDecision {
    ApproveOnce,
    Deny,
}

#[derive(Clone, Copy, Eq, PartialEq)]
pub struct ApprovalResolution {
    pub turn_id: u64,
    pub approval_id: u64,
    pub tool_call_id: u64,
    pub effect_digest: [u8; 32],
    pub decision: ApprovalDecision,
}

impl fmt::Debug for ApprovalResolution {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ApprovalResolution")
            .field("turn_id", &self.turn_id)
            .field("approval_id", &self.approval_id)
            .field("tool_call_id", &self.tool_call_id)
            .field("effect_digest", &"[REDACTED_DIGEST]")
            .field("decision", &self.decision)
            .finish()
    }
}

#[derive(Clone, Eq, PartialEq)]
pub struct ApprovalRow {
    pub turn_id: u64,
    pub approval_id: u64,
    pub tool_call_id: u64,
    pub effect_digest: [u8; 32],
    pub summary: String,
    pub display_preview: String,
    pub resolved: Option<ApprovalDecision>,
}

impl fmt::Debug for ApprovalRow {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ApprovalRow")
            .field("turn_id", &self.turn_id)
            .field("approval_id", &self.approval_id)
            .field("tool_call_id", &self.tool_call_id)
            .field("effect_digest", &"[REDACTED_DIGEST]")
            .field("summary_bytes", &self.summary.len())
            .field("preview_bytes", &self.display_preview.len())
            .field("resolved", &self.resolved)
            .finish()
    }
}

#[derive(Clone, Eq, Hash, PartialEq)]
pub enum RowId {
    UserMessage { item_id: u64 },
    AssistantPhase { item_id: u64 },
    ProviderReasoning { item_id: u64 },
    ToolGroup { turn_id: u64, tool_call_id: u64 },
    Approval { turn_id: u64, approval_id: u64 },
    Usage { turn_id: u64 },
    TurnStatus { turn_id: u64 },
    Diagnostic { sequence: u64 },
    ProvisionalText(ProvisionalKey),
    ProvisionalReasoning(ProvisionalKey),
}

impl fmt::Debug for RowId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::UserMessage { .. } => "UserMessage",
            Self::AssistantPhase { .. } => "AssistantPhase",
            Self::ProviderReasoning { .. } => "ProviderReasoning",
            Self::ToolGroup { .. } => "ToolGroup",
            Self::Approval { .. } => "Approval",
            Self::Usage { .. } => "Usage",
            Self::TurnStatus { .. } => "TurnStatus",
            Self::Diagnostic { .. } => "Diagnostic",
            Self::ProvisionalText(_) => "ProvisionalText",
            Self::ProvisionalReasoning(_) => "ProvisionalReasoning",
        })
    }
}

#[derive(Clone, Eq, PartialEq)]
pub enum TranscriptRow {
    UserMessage {
        id: RowId,
        item_id: u64,
        text: String,
    },
    AssistantText {
        id: RowId,
        turn_id: u64,
        phase_item_id: u64,
        text: String,
        provisional: bool,
    },
    ProviderReasoning {
        id: RowId,
        turn_id: u64,
        phase_item_id: u64,
        text: String,
        provisional: bool,
        required_for_replay: bool,
    },
    ToolCallGroup {
        id: RowId,
        turn_id: u64,
        call: ToolCallRecord,
        result: Option<ToolResultRecord>,
    },
    Approval {
        id: RowId,
        approval: ApprovalRow,
    },
    Usage {
        id: RowId,
        turn_id: u64,
        usage: UsageRecord,
    },
    TurnStatus {
        id: RowId,
        turn_id: u64,
        state: TerminalState,
        code: Option<String>,
    },
    Diagnostic {
        id: RowId,
        code: String,
    },
}

impl fmt::Debug for TranscriptRow {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UserMessage { id, item_id, text } => formatter
                .debug_struct("UserMessage")
                .field("id", id)
                .field("item_id", item_id)
                .field("text_bytes", &text.len())
                .finish(),
            Self::AssistantText { id, text, .. } => formatter
                .debug_struct("AssistantText")
                .field("id", id)
                .field("text_bytes", &text.len())
                .finish(),
            Self::ProviderReasoning { id, text, .. } => formatter
                .debug_struct("ProviderReasoning")
                .field("id", id)
                .field("text", &"[REDACTED]")
                .field("text_bytes", &text.len())
                .finish(),
            Self::ToolCallGroup {
                id, call, result, ..
            } => formatter
                .debug_struct("ToolCallGroup")
                .field("id", id)
                .field("tool_call_id", &call.tool_call_id)
                .field("name", &call.name)
                .field("argument_bytes", &call.arguments.len())
                .field("has_result", &result.is_some())
                .finish(),
            Self::Approval { id, approval } => formatter
                .debug_struct("Approval")
                .field("id", id)
                .field("approval", approval)
                .finish(),
            Self::Usage { id, turn_id, usage } => formatter
                .debug_struct("Usage")
                .field("id", id)
                .field("turn_id", turn_id)
                .field("usage", usage)
                .finish(),
            Self::TurnStatus {
                id,
                turn_id,
                state,
                code,
            } => formatter
                .debug_struct("TurnStatus")
                .field("id", id)
                .field("turn_id", turn_id)
                .field("state", state)
                .field("code_bytes", &code.as_ref().map(String::len))
                .finish(),
            Self::Diagnostic { id, code } => formatter
                .debug_struct("Diagnostic")
                .field("id", id)
                .field("code_bytes", &code.len())
                .finish(),
        }
    }
}

#[derive(Clone, Eq, PartialEq)]
pub enum TranscriptEvent {
    UserMessage {
        item_id: u64,
        text: String,
    },
    Preparing {
        turn_id: u64,
    },
    RequestStarted {
        turn_id: u64,
        request_id: u64,
    },
    ReasoningDelta {
        key: ProvisionalKey,
        text: String,
    },
    TextDelta {
        key: ProvisionalKey,
        text: String,
    },
    AssistantPhaseCompleted {
        turn_id: u64,
        key: ProvisionalKey,
        phase: AssistantPhaseRecord,
    },
    ToolResult {
        turn_id: u64,
        result: ToolResultRecord,
    },
    ApprovalRequested {
        approval: ApprovalRow,
    },
    ApprovalResolved {
        resolution: ApprovalResolution,
    },
    Usage {
        turn_id: u64,
        usage: UsageRecord,
    },
    RunningTool {
        kind: ToolActivityKind,
    },
    AwaitingApproval,
    Continuing,
    Cancelling,
    TurnCompleted {
        turn_id: u64,
    },
    TurnFailed {
        turn_id: u64,
        code: String,
    },
    TurnCancelled {
        turn_id: u64,
    },
    TurnInterrupted {
        turn_id: u64,
    },
    TurnUncertain {
        turn_id: u64,
    },
    Diagnostic {
        code: String,
    },
}

impl fmt::Debug for TranscriptEvent {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Self::UserMessage { .. } => "UserMessage([REDACTED])",
            Self::Preparing { .. } => "Preparing",
            Self::RequestStarted { .. } => "RequestStarted",
            Self::ReasoningDelta { .. } => "ReasoningDelta([REDACTED])",
            Self::TextDelta { .. } => "TextDelta([REDACTED])",
            Self::AssistantPhaseCompleted { .. } => "AssistantPhaseCompleted([REDACTED])",
            Self::ToolResult { .. } => "ToolResult([REDACTED])",
            Self::ApprovalRequested { .. } => "ApprovalRequested",
            Self::ApprovalResolved { .. } => "ApprovalResolved",
            Self::Usage { .. } => "Usage",
            Self::RunningTool { .. } => "RunningTool",
            Self::AwaitingApproval => "AwaitingApproval",
            Self::Continuing => "Continuing",
            Self::Cancelling => "Cancelling",
            Self::TurnCompleted { .. } => "TurnCompleted",
            Self::TurnFailed { .. } => "TurnFailed",
            Self::TurnCancelled { .. } => "TurnCancelled",
            Self::TurnInterrupted { .. } => "TurnInterrupted",
            Self::TurnUncertain { .. } => "TurnUncertain",
            Self::Diagnostic { .. } => "Diagnostic",
        };
        formatter.write_str(name)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScrollAnchor {
    pub row: Option<RowId>,
    pub offset: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScrollState {
    pub anchor: ScrollAnchor,
    pub following: bool,
    pub new_activity: bool,
}

impl Default for ScrollState {
    fn default() -> Self {
        Self {
            anchor: ScrollAnchor {
                row: None,
                offset: 0,
            },
            following: true,
            new_activity: false,
        }
    }
}

impl ScrollState {
    pub fn scroll_away(&mut self, anchor: ScrollAnchor) {
        self.anchor = anchor;
        self.following = false;
    }

    pub fn return_to_end(&mut self) {
        self.anchor = ScrollAnchor {
            row: None,
            offset: 0,
        };
        self.following = true;
        self.new_activity = false;
    }

    fn activity_arrived(&mut self) {
        if !self.following {
            self.new_activity = true;
        }
    }
}

#[derive(Clone, Eq, PartialEq)]
struct ProvisionalText {
    text: String,
    reasoning: String,
    text_truncated: bool,
    reasoning_truncated: bool,
}

impl fmt::Debug for ProvisionalText {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ProvisionalText")
            .field("text_bytes", &self.text.len())
            .field("reasoning_bytes", &self.reasoning.len())
            .field("text_truncated", &self.text_truncated)
            .field("reasoning_truncated", &self.reasoning_truncated)
            .finish()
    }
}

/// Rebuildable transcript projection with bounded canonical rows and provisional deltas.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TranscriptProjection {
    rows: Vec<TranscriptRow>,
    provisional: Vec<(ProvisionalKey, ProvisionalText)>,
    delta_queue: VecDeque<ProvisionalKey>,
    sequence: u64,
    activity: SemanticActivity,
    scroll: ScrollState,
}

impl Default for TranscriptProjection {
    fn default() -> Self {
        Self::new()
    }
}

impl TranscriptProjection {
    pub fn new() -> Self {
        Self {
            rows: Vec::new(),
            provisional: Vec::new(),
            delta_queue: VecDeque::new(),
            sequence: 0,
            activity: SemanticActivity::Idle,
            scroll: ScrollState::default(),
        }
    }

    pub fn rows(&self) -> &[TranscriptRow] {
        &self.rows
    }

    pub fn activity(&self) -> SemanticActivity {
        self.activity
    }

    pub fn product_verb(&self) -> ProductVerb {
        self.activity.product_verb()
    }

    pub fn scroll(&self) -> ScrollState {
        self.scroll.clone()
    }

    pub fn provisional_count(&self) -> usize {
        self.provisional.len()
    }

    pub fn delta_queue_len(&self) -> usize {
        self.delta_queue.len()
    }

    pub fn scroll_away(&mut self, anchor: ScrollAnchor) {
        self.scroll.scroll_away(anchor);
    }

    pub fn return_to_end(&mut self) {
        self.scroll.return_to_end();
    }

    pub fn apply(&mut self, event: TranscriptEvent) {
        match event {
            TranscriptEvent::UserMessage { item_id, text } => {
                self.push_row(TranscriptRow::UserMessage {
                    id: RowId::UserMessage { item_id },
                    item_id,
                    text,
                });
                self.activity = SemanticActivity::Idle;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::Preparing { .. } => self.activity = SemanticActivity::Preparing,
            TranscriptEvent::RequestStarted { .. } => {
                self.activity = SemanticActivity::RequestingModel
            }
            TranscriptEvent::ReasoningDelta { key, text } => {
                self.append_delta(key, text, true);
                self.activity = SemanticActivity::StreamingModel;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::TextDelta { key, text } => {
                self.append_delta(key, text, false);
                self.activity = SemanticActivity::StreamingModel;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::AssistantPhaseCompleted {
                turn_id,
                key,
                phase,
            } => {
                self.provisional.retain(|(candidate, _)| *candidate != key);
                self.remove_provisional_rows(key);
                if phase.text.is_some() {
                    self.push_row(TranscriptRow::AssistantText {
                        id: RowId::AssistantPhase {
                            item_id: phase.item_id,
                        },
                        turn_id,
                        phase_item_id: phase.item_id,
                        text: phase.text.unwrap_or_default(),
                        provisional: false,
                    });
                }
                if let Some(reasoning) = phase.reasoning {
                    self.push_row(TranscriptRow::ProviderReasoning {
                        id: RowId::ProviderReasoning {
                            item_id: phase.item_id,
                        },
                        turn_id,
                        phase_item_id: phase.item_id,
                        text: reasoning,
                        provisional: false,
                        required_for_replay: phase.reasoning_required_for_replay,
                    });
                }
                for call in phase.tool_calls {
                    self.push_row(TranscriptRow::ToolCallGroup {
                        id: RowId::ToolGroup {
                            turn_id,
                            tool_call_id: call.tool_call_id,
                        },
                        turn_id,
                        call,
                        result: None,
                    });
                }
                self.activity = SemanticActivity::Idle;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::ToolResult { turn_id, result } => {
                if let Some(TranscriptRow::ToolCallGroup { result: slot, .. }) = self.rows.iter_mut().find(|row| matches!(row, TranscriptRow::ToolCallGroup { turn_id: candidate, call, .. } if *candidate == turn_id && call.tool_call_id == result.tool_call_id && call.provider_call_id == result.provider_call_id)) {
                    *slot = Some(result);
                }
                self.activity = SemanticActivity::Idle;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::ApprovalRequested { approval } => {
                self.push_row(TranscriptRow::Approval {
                    id: RowId::Approval {
                        turn_id: approval.turn_id,
                        approval_id: approval.approval_id,
                    },
                    approval,
                });
                self.activity = SemanticActivity::AwaitingApproval;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::ApprovalResolved { resolution } => {
                if let Some(TranscriptRow::Approval { approval, .. }) = self.rows.iter_mut().find(|row| matches!(row, TranscriptRow::Approval { approval, .. } if approval.turn_id == resolution.turn_id && approval.approval_id == resolution.approval_id))
                    && approval.effect_digest == resolution.effect_digest
                    && approval.tool_call_id == resolution.tool_call_id
                {
                    approval.resolved = Some(resolution.decision);
                }
                self.activity = SemanticActivity::Idle;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::Usage { turn_id, usage } => {
                let id = RowId::Usage { turn_id };
                if let Some(TranscriptRow::Usage { usage: slot, .. }) = self.rows.iter_mut().find(|row| matches!(row, TranscriptRow::Usage { turn_id: candidate, .. } if *candidate == turn_id)) {
                    *slot = usage;
                } else {
                    self.push_row(TranscriptRow::Usage { id, turn_id, usage });
                }
                self.scroll.activity_arrived();
            }
            TranscriptEvent::RunningTool { kind } => {
                self.activity = SemanticActivity::RunningTool(kind);
                self.scroll.activity_arrived();
            }
            TranscriptEvent::AwaitingApproval => {
                self.activity = SemanticActivity::AwaitingApproval;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::Continuing => {
                self.activity = SemanticActivity::ContinuingModel;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::Cancelling => {
                self.activity = SemanticActivity::Cancelling;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::TurnCompleted { turn_id } => {
                self.finish_turn(turn_id, TerminalState::Completed, None)
            }
            TranscriptEvent::TurnFailed { turn_id, code } => {
                self.finish_turn(turn_id, TerminalState::Failed, Some(code))
            }
            TranscriptEvent::TurnCancelled { turn_id } => {
                self.finish_turn(turn_id, TerminalState::Cancelled, None)
            }
            TranscriptEvent::TurnInterrupted { turn_id } => {
                self.finish_turn(turn_id, TerminalState::Interrupted, None)
            }
            TranscriptEvent::TurnUncertain { turn_id } => {
                self.finish_turn(turn_id, TerminalState::Uncertain, None)
            }
            TranscriptEvent::Diagnostic { code } => {
                self.sequence = self.sequence.saturating_add(1);
                self.push_row(TranscriptRow::Diagnostic {
                    id: RowId::Diagnostic {
                        sequence: self.sequence,
                    },
                    code,
                });
                self.scroll.activity_arrived();
            }
        }
    }

    fn append_delta(&mut self, key: ProvisionalKey, text: String, reasoning: bool) {
        let position = self
            .provisional
            .iter()
            .position(|(candidate, _)| *candidate == key);
        let position = if let Some(position) = position {
            position
        } else {
            if self.provisional.len() >= MAX_DELTA_QUEUE {
                self.provisional.remove(0);
            }
            self.provisional.push((
                key,
                ProvisionalText {
                    text: String::new(),
                    reasoning: String::new(),
                    text_truncated: false,
                    reasoning_truncated: false,
                },
            ));
            self.delta_queue.push_back(key);
            while self.delta_queue.len() > MAX_DELTA_QUEUE {
                self.delta_queue.pop_front();
            }
            self.provisional.len() - 1
        };
        let provisional = &mut self.provisional[position].1;
        let other_bytes = if reasoning {
            provisional.text.len()
        } else {
            provisional.reasoning.len()
        };
        let target = if reasoning {
            &mut provisional.reasoning
        } else {
            &mut provisional.text
        };
        let truncated = if reasoning {
            &mut provisional.reasoning_truncated
        } else {
            &mut provisional.text_truncated
        };
        append_bounded(
            target,
            &text,
            MAX_PROVISIONAL_BYTES.saturating_sub(other_bytes),
            truncated,
        );
        let value = self.provisional[position].1.clone();
        self.sync_provisional_rows(key, value);
    }

    fn finish_turn(&mut self, turn_id: u64, state: TerminalState, code: Option<String>) {
        let removed: Vec<_> = self
            .provisional
            .iter()
            .filter_map(|(key, _)| (key.turn_id == turn_id).then_some(*key))
            .collect();
        self.provisional.retain(|(key, _)| key.turn_id != turn_id);
        self.delta_queue.retain(|key| key.turn_id != turn_id);
        for key in removed {
            self.remove_provisional_rows(key);
        }
        self.activity = SemanticActivity::Idle;
        let row = TranscriptRow::TurnStatus {
            id: RowId::TurnStatus { turn_id },
            turn_id,
            state,
            code,
        };
        if let Some(existing) = self.rows.iter_mut().find(|candidate| {
            matches!(candidate, TranscriptRow::TurnStatus { turn_id: candidate, .. } if *candidate == turn_id)
        }) {
            *existing = row;
        } else {
            self.push_row(row);
        }
        self.scroll.activity_arrived();
    }

    fn push_row(&mut self, row: TranscriptRow) {
        let row_id = transcript_row_id(&row);
        if self
            .rows
            .iter()
            .any(|candidate| transcript_row_id(candidate) == row_id)
        {
            return;
        }
        if self.rows.len() >= MAX_ROWS {
            let removed = self.rows.remove(0);
            if self.scroll.anchor.row.as_ref() == Some(transcript_row_id(&removed)) {
                self.scroll.anchor.row = self.rows.first().map(transcript_row_id).cloned();
                self.scroll.anchor.offset = 0;
            }
        }
        self.rows.push(row);
    }

    fn remove_provisional_rows(&mut self, key: ProvisionalKey) {
        self.rows.retain(|row| {
            !matches!(
                row,
                TranscriptRow::AssistantText {
                    id: RowId::ProvisionalText(candidate), ..
                } | TranscriptRow::ProviderReasoning {
                    id: RowId::ProvisionalReasoning(candidate), ..
                } if *candidate == key
            )
        });
    }

    fn sync_provisional_rows(&mut self, key: ProvisionalKey, value: ProvisionalText) {
        self.remove_provisional_rows(key);
        if !value.text.is_empty() {
            self.push_row(TranscriptRow::AssistantText {
                id: RowId::ProvisionalText(key),
                turn_id: key.turn_id,
                phase_item_id: 0,
                text: value.text,
                provisional: true,
            });
        }
        if !value.reasoning.is_empty() {
            self.push_row(TranscriptRow::ProviderReasoning {
                id: RowId::ProvisionalReasoning(key),
                turn_id: key.turn_id,
                phase_item_id: 0,
                text: value.reasoning,
                provisional: true,
                required_for_replay: false,
            });
        }
    }
}

fn transcript_row_id(row: &TranscriptRow) -> &RowId {
    match row {
        TranscriptRow::UserMessage { id, .. }
        | TranscriptRow::AssistantText { id, .. }
        | TranscriptRow::ProviderReasoning { id, .. }
        | TranscriptRow::ToolCallGroup { id, .. }
        | TranscriptRow::Approval { id, .. }
        | TranscriptRow::Usage { id, .. }
        | TranscriptRow::TurnStatus { id, .. }
        | TranscriptRow::Diagnostic { id, .. } => id,
    }
}

fn append_bounded(target: &mut String, value: &str, maximum: usize, truncated: &mut bool) {
    if target.len() >= maximum {
        *truncated = true;
        return;
    }
    let remaining = maximum - target.len();
    if value.len() <= remaining {
        target.push_str(value);
        return;
    }
    let mut end = remaining;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    target.push_str(&value[..end]);
    *truncated = true;
}

pub fn approval_matches(row: &ApprovalRow, resolution: ApprovalResolution) -> bool {
    row.turn_id == resolution.turn_id
        && row.approval_id == resolution.approval_id
        && row.tool_call_id == resolution.tool_call_id
        && row.effect_digest == resolution.effect_digest
}

pub fn approval_preview(summary: &str) -> String {
    if summary.len() <= MAX_APPROVAL_PREVIEW_BYTES {
        return summary.to_owned();
    }
    let mut end = MAX_APPROVAL_PREVIEW_BYTES.saturating_sub("… [truncated]".len());
    while end > 0 && !summary.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}… [truncated]", &summary[..end])
}

impl ApprovalRow {
    pub fn new(
        turn_id: u64,
        approval_id: u64,
        tool_call_id: u64,
        effect_digest: [u8; 32],
        summary: String,
    ) -> Self {
        let display_preview = approval_preview(&summary);
        Self {
            turn_id,
            approval_id,
            tool_call_id,
            effect_digest,
            summary,
            display_preview,
            resolved: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> ProvisionalKey {
        ProvisionalKey {
            turn_id: 7,
            request_id: 9,
            generation: 1,
        }
    }

    fn phase() -> AssistantPhaseRecord {
        AssistantPhaseRecord {
            item_id: 42,
            provider_completion_id: "provider-completion".into(),
            text: Some("completed".into()),
            reasoning: Some("private reasoning".into()),
            reasoning_required_for_replay: true,
            tool_calls: vec![ToolCallRecord {
                tool_call_id: 11,
                provider_call_id: "provider-call".into(),
                name: "read".into(),
                arguments: "{\"path\":\"src/lib.rs\"}".into(),
            }],
        }
    }

    #[test]
    fn provisional_deltas_are_replaced_only_by_matching_authoritative_phase() {
        let mut projection = TranscriptProjection::new();
        projection.apply(TranscriptEvent::TextDelta {
            key: key(),
            text: "partial".into(),
        });
        assert!(projection
            .rows()
            .iter()
            .any(|row| matches!(row, TranscriptRow::AssistantText { provisional: true, text, .. } if text == "partial")));
        projection.apply(TranscriptEvent::AssistantPhaseCompleted {
            turn_id: 7,
            key: ProvisionalKey {
                generation: 2,
                ..key()
            },
            phase: phase(),
        });
        assert_eq!(projection.provisional_count(), 1);
        projection.apply(TranscriptEvent::AssistantPhaseCompleted {
            turn_id: 7,
            key: key(),
            phase: phase(),
        });
        assert_eq!(projection.provisional_count(), 0);
        assert!(projection.rows().iter().any(|row| matches!(row, TranscriptRow::AssistantText { text, provisional: false, .. } if text == "completed")));
        assert!(projection.rows().iter().any(|row| matches!(row, TranscriptRow::ToolCallGroup { call, .. } if call.provider_call_id == "provider-call")));
    }

    #[test]
    fn terminal_failures_remove_provisional_content_without_promotion() {
        let mut projection = TranscriptProjection::new();
        projection.apply(TranscriptEvent::ReasoningDelta {
            key: key(),
            text: "secret".into(),
        });
        projection.apply(TranscriptEvent::TurnInterrupted { turn_id: 7 });
        assert_eq!(projection.provisional_count(), 0);
        assert!(projection.rows().iter().any(|row| matches!(
            row,
            TranscriptRow::TurnStatus {
                state: TerminalState::Interrupted,
                ..
            }
        )));
        assert!(!format!("{:?}", projection).contains("secret"));
    }

    #[test]
    fn approval_requires_exact_identity_and_digest() {
        let row = ApprovalRow::new(1, 2, 3, [4; 32], "shell command".into());
        assert!(approval_matches(
            &row,
            ApprovalResolution {
                turn_id: 1,
                approval_id: 2,
                tool_call_id: 3,
                effect_digest: [4; 32],
                decision: ApprovalDecision::Deny
            }
        ));
        assert!(!approval_matches(
            &row,
            ApprovalResolution {
                turn_id: 1,
                approval_id: 2,
                tool_call_id: 3,
                effect_digest: [5; 32],
                decision: ApprovalDecision::ApproveOnce
            }
        ));
    }

    #[test]
    fn tool_results_require_turn_and_provider_call_identity() {
        let mut projection = TranscriptProjection::new();
        projection.apply(TranscriptEvent::AssistantPhaseCompleted {
            turn_id: 7,
            key: key(),
            phase: phase(),
        });
        projection.apply(TranscriptEvent::ToolResult {
            turn_id: 8,
            result: ToolResultRecord {
                tool_call_id: 11,
                provider_call_id: "provider-call".into(),
                output: "stale".into(),
                status: ToolTerminalStatus::Completed,
            },
        });
        assert!(
            projection
                .rows()
                .iter()
                .any(|row| matches!(row, TranscriptRow::ToolCallGroup { result: None, .. }))
        );
        projection.apply(TranscriptEvent::ToolResult {
            turn_id: 7,
            result: ToolResultRecord {
                tool_call_id: 11,
                provider_call_id: "provider-call".into(),
                output: "ok".into(),
                status: ToolTerminalStatus::Completed,
            },
        });
        assert!(projection.rows().iter().any(|row| matches!(row, TranscriptRow::ToolCallGroup { result: Some(ToolResultRecord { output, .. }), .. } if output == "ok")));
    }

    #[test]
    fn repeated_authoritative_phase_is_idempotent() {
        let mut projection = TranscriptProjection::new();
        projection.apply(TranscriptEvent::AssistantPhaseCompleted {
            turn_id: 7,
            key: key(),
            phase: phase(),
        });
        projection.apply(TranscriptEvent::ToolResult {
            turn_id: 7,
            result: ToolResultRecord {
                tool_call_id: 11,
                provider_call_id: "provider-call".into(),
                output: "ok".into(),
                status: ToolTerminalStatus::Completed,
            },
        });
        projection.apply(TranscriptEvent::AssistantPhaseCompleted {
            turn_id: 7,
            key: key(),
            phase: phase(),
        });
        assert_eq!(
            projection
                .rows()
                .iter()
                .filter(|row| matches!(
                    row,
                    TranscriptRow::AssistantText {
                        provisional: false,
                        ..
                    }
                ))
                .count(),
            1
        );
        assert!(projection.rows().iter().any(|row| matches!(
            row,
            TranscriptRow::ToolCallGroup {
                result: Some(_),
                ..
            }
        )));
    }

    #[test]
    fn rapid_deltas_and_rows_are_bounded() {
        let mut projection = TranscriptProjection::new();
        for turn in 0..(MAX_ROWS + 10) as u64 {
            projection.apply(TranscriptEvent::Diagnostic {
                code: format!("d{turn}"),
            });
        }
        assert_eq!(projection.rows().len(), MAX_ROWS);
        for index in 0..(MAX_DELTA_QUEUE + 10) {
            projection.apply(TranscriptEvent::TextDelta {
                key: ProvisionalKey {
                    turn_id: index as u64,
                    request_id: 1,
                    generation: 1,
                },
                text: "x".repeat(MAX_PROVISIONAL_BYTES),
            });
        }
        assert!(projection.provisional_count() <= MAX_DELTA_QUEUE);
        assert!(projection.delta_queue_len() <= MAX_DELTA_QUEUE);
    }

    #[test]
    fn scroll_away_sets_new_activity_until_return_to_end() {
        let mut projection = TranscriptProjection::new();
        projection.scroll_away(ScrollAnchor {
            row: Some(RowId::Diagnostic { sequence: 1 }),
            offset: 4,
        });
        projection.apply(TranscriptEvent::TextDelta {
            key: key(),
            text: "delta".into(),
        });
        assert!(projection.scroll().new_activity);
        projection.apply(TranscriptEvent::AssistantPhaseCompleted {
            turn_id: 1,
            key: key(),
            phase: phase(),
        });
        assert!(projection.scroll().new_activity);
        assert!(!projection.scroll().following);
        projection.return_to_end();
        assert!(projection.scroll().following);
        assert!(!projection.scroll().new_activity);
    }

    #[test]
    fn debug_redacts_reasoning_and_source_like_text() {
        let event = TranscriptEvent::ReasoningDelta {
            key: key(),
            text: "SECRET_REASONING".into(),
        };
        assert!(!format!("{event:?}").contains("SECRET_REASONING"));
        let row = TranscriptRow::ProviderReasoning {
            id: RowId::ProviderReasoning { item_id: 1 },
            turn_id: 1,
            phase_item_id: 1,
            text: "SECRET_REASONING".into(),
            provisional: false,
            required_for_replay: true,
        };
        assert!(!format!("{row:?}").contains("SECRET_REASONING"));
        let mut projection = TranscriptProjection::new();
        projection.apply(TranscriptEvent::TextDelta {
            key: key(),
            text: "SECRET_PROVISIONAL".into(),
        });
        assert!(!format!("{projection:?}").contains("SECRET_PROVISIONAL"));
    }
}
