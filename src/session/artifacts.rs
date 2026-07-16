//! Durable per-session artifact files.

use std::fs::{self, File, OpenOptions};
use std::io::{Read as _, Write as _};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use sha2::{Digest as _, Sha256};
use uuid::Uuid;

use crate::agent::types::{ArtifactId, SessionId};
use crate::tools::ArtifactWriter;
use crate::tools::output::{ArtifactCommit, ArtifactPurpose, ArtifactRequest};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ArtifactLimits {
    pub maximum_artifact_bytes: usize,
    pub maximum_session_bytes: usize,
    pub maximum_global_bytes: usize,
}

impl Default for ArtifactLimits {
    fn default() -> Self {
        Self {
            maximum_artifact_bytes: 1024 * 1024,
            maximum_session_bytes: 16 * 1024 * 1024,
            maximum_global_bytes: 128 * 1024 * 1024,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum ArtifactError {
    #[error("artifact store is unavailable")]
    Unavailable,
    #[error("artifact exceeds its bound")]
    LimitExceeded,
    #[error("artifact is not available")]
    Missing,
    #[error("artifact is malformed")]
    Corrupt,
    #[error("artifact commit failed")]
    CommitFailed,
}

#[derive(Default)]
struct ArtifactState {
    session_bytes: usize,
    global_bytes: usize,
}

/// A user-only, atomic artifact store.  Each instance owns one session's accounting; global
/// accounting is initialized from existing committed files so reopening a session cannot bypass
/// the configured cap.
pub struct PersistentArtifactStore {
    root: PathBuf,
    limits: ArtifactLimits,
    session_id: Option<SessionId>,
    state: Mutex<ArtifactState>,
}

pub type ArtifactStore = PersistentArtifactStore;

impl PersistentArtifactStore {
    pub fn new(root: impl AsRef<Path>, limits: ArtifactLimits) -> Result<Self, ArtifactError> {
        Self::new_for_session(root, None, limits)
    }

    pub fn new_for_session(
        root: impl AsRef<Path>,
        session_id: Option<SessionId>,
        limits: ArtifactLimits,
    ) -> Result<Self, ArtifactError> {
        if limits.maximum_artifact_bytes == 0
            || limits.maximum_session_bytes == 0
            || limits.maximum_global_bytes == 0
        {
            return Err(ArtifactError::LimitExceeded);
        }
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(&root).map_err(|_| ArtifactError::Unavailable)?;
        set_private(&root)?;
        let mut session_bytes = 0usize;
        let mut global_bytes = 0usize;
        let session_prefix = session_id.map(|id| format!("{id}-"));
        for entry in fs::read_dir(&root).map_err(|_| ArtifactError::Unavailable)? {
            let entry = entry.map_err(|_| ArtifactError::Unavailable)?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if !name.ends_with(".artifact") {
                continue;
            }
            let size = entry
                .metadata()
                .map_err(|_| ArtifactError::Unavailable)?
                .len();
            let size = usize::try_from(size).map_err(|_| ArtifactError::LimitExceeded)?;
            global_bytes = global_bytes
                .checked_add(size)
                .ok_or(ArtifactError::LimitExceeded)?;
            if session_prefix
                .as_ref()
                .is_none_or(|prefix| name.starts_with(prefix))
            {
                session_bytes = session_bytes
                    .checked_add(size)
                    .ok_or(ArtifactError::LimitExceeded)?;
            }
        }
        Ok(Self {
            root,
            limits,
            session_id,
            state: Mutex::new(ArtifactState {
                session_bytes,
                global_bytes,
            }),
        })
    }

    pub fn for_session(
        root: impl AsRef<Path>,
        session_id: SessionId,
        limits: ArtifactLimits,
    ) -> Result<Self, ArtifactError> {
        Self::new_for_session(root, Some(session_id), limits)
    }

    pub fn open(
        root: impl AsRef<Path>,
        session_id: SessionId,
        limits: ArtifactLimits,
    ) -> Result<Self, ArtifactError> {
        Self::for_session(root, session_id, limits)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn limits(&self) -> ArtifactLimits {
        self.limits
    }

    pub fn artifact_path(&self, id: ArtifactId) -> PathBuf {
        let name = self.session_id.map_or_else(
            || format!("{id}.artifact"),
            |session| format!("{session}-{id}.artifact"),
        );
        self.root.join(name)
    }

    pub fn read(&self, id: ArtifactId) -> Result<Vec<u8>, ArtifactError> {
        let mut file = File::open(self.artifact_path(id)).map_err(|_| ArtifactError::Missing)?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|_| ArtifactError::Unavailable)?;
        Ok(bytes)
    }

    pub fn session_id(&self) -> Option<SessionId> {
        self.session_id
    }

    pub fn total_bytes(&self) -> Result<usize, ArtifactError> {
        self.state
            .lock()
            .map(|state| state.session_bytes)
            .map_err(|_| ArtifactError::Unavailable)
    }

    pub fn global_bytes(&self) -> Result<usize, ArtifactError> {
        self.state
            .lock()
            .map(|state| state.global_bytes)
            .map_err(|_| ArtifactError::Unavailable)
    }

    pub fn write_artifact(
        &self,
        request: ArtifactRequest,
    ) -> Result<ArtifactCommit, ArtifactError> {
        if request.maximum_bytes == 0 {
            return Err(ArtifactError::LimitExceeded);
        }
        let maximum = request
            .maximum_bytes
            .min(self.limits.maximum_artifact_bytes);
        let truncated = request.bytes.len() > maximum;
        if truncated
            && (request.all_or_nothing
                || matches!(request.purpose, ArtifactPurpose::MutationRecovery))
        {
            return Err(ArtifactError::LimitExceeded);
        }
        let bytes = if truncated {
            &request.bytes[..maximum]
        } else {
            request.bytes.as_slice()
        };
        let mut state = self.state.lock().map_err(|_| ArtifactError::Unavailable)?;
        let (session_bytes, global_bytes) = self.scan_accounting()?;
        state.session_bytes = session_bytes;
        state.global_bytes = global_bytes;
        let next_session = state
            .session_bytes
            .checked_add(bytes.len())
            .ok_or(ArtifactError::LimitExceeded)?;
        let next_global = state
            .global_bytes
            .checked_add(bytes.len())
            .ok_or(ArtifactError::LimitExceeded)?;
        if next_session > self.limits.maximum_session_bytes
            || next_global > self.limits.maximum_global_bytes
        {
            return Err(ArtifactError::LimitExceeded);
        }

        let id = ArtifactId::new();
        let destination = self.artifact_path(id);
        let temporary = self.root.join(format!(".{}.tmp", Uuid::new_v4()));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| ArtifactError::CommitFailed)?;
        set_private(&temporary)?;
        if file.write_all(bytes).is_err() || file.sync_all().is_err() {
            return Err(ArtifactError::CommitFailed);
        }
        drop(file);
        if fs::rename(&temporary, &destination).is_err() {
            return Err(ArtifactError::CommitFailed);
        }
        set_private(&destination)?;
        sync_directory(&self.root)?;
        let digest = format!("{:x}", Sha256::digest(bytes));
        state.session_bytes = next_session;
        state.global_bytes = next_global;
        Ok(ArtifactCommit {
            artifact_id: id,
            byte_count: bytes.len(),
            sha256: digest,
            truncated,
        })
    }

    fn scan_accounting(&self) -> Result<(usize, usize), ArtifactError> {
        let prefix = self.session_id.map(|id| format!("{id}-"));
        let mut session = 0usize;
        let mut global = 0usize;
        for entry in fs::read_dir(&self.root).map_err(|_| ArtifactError::Unavailable)? {
            let entry = entry.map_err(|_| ArtifactError::Unavailable)?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if !name.ends_with(".artifact") {
                continue;
            }
            let size = usize::try_from(
                entry
                    .metadata()
                    .map_err(|_| ArtifactError::Unavailable)?
                    .len(),
            )
            .map_err(|_| ArtifactError::LimitExceeded)?;
            global = global
                .checked_add(size)
                .ok_or(ArtifactError::LimitExceeded)?;
            if prefix
                .as_ref()
                .is_none_or(|prefix| name.starts_with(prefix))
            {
                session = session
                    .checked_add(size)
                    .ok_or(ArtifactError::LimitExceeded)?;
            }
        }
        Ok((session, global))
    }
}

impl ArtifactWriter for PersistentArtifactStore {
    fn write(&self, request: ArtifactRequest) -> Result<ArtifactCommit, &'static str> {
        self.write_artifact(request).map_err(|error| match error {
            ArtifactError::LimitExceeded => "artifact limit reached",
            ArtifactError::Missing => "artifact missing",
            ArtifactError::Unavailable => "artifact store unavailable",
            ArtifactError::Corrupt => "artifact corrupt",
            ArtifactError::CommitFailed => "artifact commit failed",
        })
    }
}

fn set_private(path: &Path) -> Result<(), ArtifactError> {
    let mut permissions = fs::metadata(path)
        .map_err(|_| ArtifactError::Unavailable)?
        .permissions();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        let mode = if path.is_dir() { 0o700 } else { 0o600 };
        permissions.set_mode(mode);
    }
    fs::set_permissions(path, permissions).map_err(|_| ArtifactError::Unavailable)
}

fn sync_directory(path: &Path) -> Result<(), ArtifactError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| ArtifactError::CommitFailed)
}
