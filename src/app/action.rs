use crate::agent::loop_runtime::LimitKind;
use crate::agent::types::{ApprovalId, ToolCallId, TurnId};
use crate::auth::{CredentialState, SecretText};
use crate::backend::{AssistantPhase, Usage};
use crate::tools::ApprovalDecision;

pub enum Intent {
    InstallCredential { candidate: SecretText },
    InspectCredentialStatus,
    RemoveCredential,
    SendEphemeralPrompt { text: String },
    CancelTurn { turn_id: TurnId },
}

impl std::fmt::Debug for Intent {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InstallCredential { .. } => formatter.write_str("InstallCredential([REDACTED])"),
            Self::InspectCredentialStatus => formatter.write_str("InspectCredentialStatus"),
            Self::RemoveCredential => formatter.write_str("RemoveCredential"),
            Self::SendEphemeralPrompt { text } => formatter
                .debug_struct("SendEphemeralPrompt")
                .field("text_bytes", &text.len())
                .finish(),
            Self::CancelTurn { turn_id } => formatter
                .debug_struct("CancelTurn")
                .field("turn_id", turn_id)
                .finish(),
        }
    }
}

#[derive(Clone)]
pub enum RuntimeEvent {
    StartupReady {
        credentials: CredentialState,
    },
    CredentialChanged {
        state: CredentialState,
    },
    TurnPrepared {
        turn_id: TurnId,
    },
    ModelStreamStarted {
        turn_id: TurnId,
    },
    ReasoningDelta {
        turn_id: TurnId,
        text: String,
    },
    TextDelta {
        turn_id: TurnId,
        text: String,
    },
    AssistantPhaseCompleted {
        turn_id: TurnId,
        phase: AssistantPhase,
    },
    ToolValidated {
        turn_id: TurnId,
        tool_call_id: ToolCallId,
        name: String,
        mutating: bool,
    },
    ApprovalRequested {
        turn_id: TurnId,
        approval_id: ApprovalId,
        tool_call_id: ToolCallId,
        effect_digest: String,
        summary: String,
    },
    ApprovalResolved {
        turn_id: TurnId,
        approval_id: ApprovalId,
        tool_call_id: ToolCallId,
        effect_digest: String,
        decision: ApprovalDecision,
    },
    ToolStarted {
        turn_id: TurnId,
        tool_call_id: ToolCallId,
        name: String,
    },
    ToolCompleted {
        turn_id: TurnId,
        tool_call_id: ToolCallId,
        name: String,
        output: String,
        executed: bool,
    },
    ContinuationStarted {
        turn_id: TurnId,
        index: usize,
    },
    LimitReached {
        turn_id: TurnId,
        limit: LimitKind,
    },
    UsageUpdated {
        turn_id: TurnId,
        usage: Usage,
    },
    TurnCompleted {
        turn_id: TurnId,
    },
    TurnFailed {
        turn_id: TurnId,
        code: &'static str,
    },
    TurnCancelled {
        turn_id: TurnId,
    },
}

impl std::fmt::Debug for RuntimeEvent {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::StartupReady { .. } => "StartupReady",
            Self::CredentialChanged { .. } => "CredentialChanged",
            Self::TurnPrepared { .. } => "TurnPrepared",
            Self::ModelStreamStarted { .. } => "ModelStreamStarted",
            Self::ReasoningDelta { .. } => "ReasoningDelta([REDACTED])",
            Self::TextDelta { .. } => "TextDelta([REDACTED])",
            Self::AssistantPhaseCompleted { .. } => "AssistantPhaseCompleted([REDACTED])",
            Self::ToolValidated { .. } => "ToolValidated",
            Self::ApprovalRequested { .. } => "ApprovalRequested",
            Self::ApprovalResolved { .. } => "ApprovalResolved",
            Self::ToolStarted { .. } => "ToolStarted",
            Self::ToolCompleted { .. } => "ToolCompleted([REDACTED])",
            Self::ContinuationStarted { .. } => "ContinuationStarted",
            Self::LimitReached { .. } => "LimitReached",
            Self::UsageUpdated { .. } => "UsageUpdated",
            Self::TurnCompleted { .. } => "TurnCompleted",
            Self::TurnFailed { .. } => "TurnFailed",
            Self::TurnCancelled { .. } => "TurnCancelled",
        })
    }
}
