#![cfg(target_os = "macos")]

use std::sync::Arc;

use pho_code::agent::loop_runtime::{
    AgentError, AgentEvent, AgentLimits, run_agent_turn, run_no_tool_turn,
    run_qualification_tool_turn,
};
use pho_code::agent::types::TurnId;
use pho_code::app::instance_lock::{InstanceGuard, default_lock_path};
use pho_code::auth::CredentialState;
use pho_code::auth::api_key::{CredentialActor, DeepSeekCredentialValidator};
use pho_code::auth::keychain::MacKeychainStore;
use pho_code::backend::ModelBackend;
use pho_code::backend::deepseek::DeepSeekBackend;
use pho_code::backend::sse::SseLimits;
use pho_code::tools::{ApprovalDecision, Phase3ToolRuntime, StaticApprovalPolicy};
use tokio_util::sync::CancellationToken;

static LIVE_SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

struct LiveFixture {
    _serial: tokio::sync::MutexGuard<'static, ()>,
    _guard: InstanceGuard,
    backend: Arc<dyn ModelBackend>,
}

async fn live_backend() -> LiveFixture {
    let serial = LIVE_SERIAL.lock().await;
    let guard = InstanceGuard::acquire(&default_lock_path().unwrap()).unwrap();
    let actor = Arc::new(
        CredentialActor::new(
            &guard,
            Arc::new(MacKeychainStore::production()),
            Arc::new(DeepSeekCredentialValidator::new().unwrap()),
        )
        .unwrap(),
    );
    assert_eq!(
        actor.status().await,
        CredentialState::Ready,
        "run `cargo run --bin pho -- login` in a controlling terminal first"
    );
    let backend = Arc::new(DeepSeekBackend::new(actor, SseLimits::default()).unwrap());
    LiveFixture {
        _serial: serial,
        _guard: guard,
        backend,
    }
}

#[tokio::test]
#[ignore = "opt-in live DeepSeek qualification; requires a funded user-owned key installed by pho login"]
async fn streamed_thinking_text_and_usage_complete() {
    let fixture = live_backend().await;
    let outcome = run_no_tool_turn(
        fixture.backend,
        "Reply with a short greeting.".into(),
        CancellationToken::new(),
        128,
        |_| {},
    )
    .await
    .unwrap();
    assert!(
        outcome
            .phase
            .text
            .as_ref()
            .is_some_and(|text| !text.is_empty())
    );
    assert!(
        outcome
            .phase
            .reasoning
            .as_ref()
            .is_some_and(|text| !text.is_empty())
    );
    assert!(outcome.usage.total_tokens.is_some());
}

#[tokio::test]
#[ignore = "opt-in live DeepSeek qualification; requires a funded user-owned key installed by pho login"]
async fn exact_reasoning_tool_continuation_completes() {
    let fixture = live_backend().await;
    let outcome = run_qualification_tool_turn(
        fixture.backend,
        "Call phase1b_echo with one short value, then report completion.".into(),
        CancellationToken::new(),
        128,
        |_| {},
    )
    .await
    .unwrap();
    assert!(outcome.continuations >= 1);
    assert!(
        outcome
            .phase
            .text
            .as_ref()
            .is_some_and(|text| !text.is_empty())
    );
}

#[tokio::test]
#[ignore = "opt-in live DeepSeek qualification; requires a funded user-owned key installed by pho login"]
async fn cancellation_before_send_is_terminal_without_retry() {
    let fixture = live_backend().await;
    let cancellation = CancellationToken::new();
    cancellation.cancel();
    let result = run_no_tool_turn(
        fixture.backend,
        "This request must be cancelled.".into(),
        cancellation,
        128,
        |_| {},
    )
    .await;
    assert!(matches!(
        result,
        Err(pho_code::backend::BackendError::Cancelled)
    ));
}

fn phase3_limits() -> AgentLimits {
    AgentLimits {
        maximum_context_bytes: 8 * 1024 * 1024,
        maximum_context_messages: 4096,
        maximum_model_continuations: 8,
        maximum_tool_calls: 16,
        maximum_tool_argument_bytes: 64 * 1024,
        maximum_tool_result_bytes: 128 * 1024,
        maximum_pending_approvals: 1,
        turn_timeout: std::time::Duration::from_secs(15 * 60),
    }
}

#[tokio::test]
#[ignore = "opt-in live Phase 3 qualification; consumes funded DeepSeek API usage"]
async fn general_loop_completes_multiple_in_memory_calls_with_accumulated_usage() {
    let fixture = live_backend().await;
    let mut completed_tools = 0;
    let outcome = run_agent_turn(
        fixture.backend,
        Arc::new(Phase3ToolRuntime::default()),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
        TurnId::new(),
        "Call phase1b_echo twice in one response, once with `alpha` and once with `beta`, then briefly confirm both results.".into(),
        CancellationToken::new(),
        128,
        phase3_limits(),
        |event| {
            if matches!(event, AgentEvent::ToolCompleted { executed: true, .. }) {
                completed_tools += 1;
            }
        },
    )
    .await
    .unwrap();
    assert_eq!(completed_tools, 2);
    assert!(outcome.continuations >= 1);
    assert!(outcome.usage.total_tokens.is_some());
}

#[tokio::test]
#[ignore = "opt-in live Phase 3 qualification; consumes funded DeepSeek API usage"]
async fn general_loop_denies_fake_mutation_and_continues_without_effect() {
    let fixture = live_backend().await;
    let mut denied = false;
    let mut executed = false;
    let outcome = run_agent_turn(
        fixture.backend,
        Arc::new(Phase3ToolRuntime::default()),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
        TurnId::new(),
        "Call phase3_mutation_probe once with a short value, then report the tool result.".into(),
        CancellationToken::new(),
        128,
        phase3_limits(),
        |event| match event {
            AgentEvent::ApprovalResolved(response) => {
                denied |= response.decision == ApprovalDecision::Denied;
            }
            AgentEvent::ToolCompleted {
                executed: did_execute,
                ..
            } => executed |= *did_execute,
            _ => {}
        },
    )
    .await
    .unwrap();
    assert!(denied);
    assert!(!executed);
    assert!(outcome.continuations >= 1);
}

#[tokio::test]
#[ignore = "opt-in live Phase 3 qualification; consumes funded DeepSeek API usage"]
async fn live_stream_cancellation_after_semantic_content_is_terminal() {
    let fixture = live_backend().await;
    let cancellation = CancellationToken::new();
    let cancel_from_event = cancellation.clone();
    let result = run_agent_turn(
        fixture.backend,
        Arc::new(Phase3ToolRuntime::default()),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
        TurnId::new(),
        "Think through a long explanation before answering.".into(),
        cancellation,
        128,
        phase3_limits(),
        |event| {
            if matches!(
                event,
                AgentEvent::Model(pho_code::backend::ModelEvent::ReasoningDelta { .. })
                    | AgentEvent::Model(pho_code::backend::ModelEvent::TextDelta { .. })
            ) {
                cancel_from_event.cancel();
            }
        },
    )
    .await;
    assert!(matches!(
        result,
        Err(AgentError::Backend(
            pho_code::backend::BackendError::Cancelled
        ))
    ));
}
