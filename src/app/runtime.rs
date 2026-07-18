use std::sync::Arc;
use std::time::Duration;

use tokio::runtime::{Builder, Runtime};
use tokio_util::sync::CancellationToken;

use crate::agent::instructions::AgentInstructionProfile;
use crate::agent::loop_runtime::{
    AgentError, AgentEvent, AgentLimits, run_agent_turn_with_history_and_profile,
    run_agent_turn_with_profile, run_no_tool_turn_with_profile,
};
use crate::agent::types::{BackendRequestId, ItemId, WorkspaceId};
use crate::auth::api_key::CredentialActor;
use crate::backend::{BackendError, ModelBackend, ModelEvent};
use crate::session::OpenedSession;
use crate::session::journal::{JournalWriter, SessionEffectRecorder};
use crate::session::record::{RecordPayload, SessionProfile};
use crate::tools::{
    ApprovalDecision, ApprovalPolicy, NoToolRuntime, StaticApprovalPolicy, ToolRuntime,
};

use super::action::{Intent, RuntimeEvent};
use super::reducer::{Effect, reduce, reduce_intent};
use super::state::AppState;

#[derive(Clone, Debug)]
pub struct RuntimeConfig {
    pub canonical_event_queue: usize,
    pub ui_event_queue: usize,
    pub backend_event_queue: usize,
    pub blocking_jobs: usize,
    pub maximum_diagnostics: usize,
    pub maximum_model_continuations: usize,
    pub maximum_tool_calls: usize,
    pub maximum_tool_argument_bytes: usize,
    pub maximum_tool_result_bytes: usize,
    pub maximum_pending_approvals: usize,
    pub maximum_context_bytes: usize,
    pub maximum_context_messages: usize,
    pub turn_timeout: Duration,
}

fn persist_agent_event(
    writer: &JournalWriter,
    effects: Option<&SessionEffectRecorder>,
    profile: &SessionProfile,
    turn_id: crate::agent::types::TurnId,
    message_count: u32,
    current_request: &mut Option<BackendRequestId>,
    event: &AgentEvent,
) -> Result<(), CoordinatorError> {
    use crate::session::record;
    let append = |payload| {
        writer
            .append_payload(payload)
            .map(|_| ())
            .map_err(|_| CoordinatorError::Persistence)
    };
    match event {
        AgentEvent::BackendRequestStarting { request_id } => {
            *current_request = Some(*request_id);
            append(RecordPayload::BackendRequestStarted(
                record::BackendRequestStarted {
                    turn_id,
                    request_id: *request_id,
                    model: profile.model.clone(),
                    profile: profile.clone(),
                    message_count,
                    extra: Default::default(),
                },
            ))
        }
        AgentEvent::Model(ModelEvent::AssistantPhaseCompleted { phase }) => {
            append(RecordPayload::AssistantPhaseCompleted(
                record::AssistantPhaseCompleted {
                    turn_id,
                    phase: phase.clone(),
                    extra: Default::default(),
                },
            ))?;
            for call in &phase.tool_calls {
                append(RecordPayload::ToolCallCompleted(
                    record::ToolCallCompleted {
                        turn_id,
                        tool_call_id: call.tool_call_id,
                        provider_call_id: call.provider_call_id.clone(),
                        name: call.name.clone(),
                        arguments: call.arguments.clone(),
                        extra: Default::default(),
                    },
                ))?;
            }
            Ok(())
        }
        AgentEvent::ApprovalRequested(request) => append(RecordPayload::ApprovalRequested(
            record::ApprovalRequested {
                turn_id,
                approval_id: request.approval_id,
                tool_call_id: request.tool_call_id,
                effect_digest: request.effect_digest.clone(),
                summary: request.summary.clone(),
                extra: Default::default(),
            },
        )),
        AgentEvent::ApprovalResolved(response) => {
            append(RecordPayload::ApprovalResolved(record::ApprovalResolved {
                turn_id,
                approval_id: response.approval_id,
                tool_call_id: response.tool_call_id,
                effect_digest: response.effect_digest.clone(),
                decision: format!("{:?}", response.decision).to_ascii_lowercase(),
                extra: Default::default(),
            }))
        }
        AgentEvent::ToolStarted {
            tool_call_id,
            name,
            effect_digest,
            mutating,
        } => {
            append(RecordPayload::ToolExecutionStarted(
                record::ToolExecutionStarted {
                    turn_id,
                    tool_call_id: *tool_call_id,
                    effect_digest: effect_digest.clone(),
                    name: name.clone(),
                    mutating: *mutating,
                    extra: Default::default(),
                },
            ))?;
            if *mutating {
                effects
                    .ok_or(CoordinatorError::Persistence)?
                    .bind(effect_digest.clone(), turn_id, *tool_call_id)
                    .map_err(|_| CoordinatorError::Persistence)?;
            }
            Ok(())
        }
        AgentEvent::ToolCompleted {
            tool_call_id,
            provider_call_id,
            effect_digest,
            mutating,
            output,
            executed,
            status,
            ..
        } => {
            if *executed {
                use sha2::Digest as _;
                append(RecordPayload::ToolExecutionCompleted(
                    record::ToolExecutionCompleted {
                        turn_id,
                        tool_call_id: *tool_call_id,
                        status: format!("{status:?}").to_ascii_lowercase(),
                        effect_digest: Some(effect_digest.clone()),
                        result_digest: Some(format!(
                            "{:x}",
                            sha2::Sha256::digest(output.as_bytes())
                        )),
                        extra: Default::default(),
                    },
                ))?;
            }
            append(RecordPayload::ToolResultCompleted(
                record::ToolResultCompleted {
                    turn_id,
                    result: crate::backend::ToolResult {
                        tool_call_id: *tool_call_id,
                        provider_call_id: provider_call_id.clone(),
                        output: output.clone(),
                    },
                    status: format!("{status:?}").to_ascii_lowercase(),
                    artifact: None,
                    extra: Default::default(),
                },
            ))?;
            if *mutating && *executed {
                let effects = effects.ok_or(CoordinatorError::Persistence)?;
                if *status == crate::agent::types::ToolStatus::Uncertain {
                    effects
                        .finish_uncertain(effect_digest)
                        .map_err(|_| CoordinatorError::Persistence)?;
                } else {
                    effects
                        .finish(effect_digest)
                        .map_err(|_| CoordinatorError::Persistence)?;
                }
            }
            Ok(())
        }
        AgentEvent::UsageAccumulated { usage } => {
            let request_id = current_request.ok_or(CoordinatorError::Persistence)?;
            let estimate = crate::backend::profile::estimate_cost(usage).ok().flatten();
            append(RecordPayload::UsageObserved(record::UsageObserved {
                turn_id,
                request_id,
                usage: usage.clone(),
                observed_at: "provider-terminal".into(),
                profile: profile.clone(),
                price_profile_revision: estimate
                    .as_ref()
                    .map(|_| crate::backend::profile::PRICE_OBSERVED_ON.into()),
                currency: estimate.as_ref().map(|_| "USD".into()),
                estimated_amount: estimate.map(|value| value.nano_usd.to_string()),
                extra: Default::default(),
            }))
        }
        AgentEvent::Model(_)
        | AgentEvent::ToolValidated { .. }
        | AgentEvent::ContinuationStarted { .. }
        | AgentEvent::LimitReached { .. } => Ok(()),
    }
}

fn retain_agent_event(state: &mut AppState, event: &AgentEvent) {
    let Some(session) = state.session.as_mut() else {
        return;
    };
    match event {
        AgentEvent::Model(ModelEvent::AssistantPhaseCompleted { phase }) => session
            .messages
            .push(crate::backend::BackendMessage::Assistant(phase.clone())),
        AgentEvent::ToolCompleted {
            tool_call_id,
            provider_call_id,
            output,
            ..
        } => session.messages.push(crate::backend::BackendMessage::Tool(
            crate::backend::ToolResult {
                tool_call_id: *tool_call_id,
                provider_call_id: provider_call_id.clone(),
                output: output.clone(),
            },
        )),
        _ => {}
    }
}

async fn complete_durable_turn(
    writer: &JournalWriter,
    state: &mut AppState,
    turn_id: crate::agent::types::TurnId,
    result: Result<crate::agent::loop_runtime::TurnOutcome, AgentError>,
    sink: &mut impl FnMut(RuntimeEvent),
) -> Result<(), CoordinatorError> {
    use crate::session::record::TurnTerminal;
    let uncertain_paths = state
        .session
        .as_ref()
        .map_or_else(Vec::new, |session| session.uncertain_paths.clone());
    let (payload, event, result) = match result {
        Ok(_) => (
            RecordPayload::TurnCompleted(TurnTerminal {
                turn_id,
                reason: None,
                code: None,
                uncertain_paths: Vec::new(),
                extra: Default::default(),
            }),
            RuntimeEvent::TurnCompleted { turn_id },
            Ok(()),
        ),
        Err(AgentError::Backend(BackendError::Cancelled)) => (
            RecordPayload::TurnCancelled(TurnTerminal {
                turn_id,
                reason: Some("cancelled".into()),
                code: Some("cancelled".into()),
                uncertain_paths: Vec::new(),
                extra: Default::default(),
            }),
            RuntimeEvent::TurnCancelled { turn_id },
            Err(CoordinatorError::Cancelled),
        ),
        Err(error @ AgentError::ToolOutcomeUncertain) => (
            RecordPayload::TurnUncertain(TurnTerminal {
                turn_id,
                reason: Some("local tool outcome is uncertain".into()),
                code: Some("tool_outcome_uncertain".into()),
                uncertain_paths,
                extra: Default::default(),
            }),
            RuntimeEvent::TurnUncertain { turn_id },
            Err(CoordinatorError::Agent(error)),
        ),
        Err(
            error @ AgentError::Backend(
                BackendError::DeliveryUnknown
                | BackendError::InterruptedAmbiguous
                | BackendError::StreamEndedEarly,
            ),
        ) => (
            RecordPayload::TurnInterrupted(TurnTerminal {
                turn_id,
                reason: Some(
                    "backend request did not reach an authoritative terminal state".into(),
                ),
                code: Some(agent_error_code(&error).into()),
                uncertain_paths: Vec::new(),
                extra: Default::default(),
            }),
            RuntimeEvent::TurnInterrupted { turn_id },
            Err(CoordinatorError::Agent(error)),
        ),
        Err(error) => {
            let code = agent_error_code(&error);
            (
                RecordPayload::TurnFailed(TurnTerminal {
                    turn_id,
                    reason: Some("turn failed".into()),
                    code: Some(code.into()),
                    uncertain_paths: Vec::new(),
                    extra: Default::default(),
                }),
                RuntimeEvent::TurnFailed { turn_id, code },
                Err(CoordinatorError::Agent(error)),
            )
        }
    };
    writer
        .append_payload(payload)
        .map_err(|_| CoordinatorError::Persistence)?;
    reduce(state, event.clone());
    sink(event);
    result
}

pub struct ApplicationCoordinator {
    pub state: AppState,
    credentials: Arc<CredentialActor>,
    backend: Arc<dyn ModelBackend>,
    config: Arc<RuntimeConfig>,
    instruction_profile: AgentInstructionProfile,
    active_cancellation: Option<CancellationToken>,
    tools: Arc<dyn ToolRuntime>,
    approvals: Arc<dyn ApprovalPolicy>,
    journal: Option<Arc<JournalWriter>>,
    session_effects: Option<Arc<SessionEffectRecorder>>,
    session_profile: Option<SessionProfile>,
    workspace_id: Option<WorkspaceId>,
}

impl ApplicationCoordinator {
    pub async fn new(
        credentials: Arc<CredentialActor>,
        backend: Arc<dyn ModelBackend>,
        config: Arc<RuntimeConfig>,
    ) -> Self {
        Self::new_with_services(
            credentials,
            backend,
            Arc::new(NoToolRuntime),
            Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Unavailable)),
            config,
        )
        .await
    }

    pub async fn new_with_services(
        credentials: Arc<CredentialActor>,
        backend: Arc<dyn ModelBackend>,
        tools: Arc<dyn ToolRuntime>,
        approvals: Arc<dyn ApprovalPolicy>,
        config: Arc<RuntimeConfig>,
    ) -> Self {
        let mut state = AppState::new(config.maximum_diagnostics);
        reduce(
            &mut state,
            RuntimeEvent::StartupReady {
                credentials: credentials.status().await,
            },
        );
        Self {
            state,
            credentials,
            backend,
            config,
            instruction_profile: AgentInstructionProfile::built_in(),
            active_cancellation: None,
            tools,
            approvals,
            journal: None,
            session_effects: None,
            session_profile: None,
            workspace_id: None,
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn new_with_durable_session(
        credentials: Arc<CredentialActor>,
        backend: Arc<dyn ModelBackend>,
        tools: Arc<dyn ToolRuntime>,
        approvals: Arc<dyn ApprovalPolicy>,
        config: Arc<RuntimeConfig>,
        opened: OpenedSession,
        session_effects: Option<Arc<SessionEffectRecorder>>,
    ) -> Result<Self, CoordinatorError> {
        let profile = opened.projection.profile.clone().unwrap_or_default();
        let workspace_id = opened.projection.workspace_id.unwrap_or_default();
        let workspace_available = opened
            .projection
            .workspace
            .as_ref()
            .is_some_and(|workspace| std::path::Path::new(workspace).is_dir());
        let profile_compatible = profile == SessionProfile::default();
        let read_only = opened.recovery.read_only || opened.writer.is_none() || !profile_compatible;
        let interrupted_turns = opened
            .projection
            .turns
            .values()
            .filter(|turn| {
                matches!(
                    turn.status,
                    crate::agent::types::TurnStatus::Interrupted
                        | crate::agent::types::TurnStatus::Uncertain
                )
            })
            .map(|turn| turn.turn_id)
            .collect();
        let session_id = opened.session_id;
        let messages = opened.projection.messages.clone();
        let uncertain_paths = opened.projection.uncertain_paths.clone();
        let writer = profile_compatible.then_some(opened.writer).flatten();
        let mut application =
            Self::new_with_services(credentials, backend, tools, approvals, config).await;
        let loaded = RuntimeEvent::SessionLoaded {
            session_id,
            messages,
            read_only,
            workspace_available,
            interrupted_turns,
            uncertain_paths,
        };
        reduce(&mut application.state, loaded);
        application.journal = writer;
        application.session_effects = session_effects;
        application.session_profile = Some(profile);
        application.workspace_id = Some(workspace_id);
        Ok(application)
    }

    pub async fn dispatch(
        &mut self,
        intent: Intent,
        sink: impl FnMut(RuntimeEvent),
    ) -> Result<(), CoordinatorError> {
        self.dispatch_cancellable(intent, CancellationToken::new(), sink)
            .await
    }

    pub async fn dispatch_cancellable(
        &mut self,
        intent: Intent,
        external_cancellation: CancellationToken,
        mut sink: impl FnMut(RuntimeEvent),
    ) -> Result<(), CoordinatorError> {
        let effect = reduce_intent(&mut self.state, intent).ok_or(CoordinatorError::Rejected)?;
        match effect {
            Effect::InstallCredential { candidate } => {
                if crate::auth::validate_candidate(candidate.expose()).is_ok() {
                    let event = RuntimeEvent::CredentialChanged {
                        state: crate::auth::CredentialState::Validating,
                    };
                    reduce(&mut self.state, event.clone());
                    sink(event);
                }
                let result = tokio::select! {
                    _ = external_cancellation.cancelled() => {
                        self.credentials.cancel_install().await;
                        Err(crate::auth::AuthError::Cancelled)
                    }
                    result = self.credentials.install(candidate) => result,
                };
                let event = RuntimeEvent::CredentialChanged {
                    state: self.credentials.status().await,
                };
                reduce(&mut self.state, event.clone());
                sink(event);
                result.map_err(|_| CoordinatorError::Credential)
            }
            Effect::InspectCredentialStatus => {
                let event = RuntimeEvent::CredentialChanged {
                    state: self.credentials.status().await,
                };
                reduce(&mut self.state, event.clone());
                sink(event);
                Ok(())
            }
            Effect::RemoveCredential => {
                let result = self.credentials.logout().await;
                let event = RuntimeEvent::CredentialChanged {
                    state: self.credentials.status().await,
                };
                reduce(&mut self.state, event.clone());
                sink(event);
                result.map_err(|_| CoordinatorError::Credential)
            }
            Effect::CancelTurn { .. } => {
                let Some(cancellation) = self.active_cancellation.as_ref() else {
                    return Err(CoordinatorError::Rejected);
                };
                cancellation.cancel();
                Ok(())
            }
            Effect::StartDurableTurn {
                session_id,
                turn_id,
                text,
            } => {
                self.run_durable_turn(session_id, turn_id, text, external_cancellation, sink)
                    .await
            }
            Effect::StartEphemeralTurn { turn_id, text } => {
                let event = RuntimeEvent::TurnPrepared { turn_id };
                reduce(&mut self.state, event.clone());
                sink(event);
                let queue_limit = if self.config.backend_event_queue == 0 {
                    Some(crate::agent::loop_runtime::LimitKind::BackendEventQueue)
                } else if self.config.canonical_event_queue == 0 {
                    Some(crate::agent::loop_runtime::LimitKind::CanonicalEventQueue)
                } else if self.config.ui_event_queue == 0 {
                    Some(crate::agent::loop_runtime::LimitKind::PresentationEventQueue)
                } else {
                    None
                };
                if let Some(limit) = queue_limit {
                    let event = RuntimeEvent::LimitReached { turn_id, limit };
                    reduce(&mut self.state, event.clone());
                    sink(event);
                    let event = RuntimeEvent::TurnFailed {
                        turn_id,
                        code: "limit_reached",
                    };
                    reduce(&mut self.state, event.clone());
                    sink(event);
                    return Err(CoordinatorError::Agent(AgentError::Limit(limit)));
                }
                let cancellation = external_cancellation.child_token();
                self.active_cancellation = Some(cancellation.clone());
                let backend = self.backend.clone();
                let queue = self.config.backend_event_queue;
                let tools = self.tools.clone();
                let approvals = self.approvals.clone();
                let config = self.config.clone();
                let instruction_profile = self.instruction_profile.clone();
                let tools_enabled = !tools.definitions().is_empty();
                let state = &mut self.state;
                let result = if !tools_enabled {
                    run_no_tool_turn_with_profile(
                        backend,
                        text,
                        instruction_profile,
                        cancellation,
                        queue,
                        |model_event| {
                            if let Some(event) = project_model_event(turn_id, model_event) {
                                reduce(state, event.clone());
                                sink(event);
                            }
                        },
                    )
                    .await
                    .map_err(AgentError::Backend)
                } else {
                    run_agent_turn_with_profile(
                        backend,
                        tools,
                        approvals,
                        turn_id,
                        text,
                        instruction_profile,
                        cancellation,
                        queue,
                        AgentLimits {
                            maximum_context_bytes: config.maximum_context_bytes,
                            maximum_context_messages: config.maximum_context_messages,
                            maximum_model_continuations: config.maximum_model_continuations,
                            maximum_tool_calls: config.maximum_tool_calls,
                            maximum_tool_argument_bytes: config.maximum_tool_argument_bytes,
                            maximum_tool_result_bytes: config.maximum_tool_result_bytes,
                            maximum_pending_approvals: config.maximum_pending_approvals,
                            turn_timeout: config.turn_timeout,
                        },
                        |agent_event| {
                            if let Some(event) = project_agent_event(turn_id, agent_event) {
                                reduce(state, event.clone());
                                sink(event);
                            }
                        },
                    )
                    .await
                };
                self.active_cancellation = None;
                match result {
                    Ok(_) => {
                        let event = RuntimeEvent::TurnCompleted { turn_id };
                        reduce(&mut self.state, event.clone());
                        sink(event);
                        Ok(())
                    }
                    Err(AgentError::Backend(BackendError::Cancelled)) => {
                        let event = RuntimeEvent::TurnCancelled { turn_id };
                        reduce(&mut self.state, event.clone());
                        sink(event);
                        Err(CoordinatorError::Cancelled)
                    }
                    Err(AgentError::ToolOutcomeUncertain) => {
                        let event = RuntimeEvent::TurnUncertain { turn_id };
                        reduce(&mut self.state, event.clone());
                        sink(event);
                        Err(CoordinatorError::Agent(AgentError::ToolOutcomeUncertain))
                    }
                    Err(error) => {
                        if matches!(
                            error,
                            AgentError::Backend(BackendError::AuthorizationRejected)
                        ) {
                            let event = RuntimeEvent::CredentialChanged {
                                state: self.credentials.status().await,
                            };
                            reduce(&mut self.state, event.clone());
                            sink(event);
                        }
                        let event = RuntimeEvent::TurnFailed {
                            turn_id,
                            code: agent_error_code(&error),
                        };
                        reduce(&mut self.state, event.clone());
                        sink(event);
                        Err(CoordinatorError::Agent(error))
                    }
                }
            }
        }
    }

    async fn run_durable_turn(
        &mut self,
        session_id: crate::agent::types::SessionId,
        turn_id: crate::agent::types::TurnId,
        text: String,
        external_cancellation: CancellationToken,
        mut sink: impl FnMut(RuntimeEvent),
    ) -> Result<(), CoordinatorError> {
        let writer = self.journal.clone().ok_or(CoordinatorError::Session)?;
        let profile = self
            .session_profile
            .clone()
            .ok_or(CoordinatorError::Session)?;
        let workspace_id = self.workspace_id.ok_or(CoordinatorError::Session)?;
        self.state
            .session
            .as_ref()
            .filter(|session| session.id == session_id)
            .ok_or(CoordinatorError::Session)?;
        let item_id = ItemId::new();
        writer
            .append_payload(RecordPayload::TurnStarted(
                crate::session::record::TurnStarted {
                    turn_id,
                    item_id,
                    workspace_id,
                    extra: Default::default(),
                },
            ))
            .and_then(|_| {
                writer.append_payload(RecordPayload::UserMessageCompleted(
                    crate::session::record::UserMessageCompleted {
                        turn_id,
                        item_id,
                        text: text.clone(),
                        extra: Default::default(),
                    },
                ))
            })
            .map_err(|_| CoordinatorError::Persistence)?;
        let event = RuntimeEvent::UserMessageCommitted {
            session_id,
            turn_id,
            item_id,
            text,
        };
        reduce(&mut self.state, event.clone());
        sink(event);
        let history = self
            .state
            .session
            .as_ref()
            .filter(|session| session.id == session_id)
            .ok_or(CoordinatorError::Session)?
            .messages
            .clone();
        let event = RuntimeEvent::TurnPrepared { turn_id };
        reduce(&mut self.state, event.clone());
        sink(event);
        let queue_limit = if self.config.backend_event_queue == 0 {
            Some(crate::agent::loop_runtime::LimitKind::BackendEventQueue)
        } else if self.config.canonical_event_queue == 0 {
            Some(crate::agent::loop_runtime::LimitKind::CanonicalEventQueue)
        } else if self.config.ui_event_queue == 0 {
            Some(crate::agent::loop_runtime::LimitKind::PresentationEventQueue)
        } else {
            None
        };
        if let Some(limit) = queue_limit {
            let terminal = crate::session::record::TurnTerminal {
                turn_id,
                reason: Some("runtime queue capacity is zero".into()),
                code: Some("limit_reached".into()),
                uncertain_paths: Vec::new(),
                extra: Default::default(),
            };
            writer
                .append_payload(RecordPayload::TurnFailed(terminal))
                .map_err(|_| CoordinatorError::Persistence)?;
            let event = RuntimeEvent::LimitReached { turn_id, limit };
            reduce(&mut self.state, event.clone());
            sink(event);
            let event = RuntimeEvent::TurnFailed {
                turn_id,
                code: "limit_reached",
            };
            reduce(&mut self.state, event.clone());
            sink(event);
            return Err(CoordinatorError::Agent(AgentError::Limit(limit)));
        }
        let cancellation = external_cancellation.child_token();
        self.active_cancellation = Some(cancellation.clone());
        let backend = self.backend.clone();
        let tools = self.tools.clone();
        let approvals = self.approvals.clone();
        let config = self.config.clone();
        let instruction_profile = self.instruction_profile.clone();
        let effects = self.session_effects.clone();
        let state = &mut self.state;
        let mut current_request = None;
        let mut persistence_failed = false;
        let result = run_agent_turn_with_history_and_profile(
            backend,
            tools,
            approvals,
            turn_id,
            history,
            instruction_profile,
            cancellation.clone(),
            config.backend_event_queue,
            AgentLimits {
                maximum_context_bytes: config.maximum_context_bytes,
                maximum_context_messages: config.maximum_context_messages,
                maximum_model_continuations: config.maximum_model_continuations,
                maximum_tool_calls: config.maximum_tool_calls,
                maximum_tool_argument_bytes: config.maximum_tool_argument_bytes,
                maximum_tool_result_bytes: config.maximum_tool_result_bytes,
                maximum_pending_approvals: config.maximum_pending_approvals,
                turn_timeout: config.turn_timeout,
            },
            |agent_event| {
                if persist_agent_event(
                    &writer,
                    effects.as_deref(),
                    &profile,
                    turn_id,
                    u32::try_from(
                        state
                            .session
                            .as_ref()
                            .map_or(0, |session| session.messages.len()),
                    )
                    .unwrap_or(u32::MAX),
                    &mut current_request,
                    agent_event,
                )
                .is_err()
                {
                    persistence_failed = true;
                    cancellation.cancel();
                    return;
                }
                retain_agent_event(state, agent_event);
                if let Some(event) = project_agent_event(turn_id, agent_event) {
                    reduce(state, event.clone());
                    sink(event);
                }
            },
        )
        .await;
        self.active_cancellation = None;
        if persistence_failed {
            let event = RuntimeEvent::TurnInterrupted { turn_id };
            reduce(&mut self.state, event.clone());
            sink(event);
            return Err(CoordinatorError::Persistence);
        }
        complete_durable_turn(&writer, &mut self.state, turn_id, result, &mut sink).await
    }
}

fn project_agent_event(
    turn_id: crate::agent::types::TurnId,
    event: &AgentEvent,
) -> Option<RuntimeEvent> {
    match event {
        AgentEvent::BackendRequestStarting { .. } => None,
        AgentEvent::Model(event) => project_model_event(turn_id, event),
        AgentEvent::ToolValidated {
            tool_call_id,
            name,
            mutating,
        } => Some(RuntimeEvent::ToolValidated {
            turn_id,
            tool_call_id: *tool_call_id,
            name: name.clone(),
            mutating: *mutating,
        }),
        AgentEvent::ApprovalRequested(request) => Some(RuntimeEvent::ApprovalRequested {
            turn_id,
            approval_id: request.approval_id,
            tool_call_id: request.tool_call_id,
            effect_digest: request.effect_digest.clone(),
            summary: request.summary.clone(),
        }),
        AgentEvent::ApprovalResolved(response) => Some(RuntimeEvent::ApprovalResolved {
            turn_id,
            approval_id: response.approval_id,
            tool_call_id: response.tool_call_id,
            effect_digest: response.effect_digest.clone(),
            decision: response.decision,
        }),
        AgentEvent::ToolStarted {
            tool_call_id,
            name,
            effect_digest,
            mutating,
        } => Some(RuntimeEvent::ToolStarted {
            turn_id,
            tool_call_id: *tool_call_id,
            name: name.clone(),
            effect_digest: effect_digest.clone(),
            mutating: *mutating,
        }),
        AgentEvent::ToolCompleted {
            tool_call_id,
            provider_call_id,
            name,
            effect_digest,
            mutating,
            output,
            executed,
            status,
        } => Some(RuntimeEvent::ToolCompleted {
            turn_id,
            tool_call_id: *tool_call_id,
            provider_call_id: provider_call_id.clone(),
            name: name.clone(),
            effect_digest: effect_digest.clone(),
            mutating: *mutating,
            output: output.clone(),
            executed: *executed,
            status: *status,
        }),
        AgentEvent::ContinuationStarted { index } => Some(RuntimeEvent::ContinuationStarted {
            turn_id,
            index: *index,
        }),
        AgentEvent::UsageAccumulated { usage } => Some(RuntimeEvent::UsageUpdated {
            turn_id,
            usage: usage.clone(),
        }),
        AgentEvent::LimitReached { limit } => Some(RuntimeEvent::LimitReached {
            turn_id,
            limit: *limit,
        }),
    }
}

fn project_model_event(
    turn_id: crate::agent::types::TurnId,
    event: &ModelEvent,
) -> Option<RuntimeEvent> {
    match event {
        ModelEvent::ResponseStarted {
            request_id, model, ..
        } => Some(RuntimeEvent::ModelStreamStarted {
            turn_id,
            request_id: *request_id,
            model: model.clone(),
        }),
        ModelEvent::ReasoningDelta { text } => Some(RuntimeEvent::ReasoningDelta {
            turn_id,
            text: text.clone(),
        }),
        ModelEvent::TextDelta { text } => Some(RuntimeEvent::TextDelta {
            turn_id,
            text: text.clone(),
        }),
        ModelEvent::AssistantPhaseCompleted { phase } => {
            Some(RuntimeEvent::AssistantPhaseCompleted {
                turn_id,
                phase: phase.clone(),
            })
        }
        ModelEvent::UsageUpdated { usage } => Some(RuntimeEvent::UsageUpdated {
            turn_id,
            usage: usage.clone(),
        }),
        _ => None,
    }
}

fn error_code(error: &BackendError) -> &'static str {
    match error {
        BackendError::AuthorizationRejected => "credential_invalid",
        BackendError::InsufficientBalance => "insufficient_balance",
        BackendError::RateLimited => "rate_limited",
        BackendError::ModelUnavailable => "model_unavailable",
        BackendError::RequestInvalid => "request_invalid",
        BackendError::RequestRejected => "request_rejected",
        BackendError::ContentFiltered => "content_filtered",
        BackendError::OutputLimit => "output_limit",
        BackendError::ResourceInterrupted => "resource_interrupted",
        BackendError::SseMalformed(_) => "sse_malformed",
        BackendError::SseOversized(_) => "sse_oversized",
        BackendError::StreamEndedEarly => "stream_ended_early",
        BackendError::ChoiceIncompatible => "choice_incompatible",
        BackendError::FinishReasonMissing => "finish_reason_missing",
        BackendError::EventIncompatible(_) => "event_incompatible",
        BackendError::ReplayStateMissing => "replay_state_missing",
        BackendError::CancellationUnacknowledged => "cancellation_unacknowledged",
        BackendError::Cancelled => "cancelled",
        BackendError::DeliveryUnknown | BackendError::InterruptedAmbiguous => {
            "interrupted_ambiguous"
        }
        _ => "backend_failed",
    }
}

fn agent_error_code(error: &AgentError) -> &'static str {
    match error {
        AgentError::Backend(error) => error_code(error),
        AgentError::Limit(_) => "limit_reached",
        AgentError::Context(_) => "context_invalid",
        AgentError::Tool(_) => "tool_failed",
        AgentError::StaleApproval => "stale_approval",
        AgentError::ToolOutcomeUncertain => "tool_outcome_uncertain",
    }
}

#[derive(Debug, thiserror::Error)]
pub enum CoordinatorError {
    #[error("intent was rejected")]
    Rejected,
    #[error("credential operation failed")]
    Credential,
    #[error("model operation was cancelled")]
    Cancelled,
    #[error("durable session is unavailable")]
    Session,
    #[error("session persistence failed")]
    Persistence,
    #[error(transparent)]
    Backend(BackendError),
    #[error(transparent)]
    Agent(AgentError),
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            canonical_event_queue: 256,
            ui_event_queue: 256,
            backend_event_queue: 128,
            blocking_jobs: 4,
            maximum_diagnostics: 128,
            maximum_model_continuations: 16,
            maximum_tool_calls: 32,
            maximum_tool_argument_bytes: 64 * 1024,
            maximum_tool_result_bytes: 128 * 1024,
            maximum_pending_approvals: 1,
            maximum_context_bytes: 8 * 1024 * 1024,
            maximum_context_messages: 4096,
            turn_timeout: Duration::from_secs(15 * 60),
        }
    }
}

pub struct AppRuntime {
    runtime: Runtime,
    config: Arc<RuntimeConfig>,
}

impl AppRuntime {
    pub fn new() -> Result<Self, std::io::Error> {
        let runtime = Builder::new_multi_thread()
            .worker_threads(2)
            .thread_name("pho-code-runtime")
            .enable_all()
            .build()?;
        Ok(Self {
            runtime,
            config: Arc::new(RuntimeConfig::default()),
        })
    }

    pub fn handle(&self) -> tokio::runtime::Handle {
        self.runtime.handle().clone()
    }

    pub fn config(&self) -> Arc<RuntimeConfig> {
        Arc::clone(&self.config)
    }
}
