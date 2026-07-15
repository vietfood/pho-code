use std::io::{self, Write};
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use pho_code::agent::types::{
    ApprovalId, BackendRequestId, ItemId, ToolCallId, ToolStatus, TurnStatus,
};
use pho_code::app::action::{Intent, RuntimeEvent};
use pho_code::app::instance_lock::InstanceGuard;
use pho_code::app::runtime::{ApplicationCoordinator, CoordinatorError, RuntimeConfig};
use pho_code::auth::api_key::{CredentialActor, CredentialValidator, ValidationResult};
use pho_code::auth::keychain::{CredentialStore, MemoryCredentialStore};
use pho_code::auth::{AuthError, CredentialRecord};
use pho_code::backend::profile::{MODEL, PROFILE_REVISION};
use pho_code::backend::scripted::{ScriptedBackend, ScriptedResponse, ScriptedStep};
use pho_code::backend::{
    AssistantPhase, BackendMessage, CompletedToolCall, FinishClass, ModelEvent,
    ProviderCompatibility, Usage,
};
use pho_code::cli::command::{self, ChatPresentation, Command, PromptSource};
use pho_code::cli::renderer::Renderer;
use pho_code::tools::{
    ApprovalDecision, ApprovalPolicy, ApprovalRequest, ApprovalResponse, ScriptedToolRuntime,
    StaticApprovalPolicy,
};
use tokio_util::sync::CancellationToken;

struct UnusedValidator;

impl CredentialValidator for UnusedValidator {
    fn validate<'a>(
        &'a self,
        _: &'a pho_code::auth::SecretText,
    ) -> Pin<Box<dyn std::future::Future<Output = Result<ValidationResult, AuthError>> + Send + 'a>>
    {
        Box::pin(async { Err(AuthError::ValidationFailed) })
    }
}

fn ready_credentials(directory: &tempfile::TempDir) -> Arc<CredentialActor> {
    let guard = Box::leak(Box::new(
        InstanceGuard::acquire(&directory.path().join("instance.lock")).unwrap(),
    ));
    let store = Arc::new(MemoryCredentialStore::empty());
    store
        .replace(
            &CredentialRecord::new(
                "fixture-key".into(),
                PROFILE_REVISION,
                0,
                "fixture-model-set".into(),
            )
            .unwrap(),
        )
        .unwrap();
    Arc::new(CredentialActor::new(guard, store, Arc::new(UnusedValidator)).unwrap())
}

fn usage() -> Usage {
    Usage {
        prompt_tokens: Some(1),
        cache_hit_tokens: Some(0),
        cache_miss_tokens: Some(1),
        output_tokens: Some(1),
        reasoning_tokens: Some(1),
        total_tokens: Some(2),
    }
}

fn phase(calls: Vec<CompletedToolCall>) -> AssistantPhase {
    AssistantPhase {
        item_id: ItemId::new(),
        provider_completion_id: "fixture-completion".into(),
        text: calls.is_empty().then(|| "done".into()),
        reasoning: Some("fixture-reasoning".into()),
        reasoning_required_for_replay: !calls.is_empty(),
        tool_calls: calls,
        compatibility: ProviderCompatibility {
            model: MODEL.into(),
            system_fingerprint: None,
        },
    }
}

fn response(phase: AssistantPhase, finish: FinishClass, deltas: bool) -> Vec<ModelEvent> {
    let mut events = vec![ModelEvent::ResponseStarted {
        request_id: BackendRequestId::new(),
        provider_completion_id: Some("fixture-completion".into()),
        model: MODEL.into(),
    }];
    if deltas {
        events.extend([
            ModelEvent::ReasoningDelta {
                text: "thinking".into(),
            },
            ModelEvent::TextDelta {
                text: "answer".into(),
            },
        ]);
    }
    events.extend([
        ModelEvent::AssistantPhaseCompleted { phase },
        ModelEvent::UsageUpdated { usage: usage() },
        ModelEvent::ResponseCompleted {
            request_id: BackendRequestId::new(),
            provider_completion_id: "fixture-completion".into(),
            model: MODEL.into(),
            finish,
        },
    ]);
    events
}

fn call(name: &str) -> CompletedToolCall {
    CompletedToolCall {
        tool_call_id: ToolCallId::new(),
        provider_call_id: format!("{name}-call"),
        name: name.into(),
        arguments: "{\"value\":\"ok\"}".into(),
    }
}

#[tokio::test]
async fn repeated_ephemeral_turns_never_reuse_displayed_history_as_context() {
    let directory = tempfile::tempdir().unwrap();
    let backend = Arc::new(ScriptedBackend::new([
        response(phase(Vec::new()), FinishClass::Stop, false),
        response(phase(Vec::new()), FinishClass::Stop, false),
    ]));
    let mut app = ApplicationCoordinator::new_with_services(
        ready_credentials(&directory),
        backend.clone(),
        Arc::new(ScriptedToolRuntime::default()),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Unavailable)),
        Arc::new(RuntimeConfig::default()),
    )
    .await;

    for prompt in ["first independent prompt", "second independent prompt"] {
        app.dispatch(
            Intent::SendEphemeralPrompt {
                text: prompt.into(),
            },
            |_| {},
        )
        .await
        .unwrap();
    }

    let requests = backend.request_snapshot().unwrap();
    assert_eq!(requests.len(), 2);
    for (request, expected) in requests
        .iter()
        .zip(["first independent prompt", "second independent prompt"])
    {
        assert_eq!(request.messages.len(), 1);
        assert!(matches!(
            request.messages.as_slice(),
            [BackendMessage::User(user)] if user.text == expected
        ));
    }
}

#[derive(Clone, Default)]
struct SharedWriter(Arc<Mutex<Vec<u8>>>);

impl SharedWriter {
    fn text(&self) -> String {
        String::from_utf8(self.0.lock().unwrap().clone()).unwrap()
    }
}

impl Write for SharedWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[tokio::test]
async fn scripted_command_path_renders_and_reduces_tool_continuation() {
    assert_eq!(
        command::parse(["chat".into(), "--stdin".into()]),
        Ok(Command::Chat {
            source: PromptSource::Stdin,
            presentation: ChatPresentation::Raw,
        })
    );
    assert_eq!(
        command::parse(["chat".into()]),
        Ok(Command::Chat {
            source: PromptSource::ControllingTerminal,
            presentation: ChatPresentation::Interactive,
        })
    );
    assert!(command::parse(["chat".into(), "--scripted".into()]).is_err());
    let directory = tempfile::tempdir().unwrap();
    let backend = Arc::new(ScriptedBackend::new([
        response(
            phase(vec![call("phase2_read")]),
            FinishClass::ToolCalls,
            false,
        ),
        response(phase(vec![]), FinishClass::Stop, true),
    ]));
    let tools = Arc::new(ScriptedToolRuntime::default());
    let mut app = ApplicationCoordinator::new_with_services(
        ready_credentials(&directory),
        backend.clone(),
        tools.clone(),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Unavailable)),
        Arc::new(RuntimeConfig::default()),
    )
    .await;
    let stdout = SharedWriter::default();
    let stderr = SharedWriter::default();
    let mut renderer = Renderer::new(Box::new(stdout.clone()), Box::new(stderr.clone()));
    let mut trace = Vec::new();
    app.dispatch(
        Intent::SendEphemeralPrompt {
            text: "fixture prompt".into(),
        },
        |event| {
            trace.push(format!("{event:?}"));
            renderer.render(&event).unwrap();
        },
    )
    .await
    .unwrap();
    renderer.finish().unwrap();

    let turn = app.state.active_turn.as_ref().unwrap();
    assert_eq!(turn.status, TurnStatus::Completed);
    assert_eq!(turn.completed_phases.len(), 2);
    assert_eq!(turn.continuations, 1);
    assert_eq!(turn.tools[0].status, ToolStatus::Completed);
    assert_eq!(tools.executed_count(), 1);
    assert_eq!(backend.request_snapshot().unwrap().len(), 2);
    assert!(trace.iter().any(|event| event == "ToolValidated"));
    assert!(trace.iter().all(|event| !event.contains("fixture prompt")));
    assert!(stdout.text().contains("answer"));
    assert!(
        stderr
            .text()
            .contains("tool result: phase2_read executed=true read:ok")
    );
}

#[tokio::test]
async fn noninteractive_denial_is_paired_without_execution() {
    let directory = tempfile::tempdir().unwrap();
    let backend = Arc::new(ScriptedBackend::new([
        response(
            phase(vec![call("phase2_mutate")]),
            FinishClass::ToolCalls,
            false,
        ),
        response(phase(vec![]), FinishClass::Stop, false),
    ]));
    let tools = Arc::new(ScriptedToolRuntime::default());
    let mut app = ApplicationCoordinator::new_with_services(
        ready_credentials(&directory),
        backend,
        tools.clone(),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Unavailable)),
        Arc::new(RuntimeConfig::default()),
    )
    .await;
    let mut events = Vec::new();
    app.dispatch(
        Intent::SendEphemeralPrompt {
            text: "fixture prompt".into(),
        },
        |event| events.push(event),
    )
    .await
    .unwrap();
    assert_eq!(tools.executed_count(), 0);
    assert!(events.iter().any(|event| matches!(
        event,
        RuntimeEvent::ApprovalResolved {
            decision: ApprovalDecision::Unavailable,
            ..
        }
    )));
    assert!(events.iter().any(|event| matches!(
        event,
        RuntimeEvent::ToolCompleted {
            executed: false,
            ..
        }
    )));
}

struct StaleApproval;

impl ApprovalPolicy for StaleApproval {
    fn decide<'a>(
        &'a self,
        request: &'a ApprovalRequest,
    ) -> Pin<Box<dyn std::future::Future<Output = ApprovalResponse> + Send + 'a>> {
        Box::pin(async move {
            ApprovalResponse {
                turn_id: request.turn_id,
                approval_id: ApprovalId::new(),
                tool_call_id: request.tool_call_id,
                effect_digest: request.effect_digest.clone(),
                decision: ApprovalDecision::Approved,
            }
        })
    }
}

#[tokio::test]
async fn stale_approval_fails_before_mutation() {
    let directory = tempfile::tempdir().unwrap();
    let backend = Arc::new(ScriptedBackend::new([response(
        phase(vec![call("phase2_mutate")]),
        FinishClass::ToolCalls,
        false,
    )]));
    let tools = Arc::new(ScriptedToolRuntime::default());
    let mut app = ApplicationCoordinator::new_with_services(
        ready_credentials(&directory),
        backend,
        tools.clone(),
        Arc::new(StaleApproval),
        Arc::new(RuntimeConfig::default()),
    )
    .await;
    let result = app
        .dispatch(
            Intent::SendEphemeralPrompt {
                text: "fixture prompt".into(),
            },
            |_| {},
        )
        .await;
    assert!(matches!(result, Err(CoordinatorError::Agent(_))));
    assert_eq!(tools.executed_count(), 0);
    assert_eq!(app.state.active_turn.unwrap().status, TurnStatus::Failed);
}

#[tokio::test]
async fn cancellation_waits_for_scripted_backend_acknowledgement() {
    let directory = tempfile::tempdir().unwrap();
    let backend = Arc::new(ScriptedBackend::from_responses([ScriptedResponse::new([
        ScriptedStep::Emit(ModelEvent::ResponseStarted {
            request_id: BackendRequestId::new(),
            provider_completion_id: Some("fixture-completion".into()),
            model: MODEL.into(),
        }),
        ScriptedStep::Emit(ModelEvent::ReasoningDelta {
            text: "fixture reasoning".into(),
        }),
        ScriptedStep::WaitForCancellation {
            stage: pho_code::backend::CancellationStage::AfterStreamStarted,
        },
    ])]));
    let mut app = ApplicationCoordinator::new_with_services(
        ready_credentials(&directory),
        backend.clone(),
        Arc::new(ScriptedToolRuntime::default()),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Unavailable)),
        Arc::new(RuntimeConfig::default()),
    )
    .await;
    let cancellation = CancellationToken::new();
    let child_cancellation = cancellation.clone();
    let running = tokio::spawn(async move {
        let events = Arc::new(Mutex::new(Vec::new()));
        let captured = events.clone();
        let result = app
            .dispatch_cancellable(
                Intent::SendEphemeralPrompt {
                    text: "fixture prompt".into(),
                },
                child_cancellation,
                move |event| captured.lock().unwrap().push(event),
            )
            .await;
        (app, result, events)
    });
    backend.wait_for_request_count(1).await.unwrap();
    cancellation.cancel();
    let (app, result, events) = running.await.unwrap();
    assert!(matches!(result, Err(CoordinatorError::Cancelled)));
    assert_eq!(app.state.active_turn.unwrap().status, TurnStatus::Cancelled);
    assert_eq!(
        events
            .lock()
            .unwrap()
            .iter()
            .filter(|event| matches!(event, RuntimeEvent::TurnCancelled { .. }))
            .count(),
        1
    );
}

struct FailingWriter;

impl Write for FailingWriter {
    fn write(&mut self, _: &[u8]) -> io::Result<usize> {
        Err(io::Error::new(io::ErrorKind::BrokenPipe, "fixture"))
    }

    fn flush(&mut self) -> io::Result<()> {
        Err(io::Error::new(io::ErrorKind::BrokenPipe, "fixture"))
    }
}

#[tokio::test]
async fn presentation_failure_cancels_before_backend_effects_continue() {
    let directory = tempfile::tempdir().unwrap();
    let backend = Arc::new(ScriptedBackend::from_responses([ScriptedResponse::new([
        ScriptedStep::Emit(ModelEvent::ResponseStarted {
            request_id: BackendRequestId::new(),
            provider_completion_id: Some("fixture-completion".into()),
            model: MODEL.into(),
        }),
        ScriptedStep::Emit(ModelEvent::ReasoningDelta {
            text: "fixture reasoning".into(),
        }),
        ScriptedStep::WaitForCancellation {
            stage: pho_code::backend::CancellationStage::AfterStreamStarted,
        },
    ])]));
    let mut app = ApplicationCoordinator::new_with_services(
        ready_credentials(&directory),
        backend,
        Arc::new(ScriptedToolRuntime::default()),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Unavailable)),
        Arc::new(RuntimeConfig::default()),
    )
    .await;
    let cancellation = CancellationToken::new();
    let render_cancellation = cancellation.clone();
    let mut renderer = Renderer::new(Box::new(FailingWriter), Box::new(FailingWriter));
    let result = app
        .dispatch_cancellable(
            Intent::SendEphemeralPrompt {
                text: "fixture prompt".into(),
            },
            cancellation,
            |event| {
                if renderer.render(&event).is_err() {
                    render_cancellation.cancel();
                }
            },
        )
        .await;
    assert!(matches!(result, Err(CoordinatorError::Cancelled)));
}

#[tokio::test]
async fn turn_duration_limit_is_visible_and_terminal() {
    let directory = tempfile::tempdir().unwrap();
    let backend = Arc::new(ScriptedBackend::from_responses([ScriptedResponse::new([
        ScriptedStep::WaitForCancellation {
            stage: pho_code::backend::CancellationStage::BeforeFirstEvent,
        },
    ])]));
    let config = RuntimeConfig {
        turn_timeout: Duration::from_millis(20),
        ..RuntimeConfig::default()
    };
    let mut app = ApplicationCoordinator::new_with_services(
        ready_credentials(&directory),
        backend,
        Arc::new(ScriptedToolRuntime::default()),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Unavailable)),
        Arc::new(config),
    )
    .await;
    let mut events = Vec::new();
    let result = app
        .dispatch(
            Intent::SendEphemeralPrompt {
                text: "fixture prompt".into(),
            },
            |event| events.push(event),
        )
        .await;
    assert!(matches!(result, Err(CoordinatorError::Agent(_))));
    assert!(events.iter().any(|event| matches!(
        event,
        RuntimeEvent::LimitReached {
            limit: pho_code::agent::loop_runtime::LimitKind::TurnDuration,
            ..
        }
    )));
    assert_eq!(app.state.active_turn.unwrap().status, TurnStatus::Failed);
}

#[tokio::test]
async fn zero_capacity_queue_limits_fail_visibly_before_backend_send() {
    for config in [
        RuntimeConfig {
            backend_event_queue: 0,
            ..RuntimeConfig::default()
        },
        RuntimeConfig {
            canonical_event_queue: 0,
            ..RuntimeConfig::default()
        },
        RuntimeConfig {
            ui_event_queue: 0,
            ..RuntimeConfig::default()
        },
    ] {
        let directory = tempfile::tempdir().unwrap();
        let backend = Arc::new(ScriptedBackend::empty());
        let mut app = ApplicationCoordinator::new_with_services(
            ready_credentials(&directory),
            backend.clone(),
            Arc::new(ScriptedToolRuntime::default()),
            Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Unavailable)),
            Arc::new(config),
        )
        .await;
        let mut events = Vec::new();
        let result = app
            .dispatch(
                Intent::SendEphemeralPrompt {
                    text: "fixture prompt".into(),
                },
                |event| events.push(event),
            )
            .await;
        assert!(matches!(result, Err(CoordinatorError::Agent(_))));
        assert!(
            events
                .iter()
                .any(|event| matches!(event, RuntimeEvent::LimitReached { .. }))
        );
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event, RuntimeEvent::TurnFailed { .. }))
                .count(),
            1
        );
        assert!(backend.request_snapshot().unwrap().is_empty());
    }
}
