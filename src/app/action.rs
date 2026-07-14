use crate::agent::types::TurnId;
use crate::auth::{CredentialState, SecretText};
use crate::backend::{AssistantPhase, Usage};

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

#[derive(Clone, Debug)]
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
