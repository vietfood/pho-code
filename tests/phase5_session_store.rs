use std::fs::{self, OpenOptions};
use std::io::Write;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use pho_code::agent::types::{
    ApprovalId, BackendRequestId, ItemId, SessionId, ToolCallId, TurnId, TurnStatus,
};
use pho_code::backend::{AssistantPhase, CompletedToolCall, ProviderCompatibility};
use pho_code::session::SessionManager;
use pho_code::session::artifacts::{ArtifactLimits, PersistentArtifactStore};
use pho_code::session::record::{
    ApprovalRequested, AssistantPhaseCompleted, BackendRequestStarted, EffectStage, RecordEnvelope,
    RecordKind, RecordPayload, ToolEffectProgress, ToolExecutionCompleted, ToolExecutionStarted,
    TurnStarted, UserMessageCompleted,
};
use pho_code::session::recovery::{ScanDisposition, recover};
use pho_code::tools::ArtifactWriter;
use pho_code::tools::output::{ArtifactPurpose, ArtifactRequest};
use tempfile::tempdir;

#[test]
fn assistant_phase_round_trips_reasoning_and_call_identity() {
    let session_id = SessionId::new();
    let call = CompletedToolCall {
        tool_call_id: ToolCallId::new(),
        provider_call_id: "provider-call".into(),
        name: "read".into(),
        arguments: r#"{"path":"src/lib.rs"}"#.into(),
    };
    let phase = AssistantPhase {
        item_id: ItemId::new(),
        provider_completion_id: "completion".into(),
        text: Some("answer".into()),
        reasoning: Some("provider reasoning".into()),
        reasoning_required_for_replay: true,
        tool_calls: vec![call.clone()],
        compatibility: ProviderCompatibility {
            model: "deepseek-v4-flash".into(),
            system_fingerprint: Some("fingerprint".into()),
        },
    };
    let payload = RecordPayload::AssistantPhaseCompleted(AssistantPhaseCompleted {
        turn_id: TurnId::new(),
        phase: phase.clone(),
        extra: Default::default(),
    });
    let record = RecordEnvelope::new(session_id, 1, &payload).unwrap();
    let decoded = RecordEnvelope::decode(&record.encode().unwrap()).unwrap();
    match decoded.typed_payload().unwrap() {
        RecordPayload::AssistantPhaseCompleted(value) => {
            assert_eq!(value.phase, phase);
        }
        other => panic!("unexpected payload: {other:?}"),
    }
}

#[test]
fn torn_tail_preserves_original_and_replaces_active_prefix() {
    let directory = tempdir().unwrap();
    let manager = SessionManager::new(directory.path()).unwrap();
    let opened = manager.create_default("/workspace").unwrap();
    let path = opened.path.clone();
    let session_id = opened.session_id;
    drop(opened);
    let prefix = fs::read(&path).unwrap();
    let mut file = OpenOptions::new().append(true).open(&path).unwrap();
    file.write_all(b"{\"schema_version\":1").unwrap();
    file.sync_all().unwrap();
    drop(file);

    let result = recover(&path, session_id).unwrap();
    assert_eq!(result.disposition, ScanDisposition::TornTail);
    let preserved = result.recovery_file.as_ref().unwrap();
    assert_eq!(fs::read(preserved).unwrap()[..prefix.len()], prefix);
    let active = fs::read(&path).unwrap();
    assert!(active.starts_with(&prefix));
    assert!(active.ends_with(b"\n"));
}

#[test]
fn malformed_newline_is_read_only_and_artifacts_are_bounded_private_files() {
    let directory = tempdir().unwrap();
    let manager = SessionManager::new(directory.path()).unwrap();
    let opened = manager.create_default("/workspace").unwrap();
    let path = opened.path.clone();
    let session_id = opened.session_id;
    drop(opened);
    let mut file = OpenOptions::new().append(true).open(&path).unwrap();
    file.write_all(b"not-json\n").unwrap();
    file.sync_all().unwrap();
    drop(file);
    let result = recover(&path, session_id).unwrap();
    assert_eq!(result.disposition, ScanDisposition::MalformedLine);
    assert!(result.read_only);

    let artifact_root = directory.path().join("artifacts");
    let limits = ArtifactLimits {
        maximum_artifact_bytes: 8,
        maximum_session_bytes: 8,
        maximum_global_bytes: 8,
    };
    let store = PersistentArtifactStore::for_session(&artifact_root, session_id, limits).unwrap();
    let commit = store
        .write(ArtifactRequest {
            turn_id: TurnId::new(),
            tool_call_id: ToolCallId::new(),
            bytes: b"0123456789".to_vec(),
            classification: "test",
            purpose: ArtifactPurpose::ToolOutput,
            all_or_nothing: false,
            maximum_bytes: 8,
        })
        .unwrap();
    assert!(commit.truncated);
    assert_eq!(store.read(commit.artifact_id).unwrap(), b"01234567");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(store.artifact_path(commit.artifact_id))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
    assert!(matches!(
        store.write(ArtifactRequest {
            turn_id: TurnId::new(),
            tool_call_id: ToolCallId::new(),
            bytes: b"x".to_vec(),
            classification: "test",
            purpose: ArtifactPurpose::MutationRecovery,
            all_or_nothing: true,
            maximum_bytes: 8,
        }),
        Err("artifact limit reached")
    ));
}

#[test]
fn restart_invalidates_approval_and_records_interrupted_without_replay() {
    let directory = tempdir().unwrap();
    let manager = SessionManager::new(directory.path()).unwrap();
    let opened = manager.create_default("/workspace").unwrap();
    let writer = opened.writer.as_ref().unwrap().clone();
    let turn_id = TurnId::new();
    let item_id = ItemId::new();
    let tool_call_id = ToolCallId::new();
    let approval_id = ApprovalId::new();
    writer
        .append_payload(RecordPayload::TurnStarted(TurnStarted {
            turn_id,
            item_id,
            workspace_id: opened.projection.workspace_id.unwrap(),
            extra: Default::default(),
        }))
        .unwrap();
    writer
        .append_payload(RecordPayload::UserMessageCompleted(UserMessageCompleted {
            turn_id,
            item_id,
            text: "do not replay me".into(),
            extra: Default::default(),
        }))
        .unwrap();
    writer
        .append_payload(RecordPayload::BackendRequestStarted(
            BackendRequestStarted {
                turn_id,
                request_id: BackendRequestId::new(),
                model: "deepseek-v4-flash".into(),
                profile: opened.projection.profile.clone().unwrap(),
                message_count: 1,
                extra: Default::default(),
            },
        ))
        .unwrap();
    writer
        .append_payload(RecordPayload::ApprovalRequested(ApprovalRequested {
            turn_id,
            approval_id,
            tool_call_id,
            effect_digest: "effect".into(),
            summary: "approval".into(),
            extra: Default::default(),
        }))
        .unwrap();
    drop(opened);

    let recovered = manager.open_session(writer.session_id()).unwrap();
    let turn = recovered.projection.turn(turn_id).unwrap();
    assert_eq!(turn.status, TurnStatus::Interrupted);
    assert!(turn.pending_approvals.is_empty());
    assert_eq!(recovered.projection.messages.len(), 1);
    assert!(matches!(
        recovered.recovery.records.last().map(|record| record.kind),
        Some(RecordKind::TurnInterrupted)
    ));
}

#[test]
fn started_patch_step_recovers_exact_path_as_uncertain() {
    let directory = tempdir().unwrap();
    let manager = SessionManager::new(directory.path()).unwrap();
    let opened = manager.create_default("/workspace").unwrap();
    let writer = opened.writer.as_ref().unwrap().clone();
    let turn_id = TurnId::new();
    let item_id = ItemId::new();
    let tool_call_id = ToolCallId::new();
    writer
        .append_payload(RecordPayload::TurnStarted(TurnStarted {
            turn_id,
            item_id,
            workspace_id: opened.projection.workspace_id.unwrap(),
            extra: Default::default(),
        }))
        .unwrap();
    writer
        .append_payload(RecordPayload::ToolExecutionStarted(ToolExecutionStarted {
            turn_id,
            tool_call_id,
            effect_digest: "patch-digest".into(),
            name: "apply_patch".into(),
            mutating: true,
            extra: Default::default(),
        }))
        .unwrap();
    writer
        .append_payload(RecordPayload::ToolEffectProgress(ToolEffectProgress {
            turn_id,
            tool_call_id,
            effect_digest: "patch-digest".into(),
            stage: EffectStage::Started,
            index: 0,
            path: "src/lib.rs".into(),
            operation: "update".into(),
            direction: "forward".into(),
            recovery_artifact: None,
            extra: Default::default(),
        }))
        .unwrap();
    let session_id = opened.session_id;
    drop(opened);

    let recovered = manager.open_session(session_id).unwrap();
    assert_eq!(
        recovered.projection.turn(turn_id).unwrap().status,
        TurnStatus::Uncertain
    );
    assert_eq!(recovered.projection.uncertain_paths, ["src/lib.rs"]);
    assert!(matches!(
        recovered.recovery.records.last().map(|record| record.kind),
        Some(RecordKind::TurnUncertain)
    ));
}

#[test]
fn execution_without_model_result_is_interrupted_and_never_synthesized() {
    let directory = tempdir().unwrap();
    let manager = SessionManager::new(directory.path()).unwrap();
    let opened = manager.create_default("/workspace").unwrap();
    let writer = opened.writer.as_ref().unwrap().clone();
    let turn_id = TurnId::new();
    let item_id = ItemId::new();
    let tool_call_id = ToolCallId::new();
    writer
        .append_payload(RecordPayload::TurnStarted(TurnStarted {
            turn_id,
            item_id,
            workspace_id: opened.projection.workspace_id.unwrap(),
            extra: Default::default(),
        }))
        .unwrap();
    writer
        .append_payload(RecordPayload::ToolExecutionStarted(ToolExecutionStarted {
            turn_id,
            tool_call_id,
            effect_digest: "read-digest".into(),
            name: "read_file".into(),
            mutating: false,
            extra: Default::default(),
        }))
        .unwrap();
    writer
        .append_payload(RecordPayload::ToolExecutionCompleted(
            ToolExecutionCompleted {
                turn_id,
                tool_call_id,
                status: "completed".into(),
                effect_digest: Some("read-digest".into()),
                result_digest: Some("digest".into()),
                extra: Default::default(),
            },
        ))
        .unwrap();
    let session_id = opened.session_id;
    drop(opened);

    let recovered = manager.open_session(session_id).unwrap();
    let turn = recovered.projection.turn(turn_id).unwrap();
    assert_eq!(turn.status, TurnStatus::Interrupted);
    assert_eq!(turn.missing_tool_results, [tool_call_id]);
    assert!(
        recovered
            .projection
            .messages
            .iter()
            .all(|message| !matches!(message, pho_code::backend::BackendMessage::Tool(_)))
    );
}

#[test]
fn process_death_after_effect_start_recovers_the_exact_uncertain_path() {
    let directory = tempdir().unwrap();
    let marker = directory.path().join("crash-ready");
    let mut child = Command::new(std::env::current_exe().unwrap())
        .arg("--exact")
        .arg("crash_fixture_after_effect_start")
        .arg("--nocapture")
        .env("PHO_PHASE5_CRASH_ROOT", directory.path())
        .env("PHO_PHASE5_CRASH_MARKER", &marker)
        .spawn()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    while !marker.is_file() {
        if let Some(status) = child.try_wait().unwrap() {
            panic!("crash fixture exited before its durable barrier: {status}");
        }
        assert!(
            Instant::now() < deadline,
            "crash fixture did not reach its durable barrier"
        );
        thread::sleep(Duration::from_millis(10));
    }
    let session_id: SessionId = fs::read_to_string(&marker).unwrap().parse().unwrap();
    child.kill().unwrap();
    let status = child.wait().unwrap();
    assert!(!status.success());

    let recovered = SessionManager::new(directory.path())
        .unwrap()
        .open(session_id)
        .unwrap();
    assert_eq!(recovered.projection.uncertain_paths, ["src/crash.rs"]);
    assert!(matches!(
        recovered.recovery.records.last().map(|record| record.kind),
        Some(RecordKind::TurnUncertain)
    ));
}

#[test]
fn crash_fixture_after_effect_start() {
    let Some(root) = std::env::var_os("PHO_PHASE5_CRASH_ROOT") else {
        return;
    };
    let marker = std::env::var_os("PHO_PHASE5_CRASH_MARKER").unwrap();
    let manager = SessionManager::new(root).unwrap();
    let opened = manager.create_default("/workspace").unwrap();
    let writer = opened.writer.as_ref().unwrap();
    let turn_id = TurnId::new();
    let tool_call_id = ToolCallId::new();
    writer
        .append_payload(RecordPayload::TurnStarted(TurnStarted {
            turn_id,
            item_id: ItemId::new(),
            workspace_id: opened.projection.workspace_id.unwrap(),
            extra: Default::default(),
        }))
        .unwrap();
    writer
        .append_payload(RecordPayload::ToolExecutionStarted(ToolExecutionStarted {
            turn_id,
            tool_call_id,
            effect_digest: "crash-digest".into(),
            name: "apply_patch".into(),
            mutating: true,
            extra: Default::default(),
        }))
        .unwrap();
    writer
        .append_payload(RecordPayload::ToolEffectProgress(ToolEffectProgress {
            turn_id,
            tool_call_id,
            effect_digest: "crash-digest".into(),
            stage: EffectStage::Started,
            index: 0,
            path: "src/crash.rs".into(),
            operation: "update".into(),
            direction: "forward".into(),
            recovery_artifact: None,
            extra: Default::default(),
        }))
        .unwrap();
    let mut marker = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(marker)
        .unwrap();
    marker
        .write_all(opened.session_id.to_string().as_bytes())
        .unwrap();
    marker.sync_all().unwrap();
    loop {
        thread::park();
    }
}
