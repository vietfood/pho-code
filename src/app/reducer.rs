use crate::agent::types::{ApprovalStatus, ToolStatus, TurnId, TurnStatus};
use crate::auth::CredentialState;

use super::action::{Intent, RuntimeEvent};
use super::state::{
    ActiveTurn, AppState, ApprovalProjection, SessionProjection, StartupState, ToolProjection,
};

#[derive(Debug)]
pub enum Effect {
    InstallCredential {
        candidate: crate::auth::SecretText,
    },
    InspectCredentialStatus,
    RemoveCredential,
    StartEphemeralTurn {
        turn_id: TurnId,
        text: String,
    },
    StartDurableTurn {
        session_id: crate::agent::types::SessionId,
        turn_id: TurnId,
        text: String,
    },
    CancelTurn {
        turn_id: TurnId,
    },
}

pub fn reduce_intent(state: &mut AppState, intent: Intent) -> Option<Effect> {
    match intent {
        Intent::InstallCredential { candidate } => {
            if state.active_turn.is_some() {
                state.diagnose("credential_change_during_turn");
                None
            } else {
                Some(Effect::InstallCredential { candidate })
            }
        }
        Intent::InspectCredentialStatus => Some(Effect::InspectCredentialStatus),
        Intent::RemoveCredential => {
            if state.active_turn.is_some() {
                state.diagnose("credential_change_during_turn");
                None
            } else {
                Some(Effect::RemoveCredential)
            }
        }
        Intent::SendEphemeralPrompt { text } => {
            if state.startup != StartupState::Ready
                || state.credentials != CredentialState::Ready
                || state
                    .active_turn
                    .as_ref()
                    .is_some_and(|turn| !turn.status.is_terminal())
                || text.is_empty()
                || text.len() > 256 * 1024
            {
                state.diagnose("send_prompt_rejected");
                None
            } else {
                Some(Effect::StartEphemeralTurn {
                    turn_id: TurnId::new(),
                    text,
                })
            }
        }
        Intent::SendPrompt { session_id, text } => {
            let session_ready = state.session.as_ref().is_some_and(|session| {
                session.id == session_id && !session.read_only && session.workspace_available
            });
            if state.startup != StartupState::Ready
                || state.credentials != CredentialState::Ready
                || !session_ready
                || state
                    .active_turn
                    .as_ref()
                    .is_some_and(|turn| !turn.status.is_terminal())
                || text.is_empty()
                || text.len() > 256 * 1024
            {
                state.diagnose("send_prompt_rejected");
                None
            } else {
                Some(Effect::StartDurableTurn {
                    session_id,
                    turn_id: TurnId::new(),
                    text,
                })
            }
        }
        Intent::CancelTurn { turn_id } => {
            let accepted = state
                .active_turn
                .as_ref()
                .is_some_and(|turn| turn.id == turn_id && !turn.status.is_terminal());
            if accepted {
                Some(Effect::CancelTurn { turn_id })
            } else {
                state.diagnose("cancel_turn_rejected");
                None
            }
        }
    }
}

pub fn reduce(state: &mut AppState, event: RuntimeEvent) {
    match event {
        RuntimeEvent::StartupReady { credentials } => {
            state.startup = StartupState::Ready;
            state.credentials = credentials;
        }
        RuntimeEvent::CredentialChanged { state: credentials } => state.credentials = credentials,
        RuntimeEvent::SessionLoaded {
            session_id,
            messages,
            read_only,
            workspace_available,
            interrupted_turns,
            uncertain_paths,
        } => {
            state.session = Some(SessionProjection {
                id: session_id,
                messages,
                read_only,
                workspace_available,
                interrupted_turns,
                uncertain_paths,
            });
        }
        RuntimeEvent::UserMessageCommitted {
            session_id,
            item_id,
            text,
            ..
        } => {
            let Some(session) = state
                .session
                .as_mut()
                .filter(|session| session.id == session_id)
            else {
                state.diagnose("user_message_session_mismatch");
                return;
            };
            let duplicate = session.messages.iter().any(|message| {
                matches!(
                    message,
                    crate::backend::BackendMessage::User(message)
                        if message.item_id == item_id
                )
            });
            if !duplicate {
                session.messages.push(crate::backend::BackendMessage::User(
                    crate::backend::UserMessage { item_id, text },
                ));
            }
        }
        RuntimeEvent::TurnPrepared { turn_id } => {
            if state
                .active_turn
                .as_ref()
                .is_some_and(|turn| !turn.status.is_terminal())
            {
                state.diagnose("turn_already_active");
            } else {
                state.active_turn = Some(ActiveTurn {
                    id: turn_id,
                    status: TurnStatus::Preparing,
                    streamed_reasoning: String::new(),
                    streamed_text: String::new(),
                    completed_phases: Vec::new(),
                    usage: None,
                    tools: Vec::new(),
                    pending_approval: None,
                    continuations: 0,
                });
            }
        }
        RuntimeEvent::ModelStreamStarted { turn_id, .. } => {
            with_live_turn(state, turn_id, |turn| {
                turn.status = TurnStatus::StreamingModel
            });
        }
        RuntimeEvent::ReasoningDelta { turn_id, text } => {
            with_live_turn(state, turn_id, |turn| {
                turn.streamed_reasoning.push_str(&text)
            });
        }
        RuntimeEvent::TextDelta { turn_id, text } => {
            with_live_turn(state, turn_id, |turn| turn.streamed_text.push_str(&text));
        }
        RuntimeEvent::AssistantPhaseCompleted { turn_id, phase } => {
            with_live_turn(state, turn_id, |turn| turn.completed_phases.push(phase));
        }
        RuntimeEvent::ToolValidated {
            turn_id,
            tool_call_id,
            name,
            mutating,
        } => {
            with_live_turn(state, turn_id, |turn| {
                turn.tools.push(ToolProjection {
                    tool_call_id,
                    name,
                    status: ToolStatus::Validated,
                    mutating,
                });
            });
        }
        RuntimeEvent::ApprovalRequested {
            turn_id,
            approval_id,
            tool_call_id,
            effect_digest,
            ..
        } => {
            with_live_turn(state, turn_id, |turn| {
                turn.status = TurnStatus::AwaitingApproval;
                turn.pending_approval = Some(ApprovalProjection {
                    approval_id,
                    tool_call_id,
                    effect_digest,
                    status: ApprovalStatus::Pending,
                });
                if let Some(tool) = turn
                    .tools
                    .iter_mut()
                    .find(|tool| tool.tool_call_id == tool_call_id)
                {
                    tool.status = ToolStatus::AwaitingApproval;
                }
            });
        }
        RuntimeEvent::ApprovalResolved {
            turn_id,
            approval_id,
            tool_call_id,
            effect_digest,
            decision,
        } => {
            let mut stale = false;
            with_live_turn(state, turn_id, |turn| {
                let Some(approval) = turn.pending_approval.as_mut() else {
                    stale = true;
                    return;
                };
                if approval.approval_id != approval_id
                    || approval.tool_call_id != tool_call_id
                    || approval.effect_digest != effect_digest
                {
                    stale = true;
                    return;
                }
                approval.status = match decision {
                    crate::tools::ApprovalDecision::Approved => ApprovalStatus::Approved,
                    crate::tools::ApprovalDecision::Denied => ApprovalStatus::Denied,
                    crate::tools::ApprovalDecision::Unavailable => ApprovalStatus::Unavailable,
                };
            });
            if stale {
                state.diagnose("stale_approval");
            }
        }
        RuntimeEvent::ToolStarted {
            turn_id,
            tool_call_id,
            ..
        } => {
            with_live_turn(state, turn_id, |turn| {
                turn.status = TurnStatus::RunningTool;
                turn.pending_approval = None;
                if let Some(tool) = turn
                    .tools
                    .iter_mut()
                    .find(|tool| tool.tool_call_id == tool_call_id)
                {
                    tool.status = ToolStatus::Running;
                }
            });
        }
        RuntimeEvent::ToolCompleted {
            turn_id,
            tool_call_id,
            status,
            ..
        } => {
            with_live_turn(state, turn_id, |turn| {
                turn.pending_approval = None;
                if let Some(tool) = turn
                    .tools
                    .iter_mut()
                    .find(|tool| tool.tool_call_id == tool_call_id)
                {
                    tool.status = status;
                }
            });
        }
        RuntimeEvent::ContinuationStarted { turn_id, index } => {
            with_live_turn(state, turn_id, |turn| {
                turn.status = TurnStatus::ContinuingModel;
                turn.continuations = index;
            });
        }
        RuntimeEvent::LimitReached { turn_id, .. } => {
            with_live_turn(state, turn_id, |_| {});
        }
        RuntimeEvent::UsageUpdated { turn_id, usage } => {
            with_live_turn(state, turn_id, |turn| turn.usage = Some(usage));
        }
        RuntimeEvent::TurnCompleted { turn_id } => {
            terminal(state, turn_id, TurnStatus::Completed);
        }
        RuntimeEvent::TurnFailed { turn_id, code } => {
            if terminal(state, turn_id, TurnStatus::Failed) {
                state.diagnose(code);
            }
        }
        RuntimeEvent::TurnCancelled { turn_id } => {
            terminal(state, turn_id, TurnStatus::Cancelled);
        }
        RuntimeEvent::TurnInterrupted { turn_id } => {
            terminal(state, turn_id, TurnStatus::Interrupted);
        }
        RuntimeEvent::TurnUncertain { turn_id } => {
            terminal(state, turn_id, TurnStatus::Uncertain);
        }
    }
}

fn with_live_turn(
    state: &mut AppState,
    turn_id: TurnId,
    update: impl FnOnce(&mut ActiveTurn),
) -> bool {
    let Some(turn) = state.active_turn.as_mut() else {
        state.diagnose("late_or_unknown_turn_event");
        return false;
    };
    if turn.id != turn_id || turn.status.is_terminal() {
        state.diagnose("late_or_unknown_turn_event");
        return false;
    }
    update(turn);
    true
}

fn terminal(state: &mut AppState, turn_id: TurnId, status: TurnStatus) -> bool {
    with_live_turn(state, turn_id, |turn| {
        turn.status = status.clone();
        if let Some(approval) = turn.pending_approval.as_mut() {
            approval.status = ApprovalStatus::Invalidated;
        }
        for tool in &mut turn.tools {
            if !tool.status.is_terminal() {
                tool.status = match &status {
                    TurnStatus::Cancelled => ToolStatus::Cancelled,
                    TurnStatus::Uncertain => ToolStatus::Uncertain,
                    _ => ToolStatus::Failed,
                };
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ephemeral_prompt_requires_ready_credential() {
        let mut state = AppState::new(8);
        reduce(
            &mut state,
            RuntimeEvent::StartupReady {
                credentials: CredentialState::Missing,
            },
        );
        assert!(
            reduce_intent(
                &mut state,
                Intent::SendEphemeralPrompt {
                    text: "hello".into()
                }
            )
            .is_none()
        );
        reduce(
            &mut state,
            RuntimeEvent::CredentialChanged {
                state: CredentialState::Ready,
            },
        );
        assert!(matches!(
            reduce_intent(
                &mut state,
                Intent::SendEphemeralPrompt {
                    text: "hello".into()
                }
            ),
            Some(Effect::StartEphemeralTurn { .. })
        ));
    }

    #[test]
    fn late_delta_cannot_mutate_terminal_turn() {
        let mut state = AppState::new(8);
        let turn_id = TurnId::new();
        reduce(&mut state, RuntimeEvent::TurnPrepared { turn_id });
        reduce(&mut state, RuntimeEvent::TurnCompleted { turn_id });
        reduce(
            &mut state,
            RuntimeEvent::TextDelta {
                turn_id,
                text: "late".into(),
            },
        );
        assert!(state.active_turn.unwrap().streamed_text.is_empty());
    }

    #[test]
    fn durable_user_message_is_projected_once_before_turn_preparation() {
        let mut state = AppState::new(8);
        let session_id = crate::agent::types::SessionId::new();
        let turn_id = TurnId::new();
        let item_id = crate::agent::types::ItemId::new();
        reduce(
            &mut state,
            RuntimeEvent::SessionLoaded {
                session_id,
                messages: Vec::new(),
                read_only: false,
                workspace_available: true,
                interrupted_turns: Vec::new(),
                uncertain_paths: Vec::new(),
            },
        );
        let event = RuntimeEvent::UserMessageCommitted {
            session_id,
            turn_id,
            item_id,
            text: "visible immediately".into(),
        };
        reduce(&mut state, event.clone());
        reduce(&mut state, event);

        let session = state.session.as_ref().unwrap();
        assert_eq!(session.messages.len(), 1);
        assert!(matches!(
            &session.messages[0],
            crate::backend::BackendMessage::User(message)
                if message.item_id == item_id && message.text == "visible immediately"
        ));
        assert!(state.active_turn.is_none());

        reduce(&mut state, RuntimeEvent::TurnPrepared { turn_id });
        assert_eq!(
            state.active_turn.as_ref().map(|turn| turn.id),
            Some(turn_id)
        );
    }

    #[test]
    fn terminal_turn_can_be_replaced_but_live_turn_cannot() {
        let mut state = AppState::new(8);
        reduce(
            &mut state,
            RuntimeEvent::StartupReady {
                credentials: CredentialState::Ready,
            },
        );
        let first = match reduce_intent(
            &mut state,
            Intent::SendEphemeralPrompt {
                text: "first".into(),
            },
        ) {
            Some(Effect::StartEphemeralTurn { turn_id, .. }) => turn_id,
            other => panic!("unexpected first effect: {other:?}"),
        };
        reduce(&mut state, RuntimeEvent::TurnPrepared { turn_id: first });
        assert!(
            reduce_intent(
                &mut state,
                Intent::SendEphemeralPrompt {
                    text: "while live".into(),
                },
            )
            .is_none()
        );
        reduce(&mut state, RuntimeEvent::TurnCompleted { turn_id: first });
        let second = match reduce_intent(
            &mut state,
            Intent::SendEphemeralPrompt {
                text: "second".into(),
            },
        ) {
            Some(Effect::StartEphemeralTurn { turn_id, .. }) => turn_id,
            other => panic!("unexpected second effect: {other:?}"),
        };
        assert_ne!(first, second);
        reduce(&mut state, RuntimeEvent::TurnPrepared { turn_id: second });
        assert_eq!(state.active_turn.as_ref().map(|turn| turn.id), Some(second));
    }

    #[test]
    fn stale_approval_cannot_change_pending_effect() {
        let mut state = AppState::new(8);
        let turn_id = TurnId::new();
        let call_id = crate::agent::types::ToolCallId::new();
        let approval_id = crate::agent::types::ApprovalId::new();
        reduce(&mut state, RuntimeEvent::TurnPrepared { turn_id });
        reduce(
            &mut state,
            RuntimeEvent::ToolValidated {
                turn_id,
                tool_call_id: call_id,
                name: "phase2_mutate".into(),
                mutating: true,
            },
        );
        reduce(
            &mut state,
            RuntimeEvent::ApprovalRequested {
                turn_id,
                approval_id,
                tool_call_id: call_id,
                effect_digest: "effect".into(),
                summary: "summary".into(),
            },
        );
        reduce(
            &mut state,
            RuntimeEvent::ApprovalResolved {
                turn_id,
                approval_id: crate::agent::types::ApprovalId::new(),
                tool_call_id: call_id,
                effect_digest: "effect".into(),
                decision: crate::tools::ApprovalDecision::Approved,
            },
        );
        let approval = state
            .active_turn
            .as_ref()
            .unwrap()
            .pending_approval
            .as_ref()
            .unwrap();
        assert_eq!(approval.status, ApprovalStatus::Pending);
        assert_eq!(state.diagnostics.back(), Some(&"stale_approval"));
    }
}
