use std::pin::Pin;
use std::sync::Arc;

use pho_code::agent::types::{BackendRequestId, ItemId, ToolCallId};
use pho_code::app::action::Intent;
use pho_code::app::instance_lock::InstanceGuard;
use pho_code::app::runtime::{ApplicationCoordinator, RuntimeConfig};
use pho_code::auth::api_key::{CredentialActor, CredentialValidator, ValidationResult};
use pho_code::auth::keychain::{CredentialStore, MemoryCredentialStore};
use pho_code::auth::{AuthError, CredentialRecord};
use pho_code::backend::profile::{MODEL, PROFILE_REVISION};
use pho_code::backend::scripted::ScriptedBackend;
use pho_code::backend::{
    AssistantPhase, BackendMessage, CompletedToolCall, FinishClass, ModelEvent,
    ProviderCompatibility, Usage,
};
use pho_code::session::SessionManager;
use pho_code::session::artifacts::{ArtifactLimits, PersistentArtifactStore};
use pho_code::session::journal::SessionEffectRecorder;
use pho_code::session::record::{RecordKind, SessionProfile};
use pho_code::tools::{ApprovalDecision, NoToolRuntime, Phase5ToolRuntime, StaticApprovalPolicy};

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

fn response(id: &str, text: &str) -> Vec<ModelEvent> {
    let phase = AssistantPhase {
        item_id: ItemId::new(),
        provider_completion_id: id.into(),
        text: Some(text.into()),
        reasoning: Some(format!("{id}-reasoning")),
        reasoning_required_for_replay: false,
        tool_calls: Vec::new(),
        compatibility: ProviderCompatibility {
            model: MODEL.into(),
            system_fingerprint: None,
        },
    };
    vec![
        ModelEvent::ResponseStarted {
            request_id: BackendRequestId::new(),
            provider_completion_id: Some(id.into()),
            model: MODEL.into(),
        },
        ModelEvent::AssistantPhaseCompleted { phase },
        ModelEvent::UsageUpdated {
            usage: Usage {
                prompt_tokens: Some(1),
                cache_hit_tokens: Some(0),
                cache_miss_tokens: Some(1),
                output_tokens: Some(1),
                reasoning_tokens: Some(1),
                total_tokens: Some(2),
            },
        },
        ModelEvent::ResponseCompleted {
            request_id: BackendRequestId::new(),
            provider_completion_id: id.into(),
            model: MODEL.into(),
            finish: FinishClass::Stop,
        },
    ]
}

fn tool_response(id: &str, call: CompletedToolCall) -> Vec<ModelEvent> {
    let phase = AssistantPhase {
        item_id: ItemId::new(),
        provider_completion_id: id.into(),
        text: None,
        reasoning: Some("apply the approved fixture patch".into()),
        reasoning_required_for_replay: true,
        tool_calls: vec![call],
        compatibility: ProviderCompatibility {
            model: MODEL.into(),
            system_fingerprint: None,
        },
    };
    vec![
        ModelEvent::ResponseStarted {
            request_id: BackendRequestId::new(),
            provider_completion_id: Some(id.into()),
            model: MODEL.into(),
        },
        ModelEvent::AssistantPhaseCompleted { phase },
        ModelEvent::UsageUpdated {
            usage: Usage {
                prompt_tokens: Some(1),
                cache_hit_tokens: Some(0),
                cache_miss_tokens: Some(1),
                output_tokens: Some(1),
                reasoning_tokens: Some(1),
                total_tokens: Some(2),
            },
        },
        ModelEvent::ResponseCompleted {
            request_id: BackendRequestId::new(),
            provider_completion_id: id.into(),
            model: MODEL.into(),
            finish: FinishClass::ToolCalls,
        },
    ]
}

#[tokio::test]
async fn durable_runtime_reconstructs_and_replays_complete_history_after_restart() {
    let root = tempfile::tempdir().unwrap();
    let workspace = tempfile::tempdir().unwrap();
    let credentials_root = tempfile::tempdir().unwrap();
    let credentials = ready_credentials(&credentials_root);
    let manager = SessionManager::new(root.path()).unwrap();
    let opened = manager
        .create(
            workspace.path().to_string_lossy().into_owned(),
            SessionProfile::default(),
        )
        .unwrap();
    let session_id = opened.session_id;
    let first_backend = Arc::new(ScriptedBackend::new([response("first", "first answer")]));
    let effects = Arc::new(SessionEffectRecorder::new(
        opened.writer.as_ref().unwrap().clone(),
    ));
    let mut first = ApplicationCoordinator::new_with_durable_session(
        credentials.clone(),
        first_backend,
        Arc::new(NoToolRuntime),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
        Arc::new(RuntimeConfig::default()),
        opened,
        Some(effects),
    )
    .await
    .unwrap();
    first
        .dispatch(
            Intent::SendPrompt {
                session_id,
                text: "first question".into(),
            },
            |_| {},
        )
        .await
        .unwrap();
    drop(first);

    let reopened = manager.open(session_id).unwrap();
    assert_eq!(reopened.projection.messages.len(), 2);
    let second_backend = Arc::new(ScriptedBackend::new([response("second", "second answer")]));
    let effects = Arc::new(SessionEffectRecorder::new(
        reopened.writer.as_ref().unwrap().clone(),
    ));
    let mut second = ApplicationCoordinator::new_with_durable_session(
        credentials,
        second_backend.clone(),
        Arc::new(NoToolRuntime),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
        Arc::new(RuntimeConfig::default()),
        reopened,
        Some(effects),
    )
    .await
    .unwrap();
    second
        .dispatch(
            Intent::SendPrompt {
                session_id,
                text: "second question".into(),
            },
            |_| {},
        )
        .await
        .unwrap();

    let requests = second_backend.request_snapshot().unwrap();
    assert_eq!(requests.len(), 1);
    assert!(matches!(
        requests[0].messages.as_slice(),
        [
            BackendMessage::User(first),
            BackendMessage::Assistant(_),
            BackendMessage::User(second)
        ] if first.text == "first question" && second.text == "second question"
    ));
    drop(second);
    let final_session = manager.open(session_id).unwrap();
    assert_eq!(final_session.projection.messages.len(), 4);
    assert!(
        final_session
            .projection
            .turns
            .values()
            .all(|turn| turn.status == pho_code::agent::types::TurnStatus::Completed)
    );
}

#[tokio::test]
async fn personal_workspace_patch_uses_durable_effect_and_result_boundaries() {
    let root = tempfile::tempdir().unwrap();
    let workspace = tempfile::tempdir().unwrap();
    std::fs::write(workspace.path().join("target.txt"), "before\n").unwrap();
    let credentials_root = tempfile::tempdir().unwrap();
    let credentials = ready_credentials(&credentials_root);
    let manager = SessionManager::new(root.path()).unwrap();
    let opened = manager
        .create(
            workspace.path().to_string_lossy().into_owned(),
            SessionProfile::default(),
        )
        .unwrap();
    let session_id = opened.session_id;
    let writer = opened.writer.as_ref().unwrap().clone();
    let effects = Arc::new(SessionEffectRecorder::new(writer));
    let artifacts = Arc::new(
        PersistentArtifactStore::for_session(
            root.path().join("artifacts"),
            session_id,
            ArtifactLimits {
                maximum_artifact_bytes: 2 * 1024 * 1024,
                maximum_session_bytes: 8 * 1024 * 1024,
                maximum_global_bytes: 16 * 1024 * 1024,
            },
        )
        .unwrap(),
    );
    let tools = Arc::new(
        Phase5ToolRuntime::new_persistent(
            workspace.path(),
            artifacts,
            effects.clone(),
            Arc::new(pho_code::tools::patch::MacTrash),
        )
        .unwrap(),
    );
    let patch = "*** Begin Patch\n*** Update File: target.txt\n@@\n-before\n+after\n*** End Patch";
    let call = CompletedToolCall {
        tool_call_id: ToolCallId::new(),
        provider_call_id: "patch-call".into(),
        name: "apply_patch".into(),
        arguments: serde_json::json!({"patch": patch}).to_string(),
    };
    let backend = Arc::new(ScriptedBackend::new([
        tool_response("tool-phase", call),
        response("final-phase", "patched"),
    ]));
    let mut application = ApplicationCoordinator::new_with_durable_session(
        credentials,
        backend,
        tools,
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Approved)),
        Arc::new(RuntimeConfig::default()),
        opened,
        Some(effects),
    )
    .await
    .unwrap();
    application
        .dispatch(
            Intent::SendPrompt {
                session_id,
                text: "patch the fixture".into(),
            },
            |_| {},
        )
        .await
        .unwrap();
    assert_eq!(
        std::fs::read_to_string(workspace.path().join("target.txt")).unwrap(),
        "after\n"
    );
    drop(application);
    let recovered = manager.open(session_id).unwrap();
    let kinds: Vec<_> = recovered
        .recovery
        .records
        .iter()
        .map(|record| record.kind)
        .collect();
    let positions = [
        RecordKind::ApprovalResolved,
        RecordKind::ToolExecutionStarted,
        RecordKind::ToolEffectProgress,
        RecordKind::ToolExecutionCompleted,
        RecordKind::ToolResultCompleted,
        RecordKind::TurnCompleted,
    ]
    .map(|kind| {
        kinds
            .iter()
            .position(|candidate| *candidate == kind)
            .unwrap()
    });
    assert!(positions.windows(2).all(|pair| pair[0] < pair[1]));
    assert_eq!(
        recovered
            .recovery
            .records
            .iter()
            .filter(|record| record.kind == RecordKind::ToolEffectProgress)
            .count(),
        2
    );
}
