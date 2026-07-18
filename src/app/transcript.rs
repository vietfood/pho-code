//! Bounded, GPUI-neutral transcript projection.
//!
//! Canonical rows are keyed by domain identities rather than their current vector index. Streaming
//! deltas are provisional and generation-bound; only an authoritative assistant phase can replace
//! them. This module deliberately owns no renderer, journal, network, or process operation.

use std::collections::VecDeque;
use std::fmt;

use crate::agent::types::{ApprovalId, BackendRequestId, ItemId, SessionId, ToolCallId, TurnId};
use crate::backend::{AssistantPhase, BackendMessage, CompletedToolCall, ToolResult};

pub const MAX_ROWS: usize = 4_096;
pub const MAX_DIAGNOSTICS: usize = 128;
pub const MAX_PROVISIONAL_BYTES: usize = 512 * 1024;
pub const MAX_DELTA_QUEUE: usize = 256;
pub const MAX_APPROVAL_PREVIEW_BYTES: usize = 4 * 1024;
pub const MAX_TOOL_DETAIL_BYTES: usize = 8 * 1024;
pub const MAX_PENDING_LIFECYCLES: usize = 256;
pub const MAX_EXPANSION_KEYS: usize = 256;

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ProvisionalKey {
    pub turn_id: TurnId,
    pub request_id: BackendRequestId,
    pub generation: u64,
}

#[derive(Clone, Eq, PartialEq)]
pub struct ToolCallRecord {
    pub tool_call_id: ToolCallId,
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
    pub tool_call_id: ToolCallId,
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

impl From<CompletedToolCall> for ToolCallRecord {
    fn from(value: CompletedToolCall) -> Self {
        Self {
            tool_call_id: value.tool_call_id,
            provider_call_id: value.provider_call_id,
            name: value.name,
            arguments: value.arguments,
        }
    }
}

impl From<ToolResult> for ToolResultRecord {
    fn from(value: ToolResult) -> Self {
        Self {
            tool_call_id: value.tool_call_id,
            provider_call_id: value.provider_call_id,
            output: value.output,
            status: ToolTerminalStatus::Completed,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ToolTerminalStatus {
    Completed,
    Failed,
    TimedOut,
    Cancelled,
    Interrupted,
    Stale,
    Uncertain,
}

/// The display state of a canonical call. This is deliberately not inferred from a textual
/// diagnostic or a provider payload: callers provide lifecycle transitions as typed events.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ToolLifecycleState {
    Validated,
    AwaitingApproval,
    Denied,
    Queued,
    Running,
    Succeeded,
    Failed,
    TimedOut,
    Cancelled,
    Interrupted,
    Stale,
    Uncertain,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ToolKind {
    Read,
    Search,
    List,
    Patch,
    Shell,
    Other,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Disclosure {
    Collapsed,
    Expanded,
}

/// GPUI-neutral data used to render one lifecycle row. The canonical call, approval, and result
/// stay independently addressable on `TranscriptRow::ToolCallGroup`; this is only a safe view of
/// their current relationship.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ToolLifecycleProjection {
    pub row_id: RowId,
    pub phase_item_id: Option<ItemId>,
    pub tool_call_id: ToolCallId,
    pub approval_id: Option<ApprovalId>,
    pub result_provider_call_id: Option<String>,
    pub kind: ToolKind,
    pub state: ToolLifecycleState,
    pub summary: String,
    pub disclosure: Disclosure,
    pub arguments_truncated: bool,
    pub output_truncated: bool,
}

#[derive(Clone, Eq, PartialEq)]
pub struct AssistantPhaseRecord {
    pub item_id: ItemId,
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

impl From<AssistantPhase> for AssistantPhaseRecord {
    fn from(value: AssistantPhase) -> Self {
        Self {
            item_id: value.item_id,
            provider_completion_id: value.provider_completion_id,
            text: value.text,
            reasoning: value.reasoning,
            reasoning_required_for_replay: value.reasoning_required_for_replay,
            tool_calls: value.tool_calls.into_iter().map(Into::into).collect(),
        }
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
    pub turn_id: TurnId,
    pub approval_id: ApprovalId,
    pub tool_call_id: ToolCallId,
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
    pub turn_id: TurnId,
    pub approval_id: ApprovalId,
    pub tool_call_id: ToolCallId,
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
    UserMessage {
        session_id: SessionId,
        item_id: ItemId,
    },
    AssistantPhase {
        session_id: SessionId,
        item_id: ItemId,
    },
    ProviderReasoning {
        session_id: SessionId,
        item_id: ItemId,
    },
    ToolGroup {
        session_id: SessionId,
        turn_id: TurnId,
        tool_call_id: ToolCallId,
    },
    Usage {
        session_id: SessionId,
        turn_id: TurnId,
    },
    TurnStatus {
        session_id: SessionId,
        turn_id: TurnId,
    },
    Diagnostic {
        session_id: SessionId,
        sequence: u64,
    },
    ProvisionalText {
        session_id: SessionId,
        key: ProvisionalKey,
    },
    ProvisionalReasoning {
        session_id: SessionId,
        key: ProvisionalKey,
    },
}

impl fmt::Debug for RowId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::UserMessage { .. } => "UserMessage",
            Self::AssistantPhase { .. } => "AssistantPhase",
            Self::ProviderReasoning { .. } => "ProviderReasoning",
            Self::ToolGroup { .. } => "ToolGroup",
            Self::Usage { .. } => "Usage",
            Self::TurnStatus { .. } => "TurnStatus",
            Self::Diagnostic { .. } => "Diagnostic",
            Self::ProvisionalText { .. } => "ProvisionalText",
            Self::ProvisionalReasoning { .. } => "ProvisionalReasoning",
        })
    }
}

#[derive(Clone, Eq, PartialEq)]
pub enum TranscriptRow {
    UserMessage {
        id: RowId,
        item_id: ItemId,
        text: String,
    },
    AssistantText {
        id: RowId,
        turn_id: TurnId,
        phase_item_id: ItemId,
        text: String,
        provisional: bool,
    },
    ProviderReasoning {
        id: RowId,
        turn_id: TurnId,
        phase_item_id: ItemId,
        text: String,
        provisional: bool,
        required_for_replay: bool,
    },
    ToolCallGroup {
        id: RowId,
        turn_id: TurnId,
        /// `None` is an intentionally short-lived out-of-order state. An approval or result can
        /// arrive before its completed assistant phase, but it must remain visible rather than be
        /// dropped or rendered as an unrelated raw row.
        phase_item_id: Option<ItemId>,
        call: Option<ToolCallRecord>,
        approval: Option<Box<ApprovalRow>>,
        result: Option<ToolResultRecord>,
        state: ToolLifecycleState,
        arguments_truncated: bool,
        output_truncated: bool,
    },
    Usage {
        id: RowId,
        turn_id: TurnId,
        usage: UsageRecord,
    },
    TurnStatus {
        id: RowId,
        turn_id: TurnId,
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
                id,
                call,
                approval,
                result,
                state,
                ..
            } => formatter
                .debug_struct("ToolCallGroup")
                .field("id", id)
                .field("tool_call_id", &call.as_ref().map(|call| call.tool_call_id))
                .field("name", &call.as_ref().map(|call| call.name.as_str()))
                .field(
                    "argument_bytes",
                    &call.as_ref().map(|call| call.arguments.len()),
                )
                .field(
                    "approval_id",
                    &approval.as_ref().map(|approval| approval.approval_id),
                )
                .field("has_result", &result.is_some())
                .field("state", state)
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
        item_id: ItemId,
        text: String,
    },
    Preparing {
        turn_id: TurnId,
    },
    RequestStarted {
        turn_id: TurnId,
        request_id: BackendRequestId,
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
        turn_id: TurnId,
        key: ProvisionalKey,
        phase: AssistantPhaseRecord,
    },
    ToolResult {
        turn_id: TurnId,
        result: ToolResultRecord,
    },
    ToolState {
        turn_id: TurnId,
        tool_call_id: ToolCallId,
        state: ToolLifecycleState,
    },
    ApprovalRequested {
        approval: ApprovalRow,
    },
    ApprovalResolved {
        resolution: ApprovalResolution,
    },
    Usage {
        turn_id: TurnId,
        usage: UsageRecord,
    },
    RunningTool {
        kind: ToolActivityKind,
    },
    AwaitingApproval,
    Continuing,
    Cancelling,
    TurnCompleted {
        turn_id: TurnId,
    },
    TurnFailed {
        turn_id: TurnId,
        code: String,
    },
    TurnCancelled {
        turn_id: TurnId,
    },
    TurnInterrupted {
        turn_id: TurnId,
    },
    TurnUncertain {
        turn_id: TurnId,
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
            Self::ToolState { .. } => "ToolState",
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
    session_id: SessionId,
    rows: Vec<TranscriptRow>,
    provisional: Vec<(ProvisionalKey, ProvisionalText)>,
    delta_queue: VecDeque<ProvisionalKey>,
    expanded_lifecycles: VecDeque<RowId>,
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
        Self::for_session(SessionId::new())
    }

    /// The production constructor. A projection is always scoped to one canonical session, so
    /// virtual-row identity cannot collide across open session tabs.
    pub fn for_session(session_id: SessionId) -> Self {
        Self {
            session_id,
            rows: Vec::new(),
            provisional: Vec::new(),
            delta_queue: VecDeque::new(),
            expanded_lifecycles: VecDeque::new(),
            sequence: 0,
            activity: SemanticActivity::Idle,
            scroll: ScrollState::default(),
        }
    }

    pub fn session_id(&self) -> SessionId {
        self.session_id
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

    pub fn lifecycle(&self, id: &RowId) -> Option<ToolLifecycleProjection> {
        self.rows.iter().find_map(|row| match row {
            TranscriptRow::ToolCallGroup {
                id: row_id,
                turn_id,
                phase_item_id,
                call,
                approval,
                result,
                state,
                arguments_truncated,
                output_truncated,
            } if row_id == id => Some(ToolLifecycleProjection {
                row_id: row_id.clone(),
                phase_item_id: *phase_item_id,
                tool_call_id: match row_id {
                    RowId::ToolGroup { tool_call_id, .. } => *tool_call_id,
                    _ => return None,
                },
                approval_id: approval.as_ref().map(|approval| approval.approval_id),
                result_provider_call_id: result
                    .as_ref()
                    .map(|result| result.provider_call_id.clone()),
                kind: call
                    .as_ref()
                    .map(|call| tool_kind(&call.name))
                    .unwrap_or(ToolKind::Other),
                state: *state,
                summary: lifecycle_summary(*turn_id, call.as_ref(), result.as_ref(), *state),
                disclosure: lifecycle_disclosure(
                    call.as_ref(),
                    approval.as_deref(),
                    result.as_ref(),
                    *state,
                ),
                arguments_truncated: *arguments_truncated,
                output_truncated: *output_truncated,
            }),
            _ => None,
        })
    }

    pub fn set_lifecycle_expanded(&mut self, id: RowId, expanded: bool) {
        if !matches!(id, RowId::ToolGroup { .. }) {
            return;
        }
        self.expanded_lifecycles
            .retain(|candidate| candidate != &id);
        if expanded {
            self.expanded_lifecycles.push_back(id);
            while self.expanded_lifecycles.len() > MAX_EXPANSION_KEYS {
                self.expanded_lifecycles.pop_front();
            }
        }
    }

    pub fn lifecycle_is_expanded(&self, id: &RowId) -> bool {
        self.expanded_lifecycles
            .iter()
            .any(|candidate| candidate == id)
    }

    /// Project a durable backend message without parsing its serialized representation. The caller
    /// supplies the journal-owned turn and request identities; reconstruction may not invent or
    /// recover either from provider strings.
    pub fn apply_reconstructed_message(
        &mut self,
        turn_id: TurnId,
        request_id: BackendRequestId,
        generation: u64,
        message: BackendMessage,
    ) {
        match message {
            BackendMessage::User(message) => self.apply(TranscriptEvent::UserMessage {
                item_id: message.item_id,
                text: message.text,
            }),
            BackendMessage::Assistant(phase) => {
                self.apply(TranscriptEvent::AssistantPhaseCompleted {
                    turn_id,
                    key: ProvisionalKey {
                        turn_id,
                        request_id,
                        generation,
                    },
                    phase: phase.into(),
                });
            }
            BackendMessage::Tool(result) => self.apply(TranscriptEvent::ToolResult {
                turn_id,
                result: result.into(),
            }),
        }
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
                    id: RowId::UserMessage {
                        session_id: self.session_id,
                        item_id,
                    },
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
                if let Some(reasoning) = phase.reasoning {
                    self.push_row(TranscriptRow::ProviderReasoning {
                        id: RowId::ProviderReasoning {
                            session_id: self.session_id,
                            item_id: phase.item_id,
                        },
                        turn_id,
                        phase_item_id: phase.item_id,
                        text: reasoning,
                        provisional: false,
                        required_for_replay: phase.reasoning_required_for_replay,
                    });
                }
                if phase.text.is_some() {
                    self.push_row(TranscriptRow::AssistantText {
                        id: RowId::AssistantPhase {
                            session_id: self.session_id,
                            item_id: phase.item_id,
                        },
                        turn_id,
                        phase_item_id: phase.item_id,
                        text: phase.text.unwrap_or_default(),
                        provisional: false,
                    });
                }
                for call in phase.tool_calls {
                    self.upsert_call(turn_id, phase.item_id, call);
                }
                self.activity = SemanticActivity::Idle;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::ToolResult { turn_id, result } => {
                self.upsert_result(turn_id, result);
                self.activity = SemanticActivity::Idle;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::ToolState {
                turn_id,
                tool_call_id,
                state,
            } => {
                self.upsert_state(turn_id, tool_call_id, state);
                self.scroll.activity_arrived();
            }
            TranscriptEvent::ApprovalRequested { approval } => {
                self.upsert_approval(approval);
                self.activity = SemanticActivity::AwaitingApproval;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::ApprovalResolved { resolution } => {
                self.resolve_approval(resolution);
                self.activity = SemanticActivity::Idle;
                self.scroll.activity_arrived();
            }
            TranscriptEvent::Usage { turn_id, usage } => {
                let id = RowId::Usage {
                    session_id: self.session_id,
                    turn_id,
                };
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
                        session_id: self.session_id,
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

    fn lifecycle_mut(
        &mut self,
        turn_id: TurnId,
        tool_call_id: ToolCallId,
    ) -> Option<&mut TranscriptRow> {
        self.rows.iter_mut().find(|row| matches!(row, TranscriptRow::ToolCallGroup { turn_id: candidate_turn, id: RowId::ToolGroup { tool_call_id: candidate_call, .. }, .. } if *candidate_turn == turn_id && *candidate_call == tool_call_id))
    }

    fn ensure_lifecycle(
        &mut self,
        turn_id: TurnId,
        tool_call_id: ToolCallId,
    ) -> Option<&mut TranscriptRow> {
        if self.lifecycle_mut(turn_id, tool_call_id).is_none() {
            self.push_row(TranscriptRow::ToolCallGroup {
                id: RowId::ToolGroup {
                    session_id: self.session_id,
                    turn_id,
                    tool_call_id,
                },
                turn_id,
                phase_item_id: None,
                call: None,
                approval: None,
                result: None,
                state: ToolLifecycleState::Validated,
                arguments_truncated: false,
                output_truncated: false,
            });
        }
        self.lifecycle_mut(turn_id, tool_call_id)
    }

    fn upsert_call(&mut self, turn_id: TurnId, phase_item_id: ItemId, mut call: ToolCallRecord) {
        let arguments_truncated = truncate_string(&mut call.arguments, MAX_TOOL_DETAIL_BYTES);
        if let Some(TranscriptRow::ToolCallGroup {
            call: slot,
            phase_item_id: phase,
            arguments_truncated: truncated,
            ..
        }) = self.ensure_lifecycle(turn_id, call.tool_call_id)
        {
            *slot = Some(call);
            *phase = Some(phase_item_id);
            *truncated |= arguments_truncated;
        }
    }

    fn upsert_result(&mut self, turn_id: TurnId, mut result: ToolResultRecord) {
        let output_truncated = truncate_string(&mut result.output, MAX_TOOL_DETAIL_BYTES);
        let state = result_state(result.status);
        if let Some(TranscriptRow::ToolCallGroup {
            result: slot,
            state: current,
            output_truncated: truncated,
            ..
        }) = self.ensure_lifecycle(turn_id, result.tool_call_id)
        {
            *slot = Some(result);
            *current = state;
            *truncated |= output_truncated;
        }
    }

    fn upsert_state(
        &mut self,
        turn_id: TurnId,
        tool_call_id: ToolCallId,
        state: ToolLifecycleState,
    ) {
        if let Some(TranscriptRow::ToolCallGroup { state: slot, .. }) =
            self.ensure_lifecycle(turn_id, tool_call_id)
        {
            *slot = state;
        }
    }

    fn upsert_approval(&mut self, mut approval: ApprovalRow) {
        approval.display_preview = approval_preview(&approval.summary);
        if let Some(TranscriptRow::ToolCallGroup {
            approval: slot,
            state,
            ..
        }) = self.ensure_lifecycle(approval.turn_id, approval.tool_call_id)
        {
            *slot = Some(Box::new(approval));
            *state = ToolLifecycleState::AwaitingApproval;
        }
    }

    fn resolve_approval(&mut self, resolution: ApprovalResolution) {
        if let Some(TranscriptRow::ToolCallGroup {
            approval: Some(approval),
            state,
            ..
        }) = self.lifecycle_mut(resolution.turn_id, resolution.tool_call_id)
            && approval_matches(approval, resolution)
        {
            approval.resolved = Some(resolution.decision);
            *state = match resolution.decision {
                ApprovalDecision::ApproveOnce => ToolLifecycleState::Queued,
                ApprovalDecision::Deny => ToolLifecycleState::Denied,
            };
        }
    }

    fn finish_turn(&mut self, turn_id: TurnId, state: TerminalState, code: Option<String>) {
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
            id: RowId::TurnStatus {
                session_id: self.session_id,
                turn_id,
            },
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
                    id: RowId::ProvisionalText { key: candidate, .. }, ..
                } | TranscriptRow::ProviderReasoning {
                    id: RowId::ProvisionalReasoning { key: candidate, .. }, ..
                } if *candidate == key
            )
        });
    }

    fn sync_provisional_rows(&mut self, key: ProvisionalKey, value: ProvisionalText) {
        self.remove_provisional_rows(key);
        if !value.text.is_empty() {
            self.push_row(TranscriptRow::AssistantText {
                id: RowId::ProvisionalText {
                    session_id: self.session_id,
                    key,
                },
                turn_id: key.turn_id,
                phase_item_id: ItemId::new(),
                text: value.text,
                provisional: true,
            });
        }
        if !value.reasoning.is_empty() {
            self.push_row(TranscriptRow::ProviderReasoning {
                id: RowId::ProvisionalReasoning {
                    session_id: self.session_id,
                    key,
                },
                turn_id: key.turn_id,
                phase_item_id: ItemId::new(),
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

fn truncate_string(value: &mut String, maximum: usize) -> bool {
    if value.len() <= maximum {
        return false;
    }
    let mut end = maximum;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    value.truncate(end);
    true
}

fn tool_kind(name: &str) -> ToolKind {
    match name {
        "read" => ToolKind::Read,
        "search" => ToolKind::Search,
        "list" | "ls" => ToolKind::List,
        "patch" | "apply_patch" => ToolKind::Patch,
        "shell" => ToolKind::Shell,
        _ => ToolKind::Other,
    }
}

fn result_state(status: ToolTerminalStatus) -> ToolLifecycleState {
    match status {
        ToolTerminalStatus::Completed => ToolLifecycleState::Succeeded,
        ToolTerminalStatus::Failed => ToolLifecycleState::Failed,
        ToolTerminalStatus::TimedOut => ToolLifecycleState::TimedOut,
        ToolTerminalStatus::Cancelled => ToolLifecycleState::Cancelled,
        ToolTerminalStatus::Interrupted => ToolLifecycleState::Interrupted,
        ToolTerminalStatus::Stale => ToolLifecycleState::Stale,
        ToolTerminalStatus::Uncertain => ToolLifecycleState::Uncertain,
    }
}

fn lifecycle_summary(
    _turn_id: TurnId,
    call: Option<&ToolCallRecord>,
    result: Option<&ToolResultRecord>,
    state: ToolLifecycleState,
) -> String {
    let action = match call.map(|call| tool_kind(&call.name)) {
        Some(ToolKind::Read) => "Read",
        Some(ToolKind::Search) => "Search",
        Some(ToolKind::List) => "List",
        Some(ToolKind::Patch) => "Patch",
        Some(ToolKind::Shell) => "Shell",
        _ => "Tool",
    };
    let outcome = match state {
        ToolLifecycleState::Validated => "validated",
        ToolLifecycleState::AwaitingApproval => "awaiting approval",
        ToolLifecycleState::Denied => "denied",
        ToolLifecycleState::Queued => "queued",
        ToolLifecycleState::Running => "running",
        ToolLifecycleState::Succeeded => "completed",
        ToolLifecycleState::Failed => "failed",
        ToolLifecycleState::TimedOut => "timed out",
        ToolLifecycleState::Cancelled => "cancelled",
        ToolLifecycleState::Interrupted => "interrupted",
        ToolLifecycleState::Stale => "stale",
        ToolLifecycleState::Uncertain => "uncertain",
    };
    let detail = if result.is_some() {
        "result available"
    } else {
        "details available"
    };
    format!("{action} {outcome}; {detail}")
}

fn lifecycle_disclosure(
    call: Option<&ToolCallRecord>,
    approval: Option<&ApprovalRow>,
    _result: Option<&ToolResultRecord>,
    state: ToolLifecycleState,
) -> Disclosure {
    if approval.is_some_and(|approval| approval.resolved.is_none()) {
        return Disclosure::Expanded;
    }
    if matches!(
        state,
        ToolLifecycleState::AwaitingApproval
            | ToolLifecycleState::Denied
            | ToolLifecycleState::Failed
            | ToolLifecycleState::TimedOut
            | ToolLifecycleState::Cancelled
            | ToolLifecycleState::Interrupted
            | ToolLifecycleState::Stale
            | ToolLifecycleState::Uncertain
            | ToolLifecycleState::Running
    ) {
        return Disclosure::Expanded;
    }
    match call.map(|call| tool_kind(&call.name)) {
        Some(ToolKind::Patch | ToolKind::Shell) => Disclosure::Expanded,
        _ => Disclosure::Collapsed,
    }
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
        turn_id: TurnId,
        approval_id: ApprovalId,
        tool_call_id: ToolCallId,
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

    fn turn() -> TurnId {
        TurnId::parse("00000000-0000-0000-0000-000000000007").unwrap()
    }
    fn other_turn() -> TurnId {
        TurnId::parse("00000000-0000-0000-0000-000000000008").unwrap()
    }
    fn request() -> BackendRequestId {
        BackendRequestId::parse("00000000-0000-0000-0000-000000000009").unwrap()
    }
    fn item() -> ItemId {
        ItemId::parse("00000000-0000-0000-0000-000000000042").unwrap()
    }
    fn call() -> ToolCallId {
        ToolCallId::parse("00000000-0000-0000-0000-000000000011").unwrap()
    }
    fn approval() -> ApprovalId {
        ApprovalId::parse("00000000-0000-0000-0000-000000000002").unwrap()
    }

    fn key() -> ProvisionalKey {
        ProvisionalKey {
            turn_id: turn(),
            request_id: request(),
            generation: 1,
        }
    }

    fn phase() -> AssistantPhaseRecord {
        AssistantPhaseRecord {
            item_id: item(),
            provider_completion_id: "provider-completion".into(),
            text: Some("completed".into()),
            reasoning: Some("private reasoning".into()),
            reasoning_required_for_replay: true,
            tool_calls: vec![ToolCallRecord {
                tool_call_id: call(),
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
            turn_id: turn(),
            key: ProvisionalKey {
                generation: 2,
                ..key()
            },
            phase: phase(),
        });
        assert_eq!(projection.provisional_count(), 1);
        projection.apply(TranscriptEvent::AssistantPhaseCompleted {
            turn_id: turn(),
            key: key(),
            phase: phase(),
        });
        assert_eq!(projection.provisional_count(), 0);
        assert!(projection.rows().iter().any(|row| matches!(row, TranscriptRow::AssistantText { text, provisional: false, .. } if text == "completed")));
        assert!(projection.rows().iter().any(|row| matches!(row, TranscriptRow::ToolCallGroup { call: Some(call), .. } if call.provider_call_id == "provider-call")));
    }

    #[test]
    fn terminal_failures_remove_provisional_content_without_promotion() {
        let mut projection = TranscriptProjection::new();
        projection.apply(TranscriptEvent::ReasoningDelta {
            key: key(),
            text: "secret".into(),
        });
        projection.apply(TranscriptEvent::TurnInterrupted { turn_id: turn() });
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
        let row = ApprovalRow::new(turn(), approval(), call(), [4; 32], "shell command".into());
        assert!(approval_matches(
            &row,
            ApprovalResolution {
                turn_id: turn(),
                approval_id: approval(),
                tool_call_id: call(),
                effect_digest: [4; 32],
                decision: ApprovalDecision::Deny
            }
        ));
        assert!(!approval_matches(
            &row,
            ApprovalResolution {
                turn_id: turn(),
                approval_id: approval(),
                tool_call_id: call(),
                effect_digest: [5; 32],
                decision: ApprovalDecision::ApproveOnce
            }
        ));
    }

    #[test]
    fn tool_results_require_turn_and_provider_call_identity() {
        let mut projection = TranscriptProjection::new();
        projection.apply(TranscriptEvent::AssistantPhaseCompleted {
            turn_id: turn(),
            key: key(),
            phase: phase(),
        });
        projection.apply(TranscriptEvent::ToolResult {
            turn_id: other_turn(),
            result: ToolResultRecord {
                tool_call_id: call(),
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
            turn_id: turn(),
            result: ToolResultRecord {
                tool_call_id: call(),
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
            turn_id: turn(),
            key: key(),
            phase: phase(),
        });
        projection.apply(TranscriptEvent::ToolResult {
            turn_id: turn(),
            result: ToolResultRecord {
                tool_call_id: call(),
                provider_call_id: "provider-call".into(),
                output: "ok".into(),
                status: ToolTerminalStatus::Completed,
            },
        });
        projection.apply(TranscriptEvent::AssistantPhaseCompleted {
            turn_id: turn(),
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
        for _index in 0..(MAX_DELTA_QUEUE + 10) {
            projection.apply(TranscriptEvent::TextDelta {
                key: ProvisionalKey {
                    turn_id: TurnId::new(),
                    request_id: BackendRequestId::new(),
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
            row: Some(RowId::Diagnostic {
                session_id: SessionId::new(),
                sequence: 1,
            }),
            offset: 4,
        });
        projection.apply(TranscriptEvent::TextDelta {
            key: key(),
            text: "delta".into(),
        });
        assert!(projection.scroll().new_activity);
        projection.apply(TranscriptEvent::AssistantPhaseCompleted {
            turn_id: turn(),
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
            id: RowId::ProviderReasoning {
                session_id: SessionId::new(),
                item_id: item(),
            },
            turn_id: turn(),
            phase_item_id: item(),
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

    #[test]
    fn lifecycle_joins_reordered_approval_and_result_without_raw_sibling_rows() {
        let session = SessionId::new();
        let mut projection = TranscriptProjection::for_session(session);
        projection.apply(TranscriptEvent::ApprovalRequested {
            approval: ApprovalRow::new(turn(), approval(), call(), [9; 32], "apply patch".into()),
        });
        projection.apply(TranscriptEvent::ToolResult {
            turn_id: turn(),
            result: ToolResultRecord {
                tool_call_id: call(),
                provider_call_id: "provider-call".into(),
                output: "changed one file".into(),
                status: ToolTerminalStatus::Completed,
            },
        });
        projection.apply(TranscriptEvent::AssistantPhaseCompleted {
            turn_id: turn(),
            key: key(),
            phase: phase(),
        });
        let id = RowId::ToolGroup {
            session_id: session,
            turn_id: turn(),
            tool_call_id: call(),
        };
        let lifecycle = projection.lifecycle(&id).expect("canonical lifecycle");
        assert_eq!(lifecycle.approval_id, Some(approval()));
        assert_eq!(lifecycle.state, ToolLifecycleState::Succeeded);
        assert_eq!(lifecycle.disclosure, Disclosure::Expanded);
        assert_eq!(
            projection
                .rows()
                .iter()
                .filter(|row| matches!(row, TranscriptRow::ToolCallGroup { .. }))
                .count(),
            1
        );
    }

    #[test]
    fn disclosure_keeps_effects_and_failures_prominent() {
        let mut projection = TranscriptProjection::for_session(SessionId::new());
        let mut patch_phase = phase();
        patch_phase.tool_calls[0].name = "patch".into();
        projection.apply(TranscriptEvent::AssistantPhaseCompleted {
            turn_id: turn(),
            key: key(),
            phase: patch_phase,
        });
        let id = projection
            .rows()
            .iter()
            .find_map(|row| match row {
                TranscriptRow::ToolCallGroup { id, .. } => Some(id.clone()),
                _ => None,
            })
            .expect("tool row");
        assert_eq!(
            projection.lifecycle(&id).map(|value| value.disclosure),
            Some(Disclosure::Expanded)
        );
        projection.apply(TranscriptEvent::ToolResult {
            turn_id: turn(),
            result: ToolResultRecord {
                tool_call_id: call(),
                provider_call_id: "provider-call".into(),
                output: String::new(),
                status: ToolTerminalStatus::Failed,
            },
        });
        assert_eq!(
            projection.lifecycle(&id).map(|value| value.disclosure),
            Some(Disclosure::Expanded)
        );
    }

    #[test]
    fn identical_canonical_fixture_rebuilds_to_identical_projection() {
        let session = SessionId::new();
        let events = vec![
            TranscriptEvent::TextDelta {
                key: key(),
                text: "partial".into(),
            },
            TranscriptEvent::AssistantPhaseCompleted {
                turn_id: turn(),
                key: key(),
                phase: phase(),
            },
            TranscriptEvent::ToolResult {
                turn_id: turn(),
                result: ToolResultRecord {
                    tool_call_id: call(),
                    provider_call_id: "provider-call".into(),
                    output: "ok".into(),
                    status: ToolTerminalStatus::Completed,
                },
            },
        ];
        let mut live = TranscriptProjection::for_session(session);
        let mut reconstructed = TranscriptProjection::for_session(session);
        for event in events.clone() {
            live.apply(event);
        }
        for event in events {
            reconstructed.apply(event);
        }
        assert_eq!(live, reconstructed);
    }
}
