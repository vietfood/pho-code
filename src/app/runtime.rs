use std::sync::Arc;
use std::time::Duration;

use tokio::runtime::{Builder, Runtime};
use tokio_util::sync::CancellationToken;

use crate::agent::loop_runtime::run_no_tool_turn;
use crate::auth::api_key::CredentialActor;
use crate::backend::{BackendError, ModelBackend, ModelEvent};

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
    pub turn_timeout: Duration,
}

pub struct ApplicationCoordinator {
    pub state: AppState,
    credentials: Arc<CredentialActor>,
    backend: Arc<dyn ModelBackend>,
    config: Arc<RuntimeConfig>,
    active_cancellation: Option<CancellationToken>,
}

impl ApplicationCoordinator {
    pub async fn new(
        credentials: Arc<CredentialActor>,
        backend: Arc<dyn ModelBackend>,
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
            Effect::CancelTurn { turn_id } => {
                let Some(cancellation) = self.active_cancellation.as_ref() else {
                    return Err(CoordinatorError::Rejected);
                };
                cancellation.cancel();
                let event = RuntimeEvent::TurnCancelled { turn_id };
                reduce(&mut self.state, event.clone());
                sink(event);
                Ok(())
            }
            Effect::StartEphemeralTurn { turn_id, text } => {
                let event = RuntimeEvent::TurnPrepared { turn_id };
                reduce(&mut self.state, event.clone());
                sink(event);
                let cancellation = external_cancellation.child_token();
                self.active_cancellation = Some(cancellation.clone());
                let backend = self.backend.clone();
                let queue = self.config.backend_event_queue;
                let state = &mut self.state;
                let result = run_no_tool_turn(backend, text, cancellation, queue, |model_event| {
                    if let Some(event) = project_model_event(turn_id, model_event) {
                        reduce(state, event.clone());
                        sink(event);
                    }
                })
                .await;
                self.active_cancellation = None;
                match result {
                    Ok(_) => {
                        let event = RuntimeEvent::TurnCompleted { turn_id };
                        reduce(&mut self.state, event.clone());
                        sink(event);
                        Ok(())
                    }
                    Err(BackendError::Cancelled) => {
                        let event = RuntimeEvent::TurnCancelled { turn_id };
                        reduce(&mut self.state, event.clone());
                        sink(event);
                        Err(CoordinatorError::Cancelled)
                    }
                    Err(error) => {
                        let event = RuntimeEvent::TurnFailed {
                            turn_id,
                            code: error_code(&error),
                        };
                        reduce(&mut self.state, event.clone());
                        sink(event);
                        Err(CoordinatorError::Backend(error))
                    }
                }
            }
        }
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
        BackendError::Cancelled => "cancelled",
        BackendError::DeliveryUnknown | BackendError::InterruptedAmbiguous => {
            "interrupted_ambiguous"
        }
        _ => "backend_failed",
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
