use std::pin::Pin;
use std::sync::Arc;
use std::{ffi::CStr, fs::File, os::fd::AsRawFd as _};

use pho_code::agent::types::{BackendRequestId, ItemId, ToolCallId, ToolStatus};
use pho_code::app::action::{Intent, RuntimeEvent};
use pho_code::app::instance_lock::InstanceGuard;
use pho_code::app::runtime::{ApplicationCoordinator, RuntimeConfig};
use pho_code::auth::api_key::{CredentialActor, CredentialValidator, ValidationResult};
use pho_code::auth::keychain::{CredentialStore, MemoryCredentialStore};
use pho_code::auth::{AuthError, CredentialRecord};
use pho_code::backend::profile::{MODEL, PROFILE_REVISION};
use pho_code::backend::scripted::ScriptedBackend;
use pho_code::backend::{
    AssistantPhase, CompletedToolCall, FinishClass, ModelEvent, ProviderCompatibility, Usage,
};
use pho_code::tools::output::MemoryArtifactWriter;
use pho_code::tools::patch::{MemoryEffectRecorder, PatchError, Trash};
use pho_code::tools::{ApprovalDecision, Phase4ToolRuntime, StaticApprovalPolicy, ToolRuntime};

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

fn call(name: &str, arguments: serde_json::Value) -> CompletedToolCall {
    CompletedToolCall {
        tool_call_id: ToolCallId::new(),
        provider_call_id: format!("{name}-provider-call"),
        name: name.into(),
        arguments: serde_json::to_string(&arguments).unwrap(),
    }
}

fn response(calls: Vec<CompletedToolCall>, finish: FinishClass) -> Vec<ModelEvent> {
    let completion = if calls.is_empty() {
        "phase4-final"
    } else {
        "phase4-tools"
    };
    let phase = AssistantPhase {
        item_id: ItemId::new(),
        provider_completion_id: completion.into(),
        text: calls.is_empty().then(|| "done".into()),
        reasoning: Some("fixture reasoning".into()),
        reasoning_required_for_replay: !calls.is_empty(),
        tool_calls: calls,
        compatibility: ProviderCompatibility {
            model: MODEL.into(),
            system_fingerprint: None,
        },
    };
    vec![
        ModelEvent::ResponseStarted {
            request_id: BackendRequestId::new(),
            provider_completion_id: Some(completion.into()),
            model: MODEL.into(),
        },
        ModelEvent::AssistantPhaseCompleted { phase },
        ModelEvent::UsageUpdated { usage: usage() },
        ModelEvent::ResponseCompleted {
            request_id: BackendRequestId::new(),
            provider_completion_id: completion.into(),
            model: MODEL.into(),
            finish,
        },
    ]
}

fn runtime(root: &tempfile::TempDir) -> Arc<dyn ToolRuntime> {
    Arc::new(
        Phase4ToolRuntime::new_disposable(
            root.path(),
            Arc::new(MemoryArtifactWriter::new(16 * 1024 * 1024)),
            Arc::new(MemoryEffectRecorder),
            Arc::new(TestTrash(root.path().join(".test-trash"))),
        )
        .unwrap(),
    )
}

struct TestTrash(std::path::PathBuf);

impl Trash for TestTrash {
    fn move_to_trash(&self, parent: &File, name: &CStr) -> Result<(), PatchError> {
        std::fs::create_dir_all(&self.0).map_err(|_| PatchError::CommitFailed)?;
        let destination = self.0.join(uuid::Uuid::new_v4().to_string());
        use std::os::unix::ffi::OsStrExt as _;
        let destination = std::ffi::CString::new(destination.as_os_str().as_bytes())
            .map_err(|_| PatchError::CommitFailed)?;
        // SAFETY: both names are NUL-terminated and the source directory descriptor is live.
        let result = unsafe {
            libc::renameat(
                parent.as_raw_fd(),
                name.as_ptr(),
                libc::AT_FDCWD,
                destination.as_ptr(),
            )
        };
        if result == 0 {
            Ok(())
        } else {
            Err(PatchError::CommitFailed)
        }
    }
}

#[tokio::test]
async fn scripted_loop_searches_reads_patches_shells_and_continues() {
    let workspace = tempfile::tempdir().unwrap();
    std::fs::create_dir(workspace.path().join("src")).unwrap();
    std::fs::write(
        workspace.path().join("src/main.rs"),
        "fn main() { println!(\"needle\"); }\n",
    )
    .unwrap();
    std::fs::write(workspace.path().join("target.txt"), "before\n").unwrap();
    let calls = vec![
        call(
            "search_files",
            serde_json::json!({"query":"main","limit":10}),
        ),
        call(
            "search_text",
            serde_json::json!({"query":"needle","limit":10}),
        ),
        call(
            "read_file",
            serde_json::json!({"path":"src/main.rs","line_count":20}),
        ),
        call(
            "apply_patch",
            serde_json::json!({"patch":"*** Begin Patch\n*** Update File: target.txt\n@@\n-before\n+after\n*** End Patch\n"}),
        ),
        call(
            "shell",
            serde_json::json!({"command":"printf shell > shell.txt","timeout_seconds":5}),
        ),
    ];
    let backend = Arc::new(ScriptedBackend::new([
        response(calls, FinishClass::ToolCalls),
        response(Vec::new(), FinishClass::Stop),
    ]));
    let credential_directory = tempfile::tempdir().unwrap();
    let mut application = ApplicationCoordinator::new_with_services(
        ready_credentials(&credential_directory),
        backend.clone(),
        runtime(&workspace),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Approved)),
        Arc::new(RuntimeConfig::default()),
    )
    .await;
    let mut events = Vec::new();
    application
        .dispatch(
            Intent::SendEphemeralPrompt {
                text: "exercise every Phase 4 tool".into(),
            },
            |event| events.push(event),
        )
        .await
        .unwrap();

    assert_eq!(
        std::fs::read_to_string(workspace.path().join("target.txt")).unwrap(),
        "after\n"
    );
    assert_eq!(
        std::fs::read_to_string(workspace.path().join("shell.txt")).unwrap(),
        "shell"
    );
    assert_eq!(
        events
            .iter()
            .filter(|event| matches!(
                event,
                RuntimeEvent::ApprovalResolved {
                    decision: ApprovalDecision::Approved,
                    ..
                }
            ))
            .count(),
        2
    );
    assert_eq!(
        events
            .iter()
            .filter(|event| matches!(
                event,
                RuntimeEvent::ToolCompleted {
                    status: ToolStatus::Completed,
                    ..
                }
            ))
            .count(),
        5
    );
    let requests = backend.request_snapshot().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[1].messages.len(), 7);
}

#[tokio::test]
async fn denied_patch_has_no_effect_and_returns_a_structured_result() {
    let workspace = tempfile::tempdir().unwrap();
    std::fs::write(workspace.path().join("target.txt"), "before\n").unwrap();
    let backend = Arc::new(ScriptedBackend::new([
        response(
            vec![call(
                "apply_patch",
                serde_json::json!({"patch":"*** Begin Patch\n*** Update File: target.txt\n@@\n-before\n+after\n*** End Patch\n"}),
            )],
            FinishClass::ToolCalls,
        ),
        response(Vec::new(), FinishClass::Stop),
    ]));
    let credential_directory = tempfile::tempdir().unwrap();
    let mut application = ApplicationCoordinator::new_with_services(
        ready_credentials(&credential_directory),
        backend.clone(),
        runtime(&workspace),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
        Arc::new(RuntimeConfig::default()),
    )
    .await;
    application
        .dispatch(
            Intent::SendEphemeralPrompt {
                text: "deny the patch".into(),
            },
            |_| {},
        )
        .await
        .unwrap();

    assert_eq!(
        std::fs::read_to_string(workspace.path().join("target.txt")).unwrap(),
        "before\n"
    );
    let requests = backend.request_snapshot().unwrap();
    let tool_result = requests[1]
        .messages
        .iter()
        .find_map(|message| match message {
            pho_code::backend::BackendMessage::Tool(result) => Some(&result.output),
            _ => None,
        })
        .unwrap();
    assert_eq!(
        tool_result,
        r#"{"status":"denied","code":"approval_denied"}"#
    );
}

#[test]
fn ordinary_workspace_cannot_enable_phase4_mutations() {
    assert!(Phase4ToolRuntime::new_disposable_in_memory(env!("CARGO_MANIFEST_DIR")).is_err());
}
