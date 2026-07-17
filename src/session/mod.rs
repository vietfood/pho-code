pub mod artifacts;
pub mod catalog;
pub mod journal;
pub mod record;
pub mod recovery;

pub trait SessionStore: Send + Sync {
    fn append(&self, record: &[u8]) -> Result<(), &'static str>;
}

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::agent::types::{SessionId, WorkspaceId};

use self::journal::{JournalError, JournalWriter};
use self::record::{RecordPayload, SessionCreated, SessionProfile};
use self::recovery::{RecoveryError, ScanResult, recover};

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum SessionError {
    #[error("session store is unavailable")]
    Unavailable,
    #[error("session identity is invalid")]
    InvalidIdentity,
    #[error("session journal is read-only")]
    ReadOnly,
    #[error("session recovery failed")]
    Recovery,
    #[error("session journal append failed")]
    Journal,
}

pub struct OpenedSession {
    pub session_id: SessionId,
    pub path: PathBuf,
    pub recovery: ScanResult,
    pub projection: recovery::SessionProjection,
    pub writer: Option<Arc<JournalWriter>>,
}

impl std::fmt::Debug for OpenedSession {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("OpenedSession")
            .field("session_id", &self.session_id)
            .field("read_only", &self.recovery.read_only)
            .finish_non_exhaustive()
    }
}

#[derive(Clone, Eq, PartialEq)]
pub struct SessionSummary {
    pub session_id: SessionId,
    pub path: PathBuf,
    pub workspace: Option<String>,
    pub read_only: bool,
}

impl std::fmt::Debug for SessionSummary {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SessionSummary")
            .field("session_id", &self.session_id)
            .field("workspace_present", &self.workspace.is_some())
            .field("read_only", &self.read_only)
            .finish()
    }
}

/// Session directory owner.  IDs are parsed from filenames and no caller-supplied arbitrary path
/// is accepted by `open`, preventing command adapters from escaping the application directory.
pub struct SessionManager {
    root: PathBuf,
}

impl SessionManager {
    pub fn new(root: impl AsRef<Path>) -> Result<Self, SessionError> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(root.join("sessions")).map_err(|_| SessionError::Unavailable)?;
        fs::create_dir_all(root.join("artifacts")).map_err(|_| SessionError::Unavailable)?;
        set_private(&root)?;
        set_private(&root.join("sessions"))?;
        set_private(&root.join("artifacts"))?;
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn create(
        &self,
        workspace: impl Into<String>,
        profile: SessionProfile,
    ) -> Result<OpenedSession, SessionError> {
        let session_id = SessionId::new();
        let path = self.session_path(session_id);
        let writer = Arc::new(JournalWriter::create(&path, session_id).map_err(map_journal_error)?);
        let payload = SessionCreated {
            workspace_id: WorkspaceId::new(),
            workspace: workspace.into(),
            instruction_profile_digest: Some(profile.instruction_profile_sha256.clone()),
            profile,
            extra: Default::default(),
        };
        writer
            .append_payload(RecordPayload::SessionCreated(payload))
            .map_err(map_journal_error)?;
        let recovery = recover(&path, session_id).map_err(|_| SessionError::Recovery)?;
        Ok(OpenedSession {
            session_id,
            path,
            projection: recovery.projection.clone(),
            recovery,
            writer: Some(writer),
        })
    }

    pub fn create_session(
        &self,
        workspace: impl Into<String>,
        profile: SessionProfile,
    ) -> Result<OpenedSession, SessionError> {
        self.create(workspace, profile)
    }

    pub fn create_default(
        &self,
        workspace: impl Into<String>,
    ) -> Result<OpenedSession, SessionError> {
        self.create(workspace, SessionProfile::default())
    }

    pub fn open(&self, session_id: SessionId) -> Result<OpenedSession, SessionError> {
        let path = self.session_path(session_id);
        if !path.is_file() {
            return Err(SessionError::InvalidIdentity);
        }
        let recovery = recover(&path, session_id).map_err(|error| match error {
            RecoveryError::Unavailable => SessionError::Unavailable,
            _ => SessionError::Recovery,
        })?;
        let writer = if recovery.read_only {
            None
        } else {
            Some(Arc::new(
                JournalWriter::open(&path, session_id).map_err(map_journal_error)?,
            ))
        };
        Ok(OpenedSession {
            session_id,
            path,
            projection: recovery.projection.clone(),
            recovery,
            writer,
        })
    }

    pub fn open_session(&self, session_id: SessionId) -> Result<OpenedSession, SessionError> {
        self.open(session_id)
    }

    pub fn list(&self) -> Result<Vec<SessionSummary>, SessionError> {
        let mut summaries = Vec::new();
        for entry in
            fs::read_dir(self.root.join("sessions")).map_err(|_| SessionError::Unavailable)?
        {
            let entry = entry.map_err(|_| SessionError::Unavailable)?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("jsonl") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            let Ok(session_id) = stem.parse() else {
                continue;
            };
            let result = recover(&path, session_id);
            match result {
                Ok(recovery) => summaries.push(SessionSummary {
                    session_id,
                    path,
                    workspace: recovery.projection.workspace,
                    read_only: recovery.read_only,
                }),
                Err(_) => summaries.push(SessionSummary {
                    session_id,
                    path,
                    workspace: None,
                    read_only: true,
                }),
            }
            if summaries.len() >= 1024 {
                break;
            }
        }
        summaries.sort_by_key(|summary| summary.session_id);
        Ok(summaries)
    }

    pub fn session_path(&self, session_id: SessionId) -> PathBuf {
        self.root
            .join("sessions")
            .join(format!("{session_id}.jsonl"))
    }
}

fn map_journal_error(error: JournalError) -> SessionError {
    match error {
        JournalError::Unavailable => SessionError::Unavailable,
        JournalError::ReadOnly => SessionError::ReadOnly,
        _ => SessionError::Journal,
    }
}

fn set_private(path: &Path) -> Result<(), SessionError> {
    let mut permissions = fs::metadata(path)
        .map_err(|_| SessionError::Unavailable)?
        .permissions();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        permissions.set_mode(if path.is_dir() { 0o700 } else { 0o600 });
    }
    fs::set_permissions(path, permissions).map_err(|_| SessionError::Unavailable)
}
