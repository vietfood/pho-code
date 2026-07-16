//! Versioned, bounded session records.
//!
//! The journal stores one [`RecordEnvelope`] per JSONL line.  This module deliberately keeps the
//! wire shape independent of the reducer: a reader can validate and retain records even when a
//! newer presentation does not understand an optional payload member.

use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::agent::types::{
    ApprovalId, ArtifactId, BackendRequestId, ItemId, SessionId, ToolCallId, TurnId, WorkspaceId,
};
use crate::backend::{AssistantPhase, ToolResult, Usage};

pub const SCHEMA_VERSION: u16 = 1;
pub const MAXIMUM_RECORD_PAYLOAD_BYTES: usize = 512 * 1024;
pub const MAXIMUM_RECORD_LINE_BYTES: usize = 1024 * 1024;
pub const MAXIMUM_DIAGNOSTIC_BYTES: usize = 16 * 1024;
pub const MAXIMUM_STRING_BYTES: usize = 256 * 1024;

/// Every persisted V1 record kind.  Unknown kinds are intentionally rejected: a reader cannot
/// safely project a record that may contain an effect boundary.
#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RecordKind {
    SessionCreated,
    SessionMetadataUpdated,
    TurnStarted,
    UserMessageCompleted,
    BackendRequestStarted,
    AssistantPhaseCompleted,
    ToolCallCompleted,
    ApprovalRequested,
    ApprovalResolved,
    ToolExecutionStarted,
    ToolEffectProgress,
    ToolExecutionCompleted,
    ToolResultCompleted,
    UsageObserved,
    TurnCompleted,
    TurnFailed,
    TurnCancelled,
    TurnInterrupted,
    TurnUncertain,
    DiagnosticRecorded,
}

impl RecordKind {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::TurnCompleted
                | Self::TurnFailed
                | Self::TurnCancelled
                | Self::TurnInterrupted
                | Self::TurnUncertain
        )
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SessionProfile {
    pub model: String,
    pub thinking_mode: String,
    pub reasoning_effort: String,
    pub profile_revision: u32,
    pub instruction_profile_revision: u32,
    pub instruction_profile_sha256: String,
}

impl Default for SessionProfile {
    fn default() -> Self {
        Self {
            model: crate::backend::profile::MODEL.into(),
            thinking_mode: crate::backend::profile::THINKING_MODE.into(),
            reasoning_effort: crate::backend::profile::REASONING_EFFORT.into(),
            profile_revision: crate::backend::profile::PROFILE_REVISION,
            instruction_profile_revision: crate::agent::instructions::INSTRUCTION_PROFILE_REVISION,
            instruction_profile_sha256: crate::agent::instructions::INSTRUCTION_PROFILE_SHA256
                .into(),
        }
    }
}

impl SessionProfile {
    pub fn new(
        model: impl Into<String>,
        thinking_mode: impl Into<String>,
        reasoning_effort: impl Into<String>,
        profile_revision: u32,
        instruction_profile_revision: u32,
        instruction_profile_sha256: impl Into<String>,
    ) -> Self {
        Self {
            model: model.into(),
            thinking_mode: thinking_mode.into(),
            reasoning_effort: reasoning_effort.into(),
            profile_revision,
            instruction_profile_revision,
            instruction_profile_sha256: instruction_profile_sha256.into(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SessionCreated {
    pub workspace_id: WorkspaceId,
    pub workspace: String,
    pub profile: SessionProfile,
    pub instruction_profile_digest: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SessionMetadataUpdated {
    pub workspace_id: Option<WorkspaceId>,
    pub workspace: Option<String>,
    pub profile: Option<SessionProfile>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TurnStarted {
    pub turn_id: TurnId,
    pub item_id: ItemId,
    pub workspace_id: WorkspaceId,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct UserMessageCompleted {
    pub turn_id: TurnId,
    pub item_id: ItemId,
    pub text: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct BackendRequestStarted {
    pub turn_id: TurnId,
    pub request_id: BackendRequestId,
    pub model: String,
    pub profile: SessionProfile,
    pub message_count: u32,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct AssistantPhaseCompleted {
    pub turn_id: TurnId,
    pub phase: AssistantPhase,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolCallCompleted {
    pub turn_id: TurnId,
    pub tool_call_id: ToolCallId,
    pub provider_call_id: String,
    pub name: String,
    pub arguments: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ApprovalRequested {
    pub turn_id: TurnId,
    pub approval_id: ApprovalId,
    pub tool_call_id: ToolCallId,
    pub effect_digest: String,
    pub summary: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ApprovalResolved {
    pub turn_id: TurnId,
    pub approval_id: ApprovalId,
    pub tool_call_id: ToolCallId,
    pub effect_digest: String,
    pub decision: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolExecutionStarted {
    pub turn_id: TurnId,
    pub tool_call_id: ToolCallId,
    pub effect_digest: String,
    pub name: String,
    pub mutating: bool,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectStage {
    Started,
    Completed,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolEffectProgress {
    pub turn_id: TurnId,
    pub tool_call_id: ToolCallId,
    pub effect_digest: String,
    pub stage: EffectStage,
    pub index: u32,
    pub path: String,
    pub operation: String,
    pub direction: String,
    pub recovery_artifact: Option<ArtifactId>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolExecutionCompleted {
    pub turn_id: TurnId,
    pub tool_call_id: ToolCallId,
    pub status: String,
    pub effect_digest: Option<String>,
    pub result_digest: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolResultCompleted {
    pub turn_id: TurnId,
    pub result: ToolResult,
    pub status: String,
    pub artifact: Option<ArtifactReference>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ArtifactReference {
    pub artifact_id: ArtifactId,
    pub byte_count: u64,
    pub sha256: String,
    pub classification: String,
    pub truncated: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct UsageObserved {
    pub turn_id: TurnId,
    pub request_id: BackendRequestId,
    pub usage: Usage,
    pub observed_at: String,
    pub profile: SessionProfile,
    pub price_profile_revision: Option<String>,
    pub currency: Option<String>,
    pub estimated_amount: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TurnTerminal {
    pub turn_id: TurnId,
    pub reason: Option<String>,
    pub code: Option<String>,
    pub uncertain_paths: Vec<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl TurnTerminal {
    pub fn new(turn_id: TurnId) -> Self {
        Self {
            turn_id,
            reason: None,
            code: None,
            uncertain_paths: Vec::new(),
            extra: BTreeMap::new(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct DiagnosticRecorded {
    pub code: String,
    pub message: String,
    pub related_turn: Option<TurnId>,
    pub related_tool_call: Option<ToolCallId>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Eq, PartialEq)]
pub enum RecordPayload {
    SessionCreated(SessionCreated),
    SessionMetadataUpdated(SessionMetadataUpdated),
    TurnStarted(TurnStarted),
    UserMessageCompleted(UserMessageCompleted),
    BackendRequestStarted(BackendRequestStarted),
    AssistantPhaseCompleted(AssistantPhaseCompleted),
    ToolCallCompleted(ToolCallCompleted),
    ApprovalRequested(ApprovalRequested),
    ApprovalResolved(ApprovalResolved),
    ToolExecutionStarted(ToolExecutionStarted),
    ToolEffectProgress(ToolEffectProgress),
    ToolExecutionCompleted(ToolExecutionCompleted),
    ToolResultCompleted(ToolResultCompleted),
    UsageObserved(UsageObserved),
    TurnCompleted(TurnTerminal),
    TurnFailed(TurnTerminal),
    TurnCancelled(TurnTerminal),
    TurnInterrupted(TurnTerminal),
    TurnUncertain(TurnTerminal),
    DiagnosticRecorded(DiagnosticRecorded),
}

impl std::fmt::Debug for RecordPayload {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("RecordPayload")
            .field("kind", &self.kind())
            .finish()
    }
}

impl RecordPayload {
    pub fn kind(&self) -> RecordKind {
        match self {
            Self::SessionCreated(_) => RecordKind::SessionCreated,
            Self::SessionMetadataUpdated(_) => RecordKind::SessionMetadataUpdated,
            Self::TurnStarted(_) => RecordKind::TurnStarted,
            Self::UserMessageCompleted(_) => RecordKind::UserMessageCompleted,
            Self::BackendRequestStarted(_) => RecordKind::BackendRequestStarted,
            Self::AssistantPhaseCompleted(_) => RecordKind::AssistantPhaseCompleted,
            Self::ToolCallCompleted(_) => RecordKind::ToolCallCompleted,
            Self::ApprovalRequested(_) => RecordKind::ApprovalRequested,
            Self::ApprovalResolved(_) => RecordKind::ApprovalResolved,
            Self::ToolExecutionStarted(_) => RecordKind::ToolExecutionStarted,
            Self::ToolEffectProgress(_) => RecordKind::ToolEffectProgress,
            Self::ToolExecutionCompleted(_) => RecordKind::ToolExecutionCompleted,
            Self::ToolResultCompleted(_) => RecordKind::ToolResultCompleted,
            Self::UsageObserved(_) => RecordKind::UsageObserved,
            Self::TurnCompleted(_) => RecordKind::TurnCompleted,
            Self::TurnFailed(_) => RecordKind::TurnFailed,
            Self::TurnCancelled(_) => RecordKind::TurnCancelled,
            Self::TurnInterrupted(_) => RecordKind::TurnInterrupted,
            Self::TurnUncertain(_) => RecordKind::TurnUncertain,
            Self::DiagnosticRecorded(_) => RecordKind::DiagnosticRecorded,
        }
    }

    pub fn to_value(&self) -> Result<Value, serde_json::Error> {
        match self {
            Self::SessionCreated(value) => serde_json::to_value(value),
            Self::SessionMetadataUpdated(value) => serde_json::to_value(value),
            Self::TurnStarted(value) => serde_json::to_value(value),
            Self::UserMessageCompleted(value) => serde_json::to_value(value),
            Self::BackendRequestStarted(value) => serde_json::to_value(value),
            Self::AssistantPhaseCompleted(value) => serde_json::to_value(value),
            Self::ToolCallCompleted(value) => serde_json::to_value(value),
            Self::ApprovalRequested(value) => serde_json::to_value(value),
            Self::ApprovalResolved(value) => serde_json::to_value(value),
            Self::ToolExecutionStarted(value) => serde_json::to_value(value),
            Self::ToolEffectProgress(value) => serde_json::to_value(value),
            Self::ToolExecutionCompleted(value) => serde_json::to_value(value),
            Self::ToolResultCompleted(value) => serde_json::to_value(value),
            Self::UsageObserved(value) => serde_json::to_value(value),
            Self::TurnCompleted(value)
            | Self::TurnFailed(value)
            | Self::TurnCancelled(value)
            | Self::TurnInterrupted(value)
            | Self::TurnUncertain(value) => serde_json::to_value(value),
            Self::DiagnosticRecorded(value) => serde_json::to_value(value),
        }
    }
}

#[derive(Clone, Eq, PartialEq, Serialize)]
pub struct RecordEnvelope {
    pub schema_version: u16,
    pub sequence: u64,
    pub recorded_at: String,
    pub session_id: SessionId,
    pub kind: RecordKind,
    pub payload: Value,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl std::fmt::Debug for RecordEnvelope {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("RecordEnvelope")
            .field("schema_version", &self.schema_version)
            .field("sequence", &self.sequence)
            .field("recorded_at", &self.recorded_at)
            .field("session_id", &self.session_id)
            .field("kind", &self.kind)
            .field(
                "payload_bytes",
                &serde_json::to_vec(&self.payload).map_or(0, |bytes| bytes.len()),
            )
            .finish()
    }
}

#[derive(Deserialize)]
struct RawRecordEnvelope {
    schema_version: u16,
    sequence: u64,
    recorded_at: String,
    session_id: SessionId,
    kind: RecordKind,
    payload: Value,
    #[serde(flatten)]
    extra: BTreeMap<String, Value>,
}

impl<'de> Deserialize<'de> for RecordEnvelope {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = RawRecordEnvelope::deserialize(deserializer)?;
        let record = Self {
            schema_version: raw.schema_version,
            sequence: raw.sequence,
            recorded_at: raw.recorded_at,
            session_id: raw.session_id,
            kind: raw.kind,
            payload: raw.payload,
            extra: raw.extra,
        };
        record.validate().map_err(serde::de::Error::custom)?;
        Ok(record)
    }
}

pub type SessionRecord = RecordEnvelope;

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RecordError {
    #[error("record schema is unsupported")]
    UnsupportedSchema,
    #[error("record sequence is invalid")]
    InvalidSequence,
    #[error("record payload must be an object")]
    PayloadNotObject,
    #[error("record payload exceeds its bound")]
    PayloadTooLarge,
    #[error("record line exceeds its bound")]
    LineTooLarge,
    #[error("record JSON is malformed")]
    MalformedJson,
    #[error("record kind payload does not match its kind")]
    PayloadKindMismatch,
    #[error("record is missing a required field")]
    MissingRequiredField,
}

impl RecordEnvelope {
    pub fn from_payload(
        session_id: SessionId,
        sequence: u64,
        payload: RecordPayload,
    ) -> Result<Self, RecordError> {
        Self::new(session_id, sequence, &payload)
    }

    pub fn new(
        session_id: SessionId,
        sequence: u64,
        payload: &RecordPayload,
    ) -> Result<Self, RecordError> {
        let value = payload
            .to_value()
            .map_err(|_| RecordError::PayloadKindMismatch)?;
        Self::from_value(session_id, sequence, payload.kind(), value)
    }

    pub fn from_value(
        session_id: SessionId,
        sequence: u64,
        kind: RecordKind,
        payload: Value,
    ) -> Result<Self, RecordError> {
        let envelope = Self {
            schema_version: SCHEMA_VERSION,
            sequence,
            recorded_at: timestamp(),
            session_id,
            kind,
            payload,
            extra: BTreeMap::new(),
        };
        envelope.validate()?;
        Ok(envelope)
    }

    pub fn with_recorded_at(mut self, recorded_at: impl Into<String>) -> Result<Self, RecordError> {
        self.recorded_at = recorded_at.into();
        self.validate()?;
        Ok(self)
    }

    pub fn validate(&self) -> Result<(), RecordError> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(RecordError::UnsupportedSchema);
        }
        if self.sequence == 0 {
            return Err(RecordError::InvalidSequence);
        }
        if self.recorded_at.is_empty() || self.recorded_at.len() > 128 {
            return Err(RecordError::MissingRequiredField);
        }
        if !self.payload.is_object() {
            return Err(RecordError::PayloadNotObject);
        }
        let payload_bytes =
            serde_json::to_vec(&self.payload).map_err(|_| RecordError::PayloadTooLarge)?;
        if payload_bytes.len() > MAXIMUM_RECORD_PAYLOAD_BYTES {
            return Err(RecordError::PayloadTooLarge);
        }
        let line_bytes = serde_json::to_vec(self).map_err(|_| RecordError::LineTooLarge)?;
        if line_bytes.len() + 1 > MAXIMUM_RECORD_LINE_BYTES {
            return Err(RecordError::LineTooLarge);
        }
        // Deserializing the kind-specific payload here enforces required fields while each
        // payload's flattened map continues to tolerate unknown optional members.
        self.typed_payload()?;
        Ok(())
    }

    pub fn encode(&self) -> Result<Vec<u8>, RecordError> {
        self.validate()?;
        let mut bytes = serde_json::to_vec(self).map_err(|_| RecordError::MalformedJson)?;
        bytes.push(b'\n');
        Ok(bytes)
    }

    pub fn decode(line: &[u8]) -> Result<Self, RecordError> {
        if line.len() > MAXIMUM_RECORD_LINE_BYTES {
            return Err(RecordError::LineTooLarge);
        }
        let line = line.strip_suffix(b"\n").unwrap_or(line);
        let raw: Value = serde_json::from_slice(line).map_err(|_| RecordError::MalformedJson)?;
        if raw
            .get("schema_version")
            .and_then(Value::as_u64)
            .is_some_and(|version| version != u64::from(SCHEMA_VERSION))
        {
            return Err(RecordError::UnsupportedSchema);
        }
        let record: Self = serde_json::from_value(raw).map_err(|_| RecordError::MalformedJson)?;
        record.validate()?;
        Ok(record)
    }

    pub fn typed_payload(&self) -> Result<RecordPayload, RecordError> {
        macro_rules! parse {
            ($ty:ty, $variant:ident) => {
                serde_json::from_value::<$ty>(self.payload.clone())
                    .map(RecordPayload::$variant)
                    .map_err(|_| RecordError::PayloadKindMismatch)
            };
        }
        match self.kind {
            RecordKind::SessionCreated => parse!(SessionCreated, SessionCreated),
            RecordKind::SessionMetadataUpdated => {
                parse!(SessionMetadataUpdated, SessionMetadataUpdated)
            }
            RecordKind::TurnStarted => parse!(TurnStarted, TurnStarted),
            RecordKind::UserMessageCompleted => parse!(UserMessageCompleted, UserMessageCompleted),
            RecordKind::BackendRequestStarted => {
                parse!(BackendRequestStarted, BackendRequestStarted)
            }
            RecordKind::AssistantPhaseCompleted => {
                parse!(AssistantPhaseCompleted, AssistantPhaseCompleted)
            }
            RecordKind::ToolCallCompleted => parse!(ToolCallCompleted, ToolCallCompleted),
            RecordKind::ApprovalRequested => parse!(ApprovalRequested, ApprovalRequested),
            RecordKind::ApprovalResolved => parse!(ApprovalResolved, ApprovalResolved),
            RecordKind::ToolExecutionStarted => parse!(ToolExecutionStarted, ToolExecutionStarted),
            RecordKind::ToolEffectProgress => parse!(ToolEffectProgress, ToolEffectProgress),
            RecordKind::ToolExecutionCompleted => {
                parse!(ToolExecutionCompleted, ToolExecutionCompleted)
            }
            RecordKind::ToolResultCompleted => parse!(ToolResultCompleted, ToolResultCompleted),
            RecordKind::UsageObserved => parse!(UsageObserved, UsageObserved),
            RecordKind::TurnCompleted => parse!(TurnTerminal, TurnCompleted),
            RecordKind::TurnFailed => parse!(TurnTerminal, TurnFailed),
            RecordKind::TurnCancelled => parse!(TurnTerminal, TurnCancelled),
            RecordKind::TurnInterrupted => parse!(TurnTerminal, TurnInterrupted),
            RecordKind::TurnUncertain => parse!(TurnTerminal, TurnUncertain),
            RecordKind::DiagnosticRecorded => parse!(DiagnosticRecorded, DiagnosticRecorded),
        }
    }
}

fn timestamp() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let seconds = duration.as_secs();
    let days = seconds / 86_400;
    let day_seconds = seconds % 86_400;
    let (year, month, day) = civil_from_days(days as i64);
    let hour = day_seconds / 3_600;
    let minute = (day_seconds % 3_600) / 60;
    let second = day_seconds % 60;
    format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{:03}Z",
        duration.subsec_millis()
    )
}

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let shifted = days_since_epoch + 719_468;
    let era = (if shifted >= 0 {
        shifted
    } else {
        shifted - 146_096
    }) / 146_097;
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    let year = year + i64::from(month <= 2);
    (year, month, day)
}
