use crate::agent::types::{ApprovalStatus, ToolStatus, TurnId, TurnStatus};
use crate::auth::CredentialState;

use super::action::{Intent, RuntimeEvent};
use super::state::{ActiveTurn, AppState, ApprovalProjection, StartupState, ToolProjection};

#[derive(Debug)]
pub enum Effect {
    InstallCredential { candidate: crate::auth::SecretText },
    InspectCredentialStatus,
    RemoveCredential,
    StartEphemeralTurn { turn_id: TurnId, text: String },
    CancelTurn { turn_id: TurnId },
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
                || state.active_turn.is_some()
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
        RuntimeEvent::TurnPrepared { turn_id } => {
            if state.active_turn.is_some() {
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
        RuntimeEvent::ModelStreamStarted { turn_id } => {
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
            executed,
            ..
        } => {
            with_live_turn(state, turn_id, |turn| {
                turn.pending_approval = None;
                if let Some(tool) = turn
                    .tools
                    .iter_mut()
                    .find(|tool| tool.tool_call_id == tool_call_id)
                {
                    tool.status = if executed {
                        ToolStatus::Completed
                    } else {
                        ToolStatus::Denied
                    };
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
