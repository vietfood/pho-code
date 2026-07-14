#![cfg(target_os = "macos")]

use std::sync::Arc;

use pho_code::agent::loop_runtime::{run_no_tool_turn, run_qualification_tool_turn};
use pho_code::app::instance_lock::{InstanceGuard, default_lock_path};
use pho_code::auth::CredentialState;
use pho_code::auth::api_key::{CredentialActor, DeepSeekCredentialValidator};
use pho_code::auth::keychain::MacKeychainStore;
use pho_code::backend::ModelBackend;
use pho_code::backend::deepseek::DeepSeekBackend;
use pho_code::backend::sse::SseLimits;
use tokio_util::sync::CancellationToken;

async fn live_backend() -> (InstanceGuard, Arc<dyn ModelBackend>) {
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
    (guard, backend)
}

#[tokio::test]
#[ignore = "opt-in live DeepSeek qualification; requires a funded user-owned key installed by pho login"]
async fn streamed_thinking_text_and_usage_complete() {
    let (_guard, backend) = live_backend().await;
    let outcome = run_no_tool_turn(
        backend,
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
    let (_guard, backend) = live_backend().await;
    let outcome = run_qualification_tool_turn(
        backend,
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
    let (_guard, backend) = live_backend().await;
    let cancellation = CancellationToken::new();
    cancellation.cancel();
    let result = run_no_tool_turn(
        backend,
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
