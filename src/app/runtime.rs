use std::sync::Arc;
use std::time::Duration;

use tokio::runtime::{Builder, Runtime};
use tokio_util::sync::CancellationToken;

use crate::agent::loop_runtime::{
    AgentError, AgentEvent, AgentLimits, run_agent_turn, run_no_tool_turn,
};
use crate::auth::api_key::CredentialActor;
use crate::backend::{BackendError, ModelBackend, ModelEvent};
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

pub struct ApplicationCoordinator {
    pub state: AppState,
    credentials: Arc<CredentialActor>,
    backend: Arc<dyn ModelBackend>,
    config: Arc<RuntimeConfig>,
    active_cancellation: Option<CancellationToken>,
    tools: Arc<dyn ToolRuntime>,
    approvals: Arc<dyn ApprovalPolicy>,
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
            active_cancellation: None,
            tools,
            approvals,
        }
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
                let result = self.credentials.install(candidate).await;
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
                let tools_enabled = !tools.definitions().is_empty();
                let state = &mut self.state;
                let result = if !tools_enabled {
                    run_no_tool_turn(backend, text, cancellation, queue, |model_event| {
                        if let Some(event) = project_model_event(turn_id, model_event) {
                            reduce(state, event.clone());
                            sink(event);
                        }
                    })
                    .await
                    .map_err(AgentError::Backend)
                } else {
                    run_agent_turn(
                        backend,
                        tools,
                        approvals,
                        turn_id,
                        text,
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
}

fn project_agent_event(
    turn_id: crate::agent::types::TurnId,
    event: &AgentEvent,
) -> Option<RuntimeEvent> {
    match event {
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
        AgentEvent::ToolStarted { tool_call_id, name } => Some(RuntimeEvent::ToolStarted {
            turn_id,
            tool_call_id: *tool_call_id,
            name: name.clone(),
        }),
        AgentEvent::ToolCompleted {
            tool_call_id,
            name,
            output,
            executed,
        } => Some(RuntimeEvent::ToolCompleted {
            turn_id,
            tool_call_id: *tool_call_id,
            name: name.clone(),
            output: output.clone(),
            executed: *executed,
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
        ModelEvent::ResponseStarted { .. } => Some(RuntimeEvent::ModelStreamStarted { turn_id }),
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
