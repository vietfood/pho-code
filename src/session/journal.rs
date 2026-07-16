//! Serialized JSONL journal writer and durable effect boundary.

use std::collections::HashMap;
use std::collections::HashSet;
use std::fs::{File, OpenOptions};
use std::io::{Read as _, Write as _};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::Value;

use crate::agent::types::{SessionId, ToolCallId, TurnId};
use crate::tools::patch::{EffectProgress, EffectRecorder};

use super::SessionStore;
use super::record::{
    EffectStage, MAXIMUM_RECORD_LINE_BYTES, RecordEnvelope, RecordError, RecordKind, RecordPayload,
    ToolEffectProgress,
};

pub const MAXIMUM_SESSION_RECORDS: u64 = 1_000_000;
pub const MAXIMUM_SESSION_JOURNAL_BYTES: usize = 256 * 1024 * 1024;

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum JournalError {
    #[error("journal is unavailable")]
    Unavailable,
    #[error("journal is read-only")]
    ReadOnly,
    #[error("journal record is malformed")]
    Malformed,
    #[error("journal record is too large")]
    TooLarge,
    #[error("journal sequence is invalid")]
    Sequence,
    #[error("journal terminal identity is duplicated")]
    DuplicateTerminal,
    #[error("journal session identity does not match")]
    WrongSession,
    #[error("journal flush failed")]
    Flush,
}

struct WriterState {
    file: File,
    next_sequence: u64,
    terminal_turns: HashSet<TurnId>,
    terminal_identities: HashSet<(RecordKind, String)>,
    read_only: bool,
    current_bytes: usize,
}

/// One serialized append/flush owner for one session file.
pub struct JournalWriter {
    path: PathBuf,
    session_id: SessionId,
    state: Mutex<WriterState>,
}

impl std::fmt::Debug for JournalWriter {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("JournalWriter")
            .field("session_id", &self.session_id)
            .finish_non_exhaustive()
    }
}

impl JournalWriter {
    pub fn create(path: impl AsRef<Path>, session_id: SessionId) -> Result<Self, JournalError> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|_| JournalError::Unavailable)?;
        }
        let file = OpenOptions::new()
            .create_new(true)
            .append(true)
            .open(&path)
            .map_err(|_| JournalError::Unavailable)?;
        set_private(&path)?;
        sync_parent(&path)?;
        Ok(Self {
            path,
            session_id,
            state: Mutex::new(WriterState {
                file,
                next_sequence: 1,
                terminal_turns: HashSet::new(),
                terminal_identities: HashSet::new(),
                read_only: false,
                current_bytes: 0,
            }),
        })
    }

    pub fn open(path: impl AsRef<Path>, session_id: SessionId) -> Result<Self, JournalError> {
        let path = path.as_ref().to_path_buf();
        let mut bytes = Vec::new();
        File::open(&path)
            .map_err(|_| JournalError::Unavailable)?
            .read_to_end(&mut bytes)
            .map_err(|_| JournalError::Unavailable)?;
        let mut expected = 1_u64;
        let mut terminals = HashSet::new();
        let mut terminal_identities = HashSet::new();
        let mut cursor = 0;
        if bytes.len() > MAXIMUM_SESSION_JOURNAL_BYTES {
            return Err(JournalError::TooLarge);
        }
        while cursor < bytes.len() {
            let Some(relative_end) = bytes[cursor..].iter().position(|byte| *byte == b'\n') else {
                return Err(JournalError::ReadOnly);
            };
            let end = cursor + relative_end + 1;
            let record = RecordEnvelope::decode(&bytes[cursor..end]).map_err(map_record_error)?;
            if record.session_id != session_id || record.sequence != expected {
                return Err(if record.session_id != session_id {
                    JournalError::WrongSession
                } else {
                    JournalError::Sequence
                });
            }
            if record.kind.is_terminal()
                && let Some(turn) = payload_turn_id(&record.payload)
                && !terminals.insert(turn)
            {
                return Err(JournalError::DuplicateTerminal);
            }
            if let Some(identity) = payload_identity(record.kind, &record.payload)
                && !terminal_identities.insert((record.kind, identity))
            {
                return Err(JournalError::DuplicateTerminal);
            }
            expected = expected.checked_add(1).ok_or(JournalError::Sequence)?;
            if expected > MAXIMUM_SESSION_RECORDS + 1 {
                return Err(JournalError::TooLarge);
            }
            cursor = end;
        }
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|_| JournalError::Unavailable)?;
        set_private(&path)?;
        sync_parent(&path)?;
        Ok(Self {
            path,
            session_id,
            state: Mutex::new(WriterState {
                file,
                next_sequence: expected,
                terminal_turns: terminals,
                terminal_identities,
                read_only: false,
                current_bytes: bytes.len(),
            }),
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn session_id(&self) -> SessionId {
        self.session_id
    }

    pub fn next_sequence(&self) -> Result<u64, JournalError> {
        self.state
            .lock()
            .map(|state| state.next_sequence)
            .map_err(|_| JournalError::Unavailable)
    }

    pub fn append_payload(&self, payload: RecordPayload) -> Result<RecordEnvelope, JournalError> {
        let kind = payload.kind();
        let value = payload.to_value().map_err(|_| JournalError::Malformed)?;
        self.append(kind, value)
    }

    pub fn append(&self, kind: RecordKind, payload: Value) -> Result<RecordEnvelope, JournalError> {
        let sequence = self.next_sequence()?;
        let record = RecordEnvelope::from_value(self.session_id, sequence, kind, payload)
            .map_err(map_record_error)?;
        self.append_envelope(record)
    }

    fn append_envelope(&self, record: RecordEnvelope) -> Result<RecordEnvelope, JournalError> {
        let mut state = self.state.lock().map_err(|_| JournalError::Unavailable)?;
        if state.read_only {
            return Err(JournalError::ReadOnly);
        }
        if record.session_id != self.session_id {
            return Err(JournalError::WrongSession);
        }
        if record.sequence != state.next_sequence {
            return Err(JournalError::Sequence);
        }
        record.validate().map_err(map_record_error)?;
        let terminal_turn = record
            .kind
            .is_terminal()
            .then(|| payload_turn_id(&record.payload))
            .flatten();
        if terminal_turn.is_some_and(|turn| state.terminal_turns.contains(&turn)) {
            return Err(JournalError::DuplicateTerminal);
        }
        let terminal_identity =
            payload_identity(record.kind, &record.payload).map(|identity| (record.kind, identity));
        if terminal_identity
            .as_ref()
            .is_some_and(|identity| state.terminal_identities.contains(identity))
        {
            return Err(JournalError::DuplicateTerminal);
        }
        let encoded = record.encode().map_err(map_record_error)?;
        if encoded.len() > MAXIMUM_RECORD_LINE_BYTES {
            return Err(JournalError::TooLarge);
        }
        let next_bytes = state
            .current_bytes
            .checked_add(encoded.len())
            .ok_or(JournalError::TooLarge)?;
        if state.next_sequence > MAXIMUM_SESSION_RECORDS
            || next_bytes > MAXIMUM_SESSION_JOURNAL_BYTES
        {
            return Err(JournalError::TooLarge);
        }
        if state.file.write_all(&encoded).is_err() {
            state.read_only = true;
            return Err(JournalError::Unavailable);
        }
        if state.file.flush().is_err() || state.file.sync_all().is_err() {
            state.read_only = true;
            return Err(JournalError::Flush);
        }
        state.next_sequence = state
            .next_sequence
            .checked_add(1)
            .ok_or(JournalError::Sequence)?;
        state.current_bytes = next_bytes;
        if let Some(turn) = terminal_turn {
            state.terminal_turns.insert(turn);
        }
        if let Some(identity) = terminal_identity {
            state.terminal_identities.insert(identity);
        }
        Ok(record)
    }

    pub fn append_record(&self, record: RecordEnvelope) -> Result<(), JournalError> {
        if record.session_id != self.session_id {
            return Err(JournalError::WrongSession);
        }
        self.append_envelope(record).map(|_| ())
    }

    pub fn flush(&self) -> Result<(), JournalError> {
        let mut state = self.state.lock().map_err(|_| JournalError::Unavailable)?;
        state.file.flush().map_err(|_| JournalError::Flush)?;
        state.file.sync_all().map_err(|_| JournalError::Flush)
    }
}

impl SessionStore for JournalWriter {
    fn append(&self, record: &[u8]) -> Result<(), &'static str> {
        let envelope = RecordEnvelope::decode(record).map_err(|_| "invalid session record")?;
        self.append_record(envelope)
            .map_err(|_| "session journal append failed")
    }
}

/// Patch's effect recorder translated into durable journal records.  It is intentionally bound to
/// one turn and tool call so a caller cannot accidentally record a progress event under another
/// identity.
pub struct JournalEffectRecorder {
    writer: std::sync::Arc<JournalWriter>,
    turn_id: TurnId,
    tool_call_id: ToolCallId,
    effect_digest: String,
}

/// Shared recorder used by the tool runtime.  The coordinator binds the local identities once a
/// prepared call is approved; patch progress then carries its validated digest, so a progress
/// event cannot be attributed to a different call.  Bindings are single-use and are never reused
/// after a completed or failed execution.
pub struct SessionEffectRecorder {
    writer: std::sync::Arc<JournalWriter>,
    state: Mutex<BindingState>,
}

struct BindingState {
    bindings: HashMap<String, Binding>,
}

struct Binding {
    turn_id: TurnId,
    tool_call_id: ToolCallId,
    started: HashSet<(u32, String, String)>,
    completed: HashSet<(u32, String, String)>,
}

impl SessionEffectRecorder {
    pub fn new(writer: std::sync::Arc<JournalWriter>) -> Self {
        Self {
            writer,
            state: Mutex::new(BindingState {
                bindings: HashMap::new(),
            }),
        }
    }

    pub fn bind(
        &self,
        effect_digest: impl Into<String>,
        turn_id: TurnId,
        tool_call_id: ToolCallId,
    ) -> Result<(), &'static str> {
        let digest = effect_digest.into();
        if digest.is_empty() {
            return Err("effect digest is empty");
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| "effect recorder unavailable")?;
        if state.bindings.contains_key(&digest) {
            return Err("effect digest was already bound");
        }
        state.bindings.insert(
            digest,
            Binding {
                turn_id,
                tool_call_id,
                started: HashSet::new(),
                completed: HashSet::new(),
            },
        );
        Ok(())
    }

    pub fn finish(&self, effect_digest: &str) -> Result<(), &'static str> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "effect recorder unavailable")?;
        let complete = state
            .bindings
            .get(effect_digest)
            .ok_or("effect digest was not bound")?
            .started
            .len()
            == state
                .bindings
                .get(effect_digest)
                .map_or(0, |binding| binding.completed.len());
        if !complete {
            return Err("effect has incomplete progress");
        }
        state.bindings.remove(effect_digest);
        Ok(())
    }

    pub fn finish_uncertain(&self, effect_digest: &str) -> Result<(), &'static str> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "effect recorder unavailable")?;
        state
            .bindings
            .remove(effect_digest)
            .ok_or("effect digest was not bound")?;
        Ok(())
    }

    fn record_bound(
        &self,
        stage: EffectStage,
        progress: &EffectProgress,
    ) -> Result<(), &'static str> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "effect recorder unavailable")?;
        let Some(binding) = state.bindings.get_mut(&progress.digest) else {
            return Err("effect digest was not bound");
        };
        let key = (
            u32::try_from(progress.index).map_err(|_| "effect index exceeded bound")?,
            progress.path.clone(),
            format!("{:?}", progress.direction).to_ascii_lowercase(),
        );
        match stage {
            EffectStage::Started => {
                if !binding.started.insert(key.clone()) {
                    return Err("effect start was duplicated");
                }
            }
            EffectStage::Completed => {
                if !binding.started.contains(&key) || !binding.completed.insert(key) {
                    return Err("effect completed before start");
                }
            }
        }
        let payload = ToolEffectProgress {
            turn_id: binding.turn_id,
            tool_call_id: binding.tool_call_id,
            effect_digest: progress.digest.clone(),
            stage: stage.clone(),
            index: u32::try_from(progress.index).map_err(|_| "effect index exceeded bound")?,
            path: progress.path.clone(),
            operation: format!("{:?}", progress.operation).to_ascii_lowercase(),
            direction: format!("{:?}", progress.direction).to_ascii_lowercase(),
            recovery_artifact: progress.recovery_artifact,
            extra: Default::default(),
        };
        self.writer
            .append_payload(RecordPayload::ToolEffectProgress(payload))
            .map_err(|_| "effect progress journal append failed")?;
        Ok(())
    }
}

impl EffectRecorder for SessionEffectRecorder {
    fn started(&self, progress: &EffectProgress) -> Result<(), &'static str> {
        self.record_bound(EffectStage::Started, progress)
    }

    fn completed(&self, progress: &EffectProgress) -> Result<(), &'static str> {
        self.record_bound(EffectStage::Completed, progress)
    }
}

impl JournalEffectRecorder {
    pub fn new(
        writer: std::sync::Arc<JournalWriter>,
        turn_id: TurnId,
        tool_call_id: ToolCallId,
        effect_digest: impl Into<String>,
    ) -> Self {
        Self {
            writer,
            turn_id,
            tool_call_id,
            effect_digest: effect_digest.into(),
        }
    }

    fn record(&self, stage: EffectStage, progress: &EffectProgress) -> Result<(), &'static str> {
        let payload = ToolEffectProgress {
            turn_id: self.turn_id,
            tool_call_id: self.tool_call_id,
            effect_digest: self.effect_digest.clone(),
            stage,
            index: u32::try_from(progress.index).map_err(|_| "effect index exceeded bound")?,
            path: progress.path.clone(),
            operation: format!("{:?}", progress.operation).to_ascii_lowercase(),
            direction: format!("{:?}", progress.direction).to_ascii_lowercase(),
            recovery_artifact: progress.recovery_artifact,
            extra: Default::default(),
        };
        self.writer
            .append_payload(RecordPayload::ToolEffectProgress(payload))
            .map(|_| ())
            .map_err(|_| "effect progress journal append failed")
    }
}

impl EffectRecorder for JournalEffectRecorder {
    fn started(&self, progress: &EffectProgress) -> Result<(), &'static str> {
        self.record(EffectStage::Started, progress)
    }

    fn completed(&self, progress: &EffectProgress) -> Result<(), &'static str> {
        self.record(EffectStage::Completed, progress)
    }
}

fn payload_turn_id(payload: &Value) -> Option<TurnId> {
    payload
        .get("turn_id")
        .and_then(|value| serde_json::from_value(value.clone()).ok())
}

fn payload_identity(kind: RecordKind, payload: &Value) -> Option<String> {
    let value = match kind {
        RecordKind::ApprovalResolved => payload.get("approval_id"),
        RecordKind::ToolExecutionCompleted | RecordKind::ToolResultCompleted => {
            payload.get("tool_call_id").or_else(|| {
                payload
                    .get("result")
                    .and_then(|value| value.get("tool_call_id"))
            })
        }
        _ => None,
    }?;
    Some(
        value
            .as_str()
            .map_or_else(|| value.to_string(), str::to_owned),
    )
}

fn map_record_error(error: RecordError) -> JournalError {
    match error {
        RecordError::LineTooLarge | RecordError::PayloadTooLarge => JournalError::TooLarge,
        RecordError::InvalidSequence => JournalError::Sequence,
        _ => JournalError::Malformed,
    }
}

fn set_private(path: &Path) -> Result<(), JournalError> {
    let mut permissions = std::fs::metadata(path)
        .map_err(|_| JournalError::Unavailable)?
        .permissions();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        permissions.set_mode(0o600);
    }
    std::fs::set_permissions(path, permissions).map_err(|_| JournalError::Unavailable)
}

fn sync_parent(path: &Path) -> Result<(), JournalError> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| JournalError::Unavailable)
}
