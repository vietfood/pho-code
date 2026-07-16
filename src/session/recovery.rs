//! Deterministic startup scanning, torn-tail repair, and projection reconstruction.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read as _, Write as _};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::agent::types::{
    ApprovalId, BackendRequestId, SessionId, ToolCallId, TurnId, TurnStatus, WorkspaceId,
};
use crate::backend::BackendMessage;

use super::record::{
    DiagnosticRecorded, EffectStage, MAXIMUM_DIAGNOSTIC_BYTES, MAXIMUM_RECORD_LINE_BYTES,
    RecordEnvelope, RecordError, RecordPayload, SessionCreated, SessionMetadataUpdated,
    ToolEffectProgress, ToolExecutionCompleted, ToolExecutionStarted, ToolResultCompleted,
    TurnStarted, TurnTerminal, UserMessageCompleted,
};

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RecoveryError {
    #[error("session journal is unavailable")]
    Unavailable,
    #[error("session journal is malformed")]
    Malformed,
    #[error("session journal has a non-monotonic sequence")]
    Sequence,
    #[error("session journal has an unsupported schema")]
    UnsupportedSchema,
    #[error("session journal requires read-only inspection")]
    ReadOnly,
    #[error("session journal repair failed")]
    RepairFailed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ScanDisposition {
    Clean,
    TornTail,
    MalformedLine,
    SequenceCorruption,
    UnsupportedSchema,
}

#[derive(Clone, Eq, PartialEq)]
pub struct ScanResult {
    pub session_id: SessionId,
    pub records: Vec<RecordEnvelope>,
    pub valid_prefix: Vec<u8>,
    pub disposition: ScanDisposition,
    pub read_only: bool,
    pub recovery_file: Option<PathBuf>,
    pub projection: SessionProjection,
}

impl std::fmt::Debug for ScanResult {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ScanResult")
            .field("session_id", &self.session_id)
            .field("record_count", &self.records.len())
            .field("valid_prefix_bytes", &self.valid_prefix.len())
            .field("disposition", &self.disposition)
            .field("read_only", &self.read_only)
            .field("recovery_file_present", &self.recovery_file.is_some())
            .field("projection", &self.projection)
            .finish()
    }
}

#[derive(Clone, Eq, PartialEq, Serialize, Deserialize)]
pub struct TurnProjection {
    pub turn_id: TurnId,
    pub status: TurnStatus,
    pub user_message: Option<String>,
    pub request_id: Option<BackendRequestId>,
    pub pending_approvals: Vec<ApprovalId>,
    pub uncertain_paths: Vec<String>,
    pub started_effects: Vec<ToolCallId>,
    pub completed_effects: Vec<ToolCallId>,
    pub missing_tool_results: Vec<ToolCallId>,
}

impl std::fmt::Debug for TurnProjection {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("TurnProjection")
            .field("turn_id", &self.turn_id)
            .field("status", &self.status)
            .field(
                "user_message_bytes",
                &self.user_message.as_ref().map(String::len),
            )
            .field("request_id", &self.request_id)
            .field("pending_approvals", &self.pending_approvals.len())
            .field("uncertain_paths", &self.uncertain_paths.len())
            .field("started_effects", &self.started_effects.len())
            .field("completed_effects", &self.completed_effects.len())
            .field("missing_tool_results", &self.missing_tool_results.len())
            .finish()
    }
}

#[derive(Clone, Default, Eq, PartialEq)]
pub struct SessionProjection {
    pub profile: Option<super::record::SessionProfile>,
    pub workspace_id: Option<WorkspaceId>,
    pub workspace: Option<String>,
    pub messages: Vec<BackendMessage>,
    pub turns: BTreeMap<TurnId, TurnProjection>,
    pub unresolved_approvals: Vec<ApprovalId>,
    pub uncertain_paths: Vec<String>,
    pub read_only: bool,
}

impl std::fmt::Debug for SessionProjection {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SessionProjection")
            .field("profile", &self.profile)
            .field("workspace_id", &self.workspace_id)
            .field("workspace_present", &self.workspace.is_some())
            .field("message_count", &self.messages.len())
            .field("turn_count", &self.turns.len())
            .field("unresolved_approvals", &self.unresolved_approvals.len())
            .field("uncertain_paths", &self.uncertain_paths.len())
            .field("read_only", &self.read_only)
            .finish()
    }
}

impl SessionProjection {
    pub fn canonical_messages(&self) -> &[BackendMessage] {
        &self.messages
    }

    pub fn turn(&self, turn_id: TurnId) -> Option<&TurnProjection> {
        self.turns.get(&turn_id)
    }
}

/// Scan and, where safe, repair a session file.  The caller provides the expected local session
/// identity because the filename is not trusted as an identity source.
pub fn recover(path: impl AsRef<Path>, session_id: SessionId) -> Result<ScanResult, RecoveryError> {
    let path = path.as_ref();
    let bytes = read_bytes(path)?;
    let (records, valid_prefix, disposition) = scan_bytes(&bytes, session_id)?;
    let mut recovery_file = None;
    let mut active_records = records;
    let mut active_prefix = valid_prefix;
    if disposition == ScanDisposition::TornTail {
        let next = active_records
            .last()
            .map_or(1, |record| record.sequence.saturating_add(1));
        let diagnostic = DiagnosticRecorded {
            code: "recovered_torn_tail".into(),
            message: "A non-newline journal tail was preserved and the valid prefix was recovered."
                .into(),
            related_turn: None,
            related_tool_call: None,
            extra: Default::default(),
        };
        if serde_json::to_vec(&diagnostic)
            .map_or(true, |value| value.len() > MAXIMUM_DIAGNOSTIC_BYTES)
        {
            return Err(RecoveryError::RepairFailed);
        }
        let record = RecordEnvelope::new(
            session_id,
            next,
            &RecordPayload::DiagnosticRecorded(diagnostic),
        )
        .map_err(|_| RecoveryError::RepairFailed)?;
        let encoded = record.encode().map_err(|_| RecoveryError::RepairFailed)?;
        let temporary = path.with_extension(format!("replacement-{}.tmp", Uuid::new_v4()));
        {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|_| RecoveryError::RepairFailed)?;
            set_private(&temporary)?;
            file.write_all(&active_prefix)
                .map_err(|_| RecoveryError::RepairFailed)?;
            file.write_all(&encoded)
                .map_err(|_| RecoveryError::RepairFailed)?;
            file.sync_all().map_err(|_| RecoveryError::RepairFailed)?;
        }
        let recovery_name = format!(
            ".{}.recovery-{}.jsonl",
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("session"),
            Uuid::new_v4()
        );
        let preserved = path.with_file_name(recovery_name);
        fs::rename(path, &preserved).map_err(|_| RecoveryError::RepairFailed)?;
        set_private(&preserved)?;
        fs::rename(&temporary, path).map_err(|_| RecoveryError::RepairFailed)?;
        set_private(path)?;
        sync_directory(path.parent().unwrap_or_else(|| Path::new(".")))?;
        recovery_file = Some(preserved);
        active_prefix.extend_from_slice(&encoded);
        active_records.push(record);
    }
    let mut projection = reconstruct(&active_records);
    projection.read_only = !matches!(
        disposition,
        ScanDisposition::Clean | ScanDisposition::TornTail
    );
    // Recovery evidence is appended only to an otherwise valid, writable prefix.  This makes a
    // restart explicit without pretending that a prompt, request, or effect can be resumed.
    if !projection.read_only {
        let mut next = active_records
            .last()
            .map_or(1, |record| record.sequence + 1);
        let terminal_turns: HashSet<TurnId> = active_records
            .iter()
            .filter(|record| record.kind.is_terminal())
            .filter_map(|record| record.payload.get("turn_id"))
            .filter_map(|value| serde_json::from_value(value.clone()).ok())
            .collect();
        let unresolved_turns = unresolved_approval_turns(&active_records);
        let open_turns: Vec<(TurnId, TurnStatus, Vec<String>)> = projection
            .turns
            .values()
            .filter(|turn| !terminal_turns.contains(&turn.turn_id))
            .map(|turn| {
                (
                    turn.turn_id,
                    turn.status.clone(),
                    turn.uncertain_paths.clone(),
                )
            })
            .collect();
        let mut recovery_turns = open_turns;
        for turn_id in unresolved_turns {
            if !terminal_turns.contains(&turn_id)
                && !recovery_turns.iter().any(|(id, _, _)| *id == turn_id)
            {
                recovery_turns.push((
                    turn_id,
                    TurnStatus::Interrupted,
                    projection
                        .turn(turn_id)
                        .map_or_else(Vec::new, |turn| turn.uncertain_paths.clone()),
                ));
            }
        }
        let had_open_turns = !recovery_turns.is_empty();
        for (turn_id, status, paths) in recovery_turns {
            let uncertain = !paths.is_empty() || matches!(status, TurnStatus::Uncertain);
            let payload = TurnTerminal {
                turn_id,
                reason: Some(
                    if uncertain {
                        "uncertain_effect_or_execution"
                    } else {
                        "restart"
                    }
                    .into(),
                ),
                code: Some(
                    if uncertain {
                        "recovered_uncertain"
                    } else {
                        "recovered_interrupted"
                    }
                    .into(),
                ),
                uncertain_paths: paths,
                extra: Default::default(),
            };
            let record = RecordEnvelope::new(
                session_id,
                next,
                &if uncertain {
                    RecordPayload::TurnUncertain(payload)
                } else {
                    RecordPayload::TurnInterrupted(payload)
                },
            )
            .map_err(|_| RecoveryError::RepairFailed)?;
            let encoded = record.encode().map_err(|_| RecoveryError::RepairFailed)?;
            let mut file = OpenOptions::new()
                .append(true)
                .open(path)
                .map_err(|_| RecoveryError::RepairFailed)?;
            file.write_all(&encoded)
                .map_err(|_| RecoveryError::RepairFailed)?;
            file.sync_all().map_err(|_| RecoveryError::RepairFailed)?;
            active_prefix.extend_from_slice(&encoded);
            active_records.push(record);
            next += 1;
        }
        if had_open_turns {
            sync_directory(path.parent().unwrap_or_else(|| Path::new(".")))?;
            projection = reconstruct(&active_records);
        }
    }
    Ok(ScanResult {
        session_id,
        records: active_records,
        valid_prefix: active_prefix,
        disposition: disposition.clone(),
        read_only: projection.read_only,
        recovery_file,
        projection,
    })
}

/// Read and validate a complete JSONL prefix without mutating the file.
pub fn scan(path: impl AsRef<Path>, session_id: SessionId) -> Result<ScanResult, RecoveryError> {
    let bytes = read_bytes(path.as_ref())?;
    let (records, prefix, disposition) = scan_bytes(&bytes, session_id)?;
    let mut projection = reconstruct(&records);
    projection.read_only = !matches!(disposition, ScanDisposition::Clean);
    Ok(ScanResult {
        session_id,
        records,
        valid_prefix: prefix,
        disposition,
        read_only: projection.read_only,
        recovery_file: None,
        projection,
    })
}

fn scan_bytes(
    bytes: &[u8],
    session_id: SessionId,
) -> Result<(Vec<RecordEnvelope>, Vec<u8>, ScanDisposition), RecoveryError> {
    let mut records = Vec::new();
    let mut prefix = Vec::new();
    let mut expected = 1_u64;
    let mut cursor = 0;
    while cursor < bytes.len() {
        let Some(relative_end) = bytes[cursor..].iter().position(|byte| *byte == b'\n') else {
            if bytes.len() - cursor > MAXIMUM_RECORD_LINE_BYTES {
                return Ok((records, prefix, ScanDisposition::MalformedLine));
            }
            return Ok((records, prefix, ScanDisposition::TornTail));
        };
        let end = cursor + relative_end + 1;
        let record = match RecordEnvelope::decode(&bytes[cursor..end]) {
            Ok(record) => record,
            Err(RecordError::UnsupportedSchema) => {
                return Ok((records, prefix, ScanDisposition::UnsupportedSchema));
            }
            Err(RecordError::InvalidSequence) => {
                return Ok((records, prefix, ScanDisposition::SequenceCorruption));
            }
            Err(_) => return Ok((records, prefix, ScanDisposition::MalformedLine)),
        };
        if record.session_id != session_id {
            return Ok((records, prefix, ScanDisposition::MalformedLine));
        }
        if record.sequence != expected {
            return Ok((records, prefix, ScanDisposition::SequenceCorruption));
        }
        expected = expected.checked_add(1).ok_or(RecoveryError::Sequence)?;
        prefix.extend_from_slice(&bytes[cursor..end]);
        records.push(record);
        cursor = end;
    }
    Ok((records, prefix, ScanDisposition::Clean))
}

fn reconstruct(records: &[RecordEnvelope]) -> SessionProjection {
    let mut projection = SessionProjection::default();
    let mut approval_turns: HashMap<ApprovalId, TurnId> = HashMap::new();
    let mut executions: HashMap<ToolCallId, TurnId> = HashMap::new();
    let mut execution_completed = HashSet::new();
    let mut results = HashSet::new();
    let mut effect_started: HashMap<(ToolCallId, u32, String, String), (TurnId, String)> =
        HashMap::new();

    for record in records {
        let Ok(payload) = record.typed_payload() else {
            continue;
        };
        match payload {
            RecordPayload::SessionCreated(SessionCreated {
                workspace_id,
                workspace,
                profile,
                ..
            }) => {
                projection.workspace_id = Some(workspace_id);
                projection.workspace = Some(workspace);
                projection.profile = Some(profile);
            }
            RecordPayload::SessionMetadataUpdated(SessionMetadataUpdated {
                workspace_id,
                workspace,
                profile,
                ..
            }) => {
                if workspace_id.is_some() {
                    projection.workspace_id = workspace_id;
                }
                if workspace.is_some() {
                    projection.workspace = workspace;
                }
                if profile.is_some() {
                    projection.profile = profile;
                }
            }
            RecordPayload::TurnStarted(TurnStarted { turn_id, .. }) => {
                projection
                    .turns
                    .entry(turn_id)
                    .or_insert_with(|| TurnProjection {
                        turn_id,
                        status: TurnStatus::Preparing,
                        user_message: None,
                        request_id: None,
                        pending_approvals: Vec::new(),
                        uncertain_paths: Vec::new(),
                        started_effects: Vec::new(),
                        completed_effects: Vec::new(),
                        missing_tool_results: Vec::new(),
                    });
            }
            RecordPayload::UserMessageCompleted(UserMessageCompleted {
                turn_id,
                text,
                item_id,
                ..
            }) => {
                let turn = turn_mut(&mut projection, turn_id);
                turn.user_message = Some(text.clone());
                turn.status = TurnStatus::RequestingModel;
                projection
                    .messages
                    .push(BackendMessage::User(crate::backend::UserMessage {
                        item_id,
                        text,
                    }));
            }
            RecordPayload::BackendRequestStarted(
                crate::session::record::BackendRequestStarted {
                    turn_id,
                    request_id,
                    ..
                },
            ) => {
                let turn = turn_mut(&mut projection, turn_id);
                turn.request_id = Some(request_id);
                turn.status = TurnStatus::RequestingModel;
            }
            RecordPayload::AssistantPhaseCompleted(
                crate::session::record::AssistantPhaseCompleted { turn_id, phase, .. },
            ) => {
                turn_mut(&mut projection, turn_id).status = TurnStatus::StreamingModel;
                projection.messages.push(BackendMessage::Assistant(phase));
            }
            RecordPayload::ToolCallCompleted(crate::session::record::ToolCallCompleted {
                turn_id,
                ..
            }) => {
                turn_mut(&mut projection, turn_id).status = TurnStatus::RunningTool;
            }
            RecordPayload::ApprovalRequested(value) => {
                let turn = turn_mut(&mut projection, value.turn_id);
                turn.status = TurnStatus::AwaitingApproval;
                turn.pending_approvals.push(value.approval_id);
                approval_turns.insert(value.approval_id, value.turn_id);
            }
            RecordPayload::ApprovalResolved(value) => {
                if let Some(turn_id) = approval_turns.remove(&value.approval_id)
                    && let Some(turn) = projection.turns.get_mut(&turn_id)
                {
                    turn.pending_approvals.retain(|id| *id != value.approval_id);
                }
                turn_mut(&mut projection, value.turn_id).status = TurnStatus::RunningTool;
            }
            RecordPayload::ToolExecutionStarted(ToolExecutionStarted {
                turn_id,
                tool_call_id,
                ..
            }) => {
                let turn = turn_mut(&mut projection, turn_id);
                turn.status = TurnStatus::RunningTool;
                turn.started_effects.push(tool_call_id);
                executions.insert(tool_call_id, turn_id);
            }
            RecordPayload::ToolEffectProgress(ToolEffectProgress {
                turn_id,
                tool_call_id,
                stage,
                index,
                path,
                direction,
                ..
            }) => {
                let turn = turn_mut(&mut projection, turn_id);
                let key = (tool_call_id, index, path.clone(), direction.clone());
                match stage {
                    EffectStage::Started => {
                        effect_started.insert(key, (turn_id, path.clone()));
                        turn.uncertain_paths.push(path);
                    }
                    EffectStage::Completed => {
                        effect_started.remove(&key);
                        turn.uncertain_paths.retain(|candidate| candidate != &path);
                    }
                }
            }
            RecordPayload::ToolExecutionCompleted(ToolExecutionCompleted {
                turn_id,
                tool_call_id,
                ..
            }) => {
                let turn = turn_mut(&mut projection, turn_id);
                turn.completed_effects.push(tool_call_id);
                execution_completed.insert(tool_call_id);
            }
            RecordPayload::ToolResultCompleted(ToolResultCompleted {
                turn_id, result, ..
            }) => {
                let tool_call_id = result.tool_call_id;
                results.insert(tool_call_id);
                turn_mut(&mut projection, turn_id).status = TurnStatus::ContinuingModel;
                projection.messages.push(BackendMessage::Tool(result));
            }
            RecordPayload::UsageObserved(_) => {}
            RecordPayload::TurnCompleted(value) => {
                terminal(&mut projection, value.turn_id, TurnStatus::Completed)
            }
            RecordPayload::TurnFailed(value) => {
                terminal(&mut projection, value.turn_id, TurnStatus::Failed)
            }
            RecordPayload::TurnCancelled(value) => {
                terminal(&mut projection, value.turn_id, TurnStatus::Cancelled)
            }
            RecordPayload::TurnInterrupted(value) => {
                terminal(&mut projection, value.turn_id, TurnStatus::Interrupted)
            }
            RecordPayload::TurnUncertain(value) => {
                let turn = turn_mut(&mut projection, value.turn_id);
                turn.status = TurnStatus::Uncertain;
                turn.uncertain_paths.extend(value.uncertain_paths.clone());
                projection.uncertain_paths.extend(value.uncertain_paths);
            }
            RecordPayload::DiagnosticRecorded(_) => {}
        }
    }
    for (approval_id, turn_id) in approval_turns {
        projection.unresolved_approvals.push(approval_id);
        let turn = turn_mut(&mut projection, turn_id);
        turn.pending_approvals.clear();
        turn.status = TurnStatus::Interrupted;
    }
    for (tool_call_id, turn_id) in executions {
        if !execution_completed.contains(&tool_call_id) {
            let turn = turn_mut(&mut projection, turn_id);
            turn.status = TurnStatus::Uncertain;
            if !turn.missing_tool_results.contains(&tool_call_id) {
                turn.missing_tool_results.push(tool_call_id);
            }
        } else if !results.contains(&tool_call_id) {
            let turn = turn_mut(&mut projection, turn_id);
            if turn.status != TurnStatus::Uncertain {
                turn.status = TurnStatus::Interrupted;
            }
            turn.missing_tool_results.push(tool_call_id);
        }
    }
    for (_, (_, path)) in effect_started {
        projection.uncertain_paths.push(path);
    }
    if !projection.uncertain_paths.is_empty() {
        for turn in projection.turns.values_mut() {
            if !turn.uncertain_paths.is_empty() {
                turn.status = TurnStatus::Uncertain;
            }
        }
    }
    projection.unresolved_approvals.sort_unstable();
    projection.uncertain_paths.sort();
    projection.uncertain_paths.dedup();
    for turn in projection.turns.values_mut() {
        turn.uncertain_paths.sort();
        turn.uncertain_paths.dedup();
        turn.started_effects.sort_unstable();
        turn.started_effects.dedup();
        turn.completed_effects.sort_unstable();
        turn.completed_effects.dedup();
        turn.missing_tool_results.sort_unstable();
        turn.missing_tool_results.dedup();
    }
    projection
}

fn turn_mut(projection: &mut SessionProjection, turn_id: TurnId) -> &mut TurnProjection {
    projection
        .turns
        .entry(turn_id)
        .or_insert_with(|| TurnProjection {
            turn_id,
            status: TurnStatus::Preparing,
            user_message: None,
            request_id: None,
            pending_approvals: Vec::new(),
            uncertain_paths: Vec::new(),
            started_effects: Vec::new(),
            completed_effects: Vec::new(),
            missing_tool_results: Vec::new(),
        })
}

fn terminal(projection: &mut SessionProjection, turn_id: TurnId, status: TurnStatus) {
    turn_mut(projection, turn_id).status = status;
}

fn unresolved_approval_turns(records: &[RecordEnvelope]) -> HashSet<TurnId> {
    let mut pending = HashMap::<ApprovalId, TurnId>::new();
    for record in records {
        match record.typed_payload() {
            Ok(RecordPayload::ApprovalRequested(value)) => {
                pending.insert(value.approval_id, value.turn_id);
            }
            Ok(RecordPayload::ApprovalResolved(value)) => {
                pending.remove(&value.approval_id);
            }
            _ => {}
        }
    }
    pending.into_values().collect()
}

fn read_bytes(path: &Path) -> Result<Vec<u8>, RecoveryError> {
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|_| RecoveryError::Unavailable)?
        .read_to_end(&mut bytes)
        .map_err(|_| RecoveryError::Unavailable)?;
    Ok(bytes)
}

fn set_private(path: &Path) -> Result<(), RecoveryError> {
    let mut permissions = fs::metadata(path)
        .map_err(|_| RecoveryError::RepairFailed)?
        .permissions();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        permissions.set_mode(0o600);
    }
    fs::set_permissions(path, permissions).map_err(|_| RecoveryError::RepairFailed)
}

fn sync_directory(path: &Path) -> Result<(), RecoveryError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| RecoveryError::RepairFailed)
}
