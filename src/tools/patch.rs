use std::collections::HashSet;
use std::ffi::{CStr, CString};
use std::fs::File;
use std::io::{Read as _, Write as _};
use std::process::Command;

#[cfg(unix)]
use std::os::fd::{AsRawFd as _, FromRawFd as _};
#[cfg(target_os = "macos")]
use std::os::macos::fs::MetadataExt as _;
#[cfg(unix)]
use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};

use sha2::{Digest as _, Sha256};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::agent::types::{ToolCallId, TurnId};

use super::ArtifactWriter;
use super::output::{ArtifactCommit, ArtifactPurpose, ArtifactRequest, bounded_head_tail};
use super::workspace::{Workspace, WorkspaceError};

pub const MAXIMUM_PATCH_BYTES: usize = 256 * 1024;
pub const MAXIMUM_PATCH_FILES: usize = 32;
pub const MAXIMUM_TOTAL_PATH_BYTES: usize = 16 * 1024;
pub const MAXIMUM_HUNKS_PER_FILE: usize = 128;
pub const MAXIMUM_RECOVERY_ARTIFACT_BYTES: usize = 1024 * 1024;
pub const MAXIMUM_RECOVERY_ENVELOPE_BYTES: usize = MAXIMUM_RECOVERY_ARTIFACT_BYTES + 8 * 1024;
pub const MAXIMUM_RECOVERY_TOTAL_BYTES: usize = 4 * 1024 * 1024;
pub const MAXIMUM_DIFF_PREVIEW_BYTES: usize = 64 * 1024;

#[derive(Clone)]
pub struct PatchPlan {
    pub effect_digest: String,
    pub summary: String,
    operations: Vec<PlannedOperation>,
    workspace: Workspace,
}

impl std::fmt::Debug for PatchPlan {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PatchPlan")
            .field("effect_digest", &self.effect_digest)
            .field("operation_count", &self.operations.len())
            .finish()
    }
}

#[derive(Clone)]
struct PlannedOperation {
    kind: OperationKind,
    display: String,
    before: Option<Vec<u8>>,
    before_digest: Option<String>,
    before_identity: Option<FileIdentity>,
    after: Option<Vec<u8>>,
    mode: u32,
    owner: (u32, u32),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OperationKind {
    Add,
    Update,
    Delete,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectOperation {
    Add,
    Update,
    Delete,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectDirection {
    Forward,
    Rollback,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectProgress {
    pub index: usize,
    pub path: String,
    pub digest: String,
    pub direction: EffectDirection,
    pub operation: EffectOperation,
    pub recovery_artifact: Option<crate::agent::types::ArtifactId>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct FileIdentity {
    device: u64,
    inode: u64,
    length: u64,
    modified_seconds: i64,
    modified_nanoseconds: i64,
    mode: u32,
    uid: u32,
    gid: u32,
    flags: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct PatchResult {
    pub status: &'static str,
    pub effect_digest: String,
    pub completed_paths: Vec<String>,
    pub rolled_back_paths: Vec<String>,
    pub uncertain_paths: Vec<String>,
    pub recovery_artifacts: Vec<RecoveryReference>,
    pub paths: Vec<PatchPathResult>,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct RecoveryReference {
    pub path: String,
    pub operation: EffectOperation,
    pub artifact: ArtifactCommit,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct PatchPathResult {
    pub path: String,
    pub operation: EffectOperation,
    pub state: &'static str,
}

impl PatchResult {
    pub fn model_content(&self) -> Result<String, PatchError> {
        serde_json::to_string(self).map_err(|_| PatchError::Internal)
    }
}

pub trait EffectRecorder: Send + Sync {
    fn started(&self, progress: &EffectProgress) -> Result<(), &'static str>;
    fn completed(&self, progress: &EffectProgress) -> Result<(), &'static str>;
}

#[derive(Default)]
pub struct MemoryEffectRecorder;

impl EffectRecorder for MemoryEffectRecorder {
    fn started(&self, _: &EffectProgress) -> Result<(), &'static str> {
        Ok(())
    }

    fn completed(&self, _: &EffectProgress) -> Result<(), &'static str> {
        Ok(())
    }
}

pub trait Trash: Send + Sync {
    fn move_to_trash(&self, parent: &File, name: &CStr) -> Result<(), PatchError>;
}

pub struct MacTrash;

impl Trash for MacTrash {
    fn move_to_trash(&self, parent: &File, name: &CStr) -> Result<(), PatchError> {
        #[cfg(target_os = "macos")]
        {
            use std::os::unix::ffi::OsStrExt as _;

            let mut buffer = [0_u8; libc::PATH_MAX as usize];
            // SAFETY: F_GETPATH writes a NUL-terminated path into the fixed-size buffer for the
            // live directory descriptor. The entry has already been moved to an unguessable
            // quarantine name relative to this descriptor before a mutating Trash handoff.
            if unsafe {
                libc::fcntl(
                    parent.as_raw_fd(),
                    libc::F_GETPATH,
                    buffer.as_mut_ptr().cast::<libc::c_char>(),
                )
            } < 0
            {
                return Err(PatchError::CommitFailed);
            }
            let length = buffer
                .iter()
                .position(|byte| *byte == 0)
                .ok_or(PatchError::CommitFailed)?;
            let directory = std::ffi::OsStr::from_bytes(&buffer[..length]);
            let path =
                std::path::Path::new(directory).join(std::ffi::OsStr::from_bytes(name.to_bytes()));
            let status = Command::new("/usr/bin/trash")
                .arg(&path)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
            let status = status.map_err(|_| PatchError::CommitFailed)?;
            if status.success() {
                Ok(())
            } else {
                Err(PatchError::CommitFailed)
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (parent, name);
            Err(PatchError::TrashUnavailable)
        }
    }
}

pub fn prepare(workspace: &Workspace, patch: &str) -> Result<PatchPlan, PatchError> {
    if patch.is_empty() || patch.len() > MAXIMUM_PATCH_BYTES {
        return Err(PatchError::LimitExceeded);
    }
    let parsed = parse(patch)?;
    if parsed.len() > MAXIMUM_PATCH_FILES {
        return Err(PatchError::LimitExceeded);
    }
    let mut seen = HashSet::new();
    let mut operations = Vec::with_capacity(parsed.len());
    let mut recovery_total = 0_usize;
    let mut additions = 0_usize;
    let mut deletions = 0_usize;
    let mut total_path_bytes = 0_usize;
    for operation in parsed {
        let display_path = operation.path().to_owned();
        total_path_bytes = total_path_bytes
            .checked_add(display_path.len())
            .ok_or(PatchError::LimitExceeded)?;
        if total_path_bytes > MAXIMUM_TOTAL_PATH_BYTES {
            return Err(PatchError::LimitExceeded);
        }
        if !seen.insert(display_path.clone()) {
            return Err(PatchError::DuplicateOperation);
        }
        let planned = match operation {
            ParsedOperation::Add { path, lines } => {
                let resolved = workspace
                    .resolve_for_create(&path)
                    .map_err(PatchError::Workspace)?;
                let after = if lines.is_empty() {
                    Vec::new()
                } else {
                    format!("{}\n", lines.join("\n")).into_bytes()
                };
                additions = additions.saturating_add(lines.len());
                PlannedOperation {
                    kind: OperationKind::Add,
                    display: resolved.display,
                    before: None,
                    before_digest: None,
                    before_identity: None,
                    after: Some(after),
                    mode: 0o600,
                    owner: current_owner(),
                }
            }
            ParsedOperation::Update { path, hunks } => {
                if hunks.is_empty() || hunks.len() > MAXIMUM_HUNKS_PER_FILE {
                    return Err(PatchError::LimitExceeded);
                }
                let (resolved, source) =
                    workspace.open_file(&path).map_err(PatchError::Workspace)?;
                let (before, metadata, identity) = read_source(source)?;
                validate_recovery_capacity(&before, &resolved.display, &mut recovery_total)?;
                let (logical, ending, final_newline) = decode_source(&before)?;
                let (updated, added, removed) = apply_hunks(logical, &hunks)?;
                if added + removed == 0 {
                    return Err(PatchError::Invalid);
                }
                additions = additions.saturating_add(added);
                deletions = deletions.saturating_add(removed);
                let after = encode_source(&updated, ending, final_newline);
                if after == before {
                    return Err(PatchError::Invalid);
                }
                PlannedOperation {
                    kind: OperationKind::Update,
                    display: resolved.display,
                    before_digest: Some(digest(&before)),
                    before_identity: Some(identity),
                    before: Some(before),
                    after: Some(after),
                    mode: mode(&metadata),
                    owner: owner(&metadata),
                }
            }
            ParsedOperation::Delete { path } => {
                let (resolved, source) =
                    workspace.open_file(&path).map_err(PatchError::Workspace)?;
                let (before, metadata, identity) = read_source(source)?;
                validate_recovery_capacity(&before, &resolved.display, &mut recovery_total)?;
                deletions = deletions.saturating_add(logical_line_count(&before));
                PlannedOperation {
                    kind: OperationKind::Delete,
                    display: resolved.display,
                    before_digest: Some(digest(&before)),
                    before_identity: Some(identity),
                    before: Some(before),
                    after: None,
                    mode: mode(&metadata),
                    owner: owner(&metadata),
                }
            }
        };
        operations.push(planned);
    }
    let mut effect_hasher = Sha256::new();
    effect_hasher.update(patch.as_bytes());
    for operation in &operations {
        effect_hasher.update([operation.kind as u8]);
        effect_hasher.update(operation.display.as_bytes());
        if let Some(before) = &operation.before_digest {
            effect_hasher.update(before.as_bytes());
        }
        if let Some(after) = &operation.after {
            effect_hasher.update(Sha256::digest(after));
        }
    }
    let effect_digest = format!("{:x}", effect_hasher.finalize());
    let mut paths: Vec<&str> = operations
        .iter()
        .map(|operation| operation.display.as_str())
        .collect();
    paths.sort_unstable();
    let (preview, truncation) = bounded_head_tail(patch.as_bytes(), MAXIMUM_DIFF_PREVIEW_BYTES);
    let preview = String::from_utf8(preview).map_err(|_| PatchError::Invalid)?;
    let omitted = truncation
        .and_then(|truncation| truncation.omitted_bytes)
        .unwrap_or(0);
    let summary = format!(
        "Apply patch effect {effect_digest} to {} file(s): {} (+{additions}/-{deletions}). Deletions use recoverable Trash. Recovery artifacts are required before mutation. Exact patch preview retains {} of {} bytes; {omitted} bytes omitted:\n{preview}",
        operations.len(),
        paths.join(", "),
        preview.len(),
        patch.len(),
    );
    Ok(PatchPlan {
        effect_digest,
        summary,
        operations,
        workspace: workspace.clone(),
    })
}

#[allow(clippy::too_many_arguments)]
pub fn execute(
    plan: &PatchPlan,
    turn_id: TurnId,
    tool_call_id: ToolCallId,
    artifacts: &dyn ArtifactWriter,
    effects: &dyn EffectRecorder,
    trash: &dyn Trash,
    cancellation: &CancellationToken,
) -> Result<PatchResult, PatchError> {
    if cancellation.is_cancelled() {
        return Err(PatchError::Cancelled);
    }
    let mut recovery_artifacts = Vec::new();
    for operation in &plan.operations {
        if cancellation.is_cancelled() {
            return Err(PatchError::Cancelled);
        }
        if let Some(before) = &operation.before {
            let envelope = recovery_envelope(operation, before);
            let commit = artifacts
                .write(ArtifactRequest {
                    turn_id,
                    tool_call_id,
                    bytes: envelope.clone(),
                    classification: "workspace-file",
                    purpose: ArtifactPurpose::MutationRecovery,
                    all_or_nothing: true,
                    maximum_bytes: MAXIMUM_RECOVERY_ENVELOPE_BYTES,
                })
                .map_err(|_| PatchError::RecoveryUnavailable)?;
            if commit.truncated
                || commit.byte_count != envelope.len()
                || commit.sha256 != digest(&envelope)
            {
                return Err(PatchError::RecoveryUnavailable);
            }
            recovery_artifacts.push(RecoveryReference {
                path: operation.display.clone(),
                operation: effect_operation(operation.kind),
                artifact: commit,
            });
        }
    }
    if cancellation.is_cancelled() {
        return Err(PatchError::Cancelled);
    }

    let mut completed = Vec::new();
    for (index, operation) in plan.operations.iter().enumerate() {
        if cancellation.is_cancelled() {
            return Ok(rollback(
                plan,
                &completed,
                Vec::new(),
                effects,
                trash,
                &recovery_artifacts,
                "cancelled_rolled_back",
            ));
        }
        let progress = effect_progress(
            index,
            operation,
            &plan.effect_digest,
            EffectDirection::Forward,
            &recovery_artifacts,
        );
        if verify_stale(&plan.workspace, operation).is_err() || effects.started(&progress).is_err()
        {
            return Ok(rollback(
                plan,
                &completed,
                Vec::new(),
                effects,
                trash,
                &recovery_artifacts,
                "failed_rolled_back",
            ));
        }
        let commit = commit(&plan.workspace, operation, trash);
        if let Err(error) = commit {
            let uncertain = if error == PatchError::OutcomeUncertain {
                vec![operation.display.clone()]
            } else {
                Vec::new()
            };
            return Ok(rollback(
                plan,
                &completed,
                uncertain,
                effects,
                trash,
                &recovery_artifacts,
                "failed_rolled_back",
            ));
        }
        if effects.completed(&progress).is_err() {
            completed.push(index);
            return Ok(rollback(
                plan,
                &completed,
                Vec::new(),
                effects,
                trash,
                &recovery_artifacts,
                "failed_rolled_back",
            ));
        }
        completed.push(index);
        if cancellation.is_cancelled() {
            return Ok(rollback(
                plan,
                &completed,
                Vec::new(),
                effects,
                trash,
                &recovery_artifacts,
                "cancelled_rolled_back",
            ));
        }
    }
    let completed_paths = plan
        .operations
        .iter()
        .map(|operation| operation.display.clone())
        .collect::<Vec<_>>();
    Ok(PatchResult {
        status: "completed",
        effect_digest: plan.effect_digest.clone(),
        completed_paths,
        rolled_back_paths: Vec::new(),
        uncertain_paths: Vec::new(),
        recovery_artifacts,
        paths: plan
            .operations
            .iter()
            .map(|operation| PatchPathResult {
                path: operation.display.clone(),
                operation: effect_operation(operation.kind),
                state: "completed",
            })
            .collect(),
    })
}

fn rollback(
    plan: &PatchPlan,
    completed: &[usize],
    mut uncertain: Vec<String>,
    effects: &dyn EffectRecorder,
    trash: &dyn Trash,
    recovery_artifacts: &[RecoveryReference],
    rolled_back_status: &'static str,
) -> PatchResult {
    let mut rolled_back = Vec::new();
    for index in completed.iter().rev().copied() {
        let operation = &plan.operations[index];
        let rollback_index = plan.operations.len() + (plan.operations.len() - index);
        let progress = effect_progress(
            rollback_index,
            operation,
            &plan.effect_digest,
            EffectDirection::Rollback,
            recovery_artifacts,
        );
        if effects.started(&progress).is_err()
            || rollback_operation(&plan.workspace, operation, trash).is_err()
            || effects.completed(&progress).is_err()
        {
            uncertain.push(operation.display.clone());
        } else {
            rolled_back.push(operation.display.clone());
        }
    }
    let paths = plan
        .operations
        .iter()
        .enumerate()
        .map(|(index, operation)| PatchPathResult {
            path: operation.display.clone(),
            operation: effect_operation(operation.kind),
            state: if uncertain.iter().any(|path| path == &operation.display) {
                "uncertain"
            } else if rolled_back.iter().any(|path| path == &operation.display) {
                "rolled_back"
            } else if completed.contains(&index) {
                "forward_effect_recorded"
            } else {
                "not_started"
            },
        })
        .collect();
    PatchResult {
        status: if uncertain.is_empty() {
            rolled_back_status
        } else {
            "uncertain"
        },
        effect_digest: plan.effect_digest.clone(),
        completed_paths: Vec::new(),
        rolled_back_paths: rolled_back,
        uncertain_paths: uncertain,
        recovery_artifacts: recovery_artifacts.to_vec(),
        paths,
    }
}

fn effect_operation(kind: OperationKind) -> EffectOperation {
    match kind {
        OperationKind::Add => EffectOperation::Add,
        OperationKind::Update => EffectOperation::Update,
        OperationKind::Delete => EffectOperation::Delete,
    }
}

fn effect_progress(
    index: usize,
    operation: &PlannedOperation,
    digest: &str,
    direction: EffectDirection,
    recovery: &[RecoveryReference],
) -> EffectProgress {
    EffectProgress {
        index,
        path: operation.display.clone(),
        digest: digest.to_owned(),
        direction,
        operation: effect_operation(operation.kind),
        recovery_artifact: recovery
            .iter()
            .find(|reference| reference.path == operation.display)
            .map(|reference| reference.artifact.artifact_id),
    }
}

fn commit(
    workspace: &Workspace,
    operation: &PlannedOperation,
    trash: &dyn Trash,
) -> Result<(), PatchError> {
    atomic_mutation(
        workspace,
        operation,
        operation.before.as_deref(),
        operation.after.as_deref(),
        operation.before_identity,
        trash,
    )
}

fn rollback_operation(
    workspace: &Workspace,
    operation: &PlannedOperation,
    trash: &dyn Trash,
) -> Result<(), PatchError> {
    match operation.kind {
        OperationKind::Add => atomic_mutation(
            workspace,
            operation,
            operation.after.as_deref(),
            None,
            None,
            trash,
        ),
        OperationKind::Update => atomic_mutation(
            workspace,
            operation,
            operation.after.as_deref(),
            operation.before.as_deref(),
            None,
            trash,
        ),
        OperationKind::Delete => atomic_mutation(
            workspace,
            operation,
            None,
            operation.before.as_deref(),
            None,
            trash,
        ),
    }
}

fn verify_stale(workspace: &Workspace, operation: &PlannedOperation) -> Result<(), PatchError> {
    match operation.kind {
        OperationKind::Add => {
            let target = workspace
                .open_parent(&operation.display)
                .map_err(PatchError::Workspace)?;
            if entry_exists(&target.parent, &target.name)? {
                return Err(PatchError::Stale);
            }
        }
        OperationKind::Update | OperationKind::Delete => {
            let (_, source) = workspace
                .open_file(&operation.display)
                .map_err(PatchError::Workspace)?;
            let (bytes, _, identity) = read_source(source)?;
            if Some(identity) != operation.before_identity
                || operation.before_digest.as_deref() != Some(digest(&bytes).as_str())
            {
                return Err(PatchError::Stale);
            }
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn atomic_mutation(
    workspace: &Workspace,
    operation: &PlannedOperation,
    expected: Option<&[u8]>,
    desired: Option<&[u8]>,
    expected_identity: Option<FileIdentity>,
    trash: &dyn Trash,
) -> Result<(), PatchError> {
    let target = workspace
        .open_parent(&operation.display)
        .map_err(PatchError::Workspace)?;
    match (expected, desired) {
        (None, Some(bytes)) => {
            let temporary = create_temporary(&target.parent, bytes, operation, trash)?;
            if rename_exclusive(&target.parent, &temporary, &target.name).is_err() {
                return if trash.move_to_trash(&target.parent, &temporary).is_ok() {
                    Err(PatchError::Stale)
                } else {
                    Err(PatchError::OutcomeUncertain)
                };
            }
        }
        (Some(expected), Some(bytes)) => {
            let temporary = create_temporary(&target.parent, bytes, operation, trash)?;
            if rename_swap(&target.parent, &temporary, &target.name).is_err() {
                return if trash.move_to_trash(&target.parent, &temporary).is_ok() {
                    Err(PatchError::Stale)
                } else {
                    Err(PatchError::OutcomeUncertain)
                };
            }
            let matches = entry_matches(&target.parent, &temporary, expected, expected_identity)
                .unwrap_or(false);
            if !matches {
                if rename_swap(&target.parent, &temporary, &target.name).is_err() {
                    return Err(PatchError::OutcomeUncertain);
                }
                return if trash.move_to_trash(&target.parent, &temporary).is_ok() {
                    Err(PatchError::Stale)
                } else {
                    Err(PatchError::OutcomeUncertain)
                };
            }
            if trash.move_to_trash(&target.parent, &temporary).is_err() {
                if rename_swap(&target.parent, &temporary, &target.name).is_err() {
                    return Err(PatchError::OutcomeUncertain);
                }
                return if trash.move_to_trash(&target.parent, &temporary).is_ok() {
                    Err(PatchError::CommitFailed)
                } else {
                    Err(PatchError::OutcomeUncertain)
                };
            }
        }
        (Some(expected), None) => {
            let quarantine =
                temporary_name(target.name.to_str().map_err(|_| PatchError::CommitFailed)?)?;
            rename_exclusive_from(&target.parent, &target.name, &target.parent, &quarantine)?;
            let matches = entry_matches(&target.parent, &quarantine, expected, expected_identity)
                .unwrap_or(false);
            if !matches {
                if rename_exclusive_from(&target.parent, &quarantine, &target.parent, &target.name)
                    .is_err()
                {
                    return Err(PatchError::OutcomeUncertain);
                }
                return Err(PatchError::Stale);
            }
            if trash.move_to_trash(&target.parent, &quarantine).is_err() {
                if rename_exclusive_from(&target.parent, &quarantine, &target.parent, &target.name)
                    .is_err()
                {
                    return Err(PatchError::OutcomeUncertain);
                }
                return Err(PatchError::CommitFailed);
            }
        }
        (None, None) => return Err(PatchError::Internal),
    }
    target
        .parent
        .sync_all()
        .map_err(|_| PatchError::OutcomeUncertain)
}

fn create_temporary(
    parent: &File,
    bytes: &[u8],
    operation: &PlannedOperation,
    trash: &dyn Trash,
) -> Result<CString, PatchError> {
    let name = temporary_name(&operation.display)?;
    let flags = libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_NOFOLLOW | libc::O_CLOEXEC;
    // SAFETY: `parent` is live and `name` is NUL-terminated.
    let descriptor = unsafe { libc::openat(parent.as_raw_fd(), name.as_ptr(), flags, 0o600) };
    if descriptor < 0 {
        return Err(PatchError::CommitFailed);
    }
    // SAFETY: openat returned an owned descriptor.
    let mut file = unsafe { File::from_raw_fd(descriptor) };
    let outcome = (|| {
        file.write_all(bytes)
            .map_err(|_| PatchError::CommitFailed)?;
        // SAFETY: the file descriptor is live and values came from source metadata/current user.
        if unsafe { libc::fchown(file.as_raw_fd(), operation.owner.0, operation.owner.1) } != 0
            || unsafe { libc::fchmod(file.as_raw_fd(), operation.mode as libc::mode_t) } != 0
        {
            return Err(PatchError::CommitFailed);
        }
        file.sync_all().map_err(|_| PatchError::CommitFailed)
    })();
    drop(file);
    if let Err(error) = outcome {
        return if trash.move_to_trash(parent, &name).is_ok() {
            Err(error)
        } else {
            Err(PatchError::OutcomeUncertain)
        };
    }
    Ok(name)
}

fn temporary_name(_: impl AsRef<str>) -> Result<CString, PatchError> {
    CString::new(format!(".pho-{}.tmp", Uuid::new_v4())).map_err(|_| PatchError::CommitFailed)
}

fn entry_exists(parent: &File, name: &CStr) -> Result<bool, PatchError> {
    let mut metadata = std::mem::MaybeUninit::<libc::stat>::uninit();
    // SAFETY: output points to valid storage and `name` is NUL-terminated.
    let result = unsafe {
        libc::fstatat(
            parent.as_raw_fd(),
            name.as_ptr(),
            metadata.as_mut_ptr(),
            libc::AT_SYMLINK_NOFOLLOW,
        )
    };
    if result == 0 {
        Ok(true)
    } else if std::io::Error::last_os_error().raw_os_error() == Some(libc::ENOENT) {
        Ok(false)
    } else {
        Err(PatchError::CommitFailed)
    }
}

fn entry_matches(
    parent: &File,
    name: &CStr,
    expected: &[u8],
    expected_identity: Option<FileIdentity>,
) -> Result<bool, PatchError> {
    let flags = libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC;
    // SAFETY: `parent` is live and `name` is NUL-terminated.
    let descriptor = unsafe { libc::openat(parent.as_raw_fd(), name.as_ptr(), flags) };
    if descriptor < 0 {
        return Ok(false);
    }
    // SAFETY: openat returned an owned descriptor.
    let file = unsafe { File::from_raw_fd(descriptor) };
    let (bytes, _, identity) = read_source(file)?;
    Ok(bytes == expected && expected_identity.is_none_or(|expected| expected == identity))
}

#[cfg(target_os = "macos")]
fn rename_swap(parent: &File, left: &CStr, right: &CStr) -> Result<(), PatchError> {
    // SAFETY: both names are NUL-terminated and resolved relative to the live directory.
    let result = unsafe {
        libc::renameatx_np(
            parent.as_raw_fd(),
            left.as_ptr(),
            parent.as_raw_fd(),
            right.as_ptr(),
            libc::RENAME_SWAP,
        )
    };
    (result == 0).then_some(()).ok_or(PatchError::CommitFailed)
}

#[cfg(not(target_os = "macos"))]
fn rename_swap(_: &File, _: &CStr, _: &CStr) -> Result<(), PatchError> {
    Err(PatchError::CommitFailed)
}

fn rename_exclusive(parent: &File, from: &CStr, to: &CStr) -> Result<(), PatchError> {
    rename_exclusive_from(parent, from, parent, to)
}

#[cfg(target_os = "macos")]
fn rename_exclusive_from(
    from_parent: &File,
    from: &CStr,
    to_parent: &File,
    to: &CStr,
) -> Result<(), PatchError> {
    // SAFETY: both names are NUL-terminated and both directory descriptors are live.
    let result = unsafe {
        libc::renameatx_np(
            from_parent.as_raw_fd(),
            from.as_ptr(),
            to_parent.as_raw_fd(),
            to.as_ptr(),
            libc::RENAME_EXCL,
        )
    };
    (result == 0).then_some(()).ok_or(PatchError::CommitFailed)
}

#[cfg(not(target_os = "macos"))]
fn rename_exclusive_from(_: &File, _: &CStr, _: &File, _: &CStr) -> Result<(), PatchError> {
    Err(PatchError::CommitFailed)
}

fn recovery_envelope(operation: &PlannedOperation, bytes: &[u8]) -> Vec<u8> {
    let mut envelope = b"PHO4REC\0".to_vec();
    envelope.extend_from_slice(&(operation.display.len() as u32).to_le_bytes());
    envelope.extend_from_slice(operation.display.as_bytes());
    envelope.extend_from_slice(digest(bytes).as_bytes());
    envelope.extend_from_slice(&operation.mode.to_le_bytes());
    envelope.extend_from_slice(&operation.owner.0.to_le_bytes());
    envelope.extend_from_slice(&operation.owner.1.to_le_bytes());
    envelope.extend_from_slice(bytes);
    envelope
}

fn read_source(mut file: File) -> Result<(Vec<u8>, std::fs::Metadata, FileIdentity), PatchError> {
    let metadata = file.metadata().map_err(|_| PatchError::SourceUnavailable)?;
    if !metadata.is_file() {
        return Err(PatchError::UnsupportedMetadata);
    }
    reject_unsupported_metadata(&file, &metadata)?;
    if metadata.len() as usize > MAXIMUM_RECOVERY_ARTIFACT_BYTES {
        return Err(PatchError::LimitExceeded);
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    std::io::Read::by_ref(&mut file)
        .take(MAXIMUM_RECOVERY_ARTIFACT_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| PatchError::SourceUnavailable)?;
    if bytes.len() > MAXIMUM_RECOVERY_ARTIFACT_BYTES {
        return Err(PatchError::LimitExceeded);
    }
    let after = file.metadata().map_err(|_| PatchError::SourceUnavailable)?;
    if file_identity(&after) != file_identity(&metadata) {
        return Err(PatchError::Stale);
    }
    let identity = file_identity(&metadata);
    Ok((bytes, metadata, identity))
}

fn validate_recovery_capacity(
    bytes: &[u8],
    path: &str,
    total: &mut usize,
) -> Result<(), PatchError> {
    if bytes.len() > MAXIMUM_RECOVERY_ARTIFACT_BYTES {
        return Err(PatchError::LimitExceeded);
    }
    let envelope_bytes = 8_usize
        .checked_add(4)
        .and_then(|size| size.checked_add(path.len()))
        .and_then(|size| size.checked_add(64 + 12))
        .and_then(|size| size.checked_add(bytes.len()))
        .ok_or(PatchError::LimitExceeded)?;
    if envelope_bytes > MAXIMUM_RECOVERY_ENVELOPE_BYTES {
        return Err(PatchError::LimitExceeded);
    }
    *total = total
        .checked_add(envelope_bytes)
        .ok_or(PatchError::LimitExceeded)?;
    if *total > MAXIMUM_RECOVERY_TOTAL_BYTES {
        return Err(PatchError::LimitExceeded);
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn reject_unsupported_metadata(
    file: &File,
    metadata: &std::fs::Metadata,
) -> Result<(), PatchError> {
    use std::os::fd::AsRawFd as _;
    if metadata.st_flags() != 0 || metadata.nlink() != 1 {
        return Err(PatchError::UnsupportedMetadata);
    }
    // SAFETY: the descriptor is live and the null buffer requests only the required size.
    let count = unsafe { libc::flistxattr(file.as_raw_fd(), std::ptr::null_mut(), 0, 0) };
    if count < 0 {
        return Err(PatchError::UnsupportedMetadata);
    }
    if count == 0 {
        return Ok(());
    }
    let mut names = vec![0_u8; count as usize];
    // SAFETY: the buffer is valid for `count` bytes and the descriptor remains live.
    let actual =
        unsafe { libc::flistxattr(file.as_raw_fd(), names.as_mut_ptr().cast(), names.len(), 0) };
    if actual != count {
        return Err(PatchError::UnsupportedMetadata);
    }
    let only_system_provenance = names
        .split(|byte| *byte == 0)
        .filter(|name| !name.is_empty())
        .all(|name| name == b"com.apple.provenance");
    if only_system_provenance {
        Ok(())
    } else {
        Err(PatchError::UnsupportedMetadata)
    }
}

#[cfg(not(target_os = "macos"))]
fn reject_unsupported_metadata(_: &File, metadata: &std::fs::Metadata) -> Result<(), PatchError> {
    #[cfg(unix)]
    if metadata.nlink() != 1 {
        return Err(PatchError::UnsupportedMetadata);
    }
    Ok(())
}

#[cfg(unix)]
fn file_identity(metadata: &std::fs::Metadata) -> FileIdentity {
    FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
        length: metadata.len(),
        modified_seconds: metadata.mtime(),
        modified_nanoseconds: metadata.mtime_nsec(),
        mode: metadata.mode(),
        uid: metadata.uid(),
        gid: metadata.gid(),
        flags: metadata_flags(metadata),
    }
}

#[cfg(not(unix))]
fn file_identity(metadata: &std::fs::Metadata) -> FileIdentity {
    FileIdentity {
        device: 0,
        inode: 0,
        length: metadata.len(),
        modified_seconds: 0,
        modified_nanoseconds: 0,
        mode: 0,
        uid: 0,
        gid: 0,
        flags: 0,
    }
}

#[cfg(target_os = "macos")]
fn metadata_flags(metadata: &std::fs::Metadata) -> u32 {
    metadata.st_flags()
}

#[cfg(all(unix, not(target_os = "macos")))]
fn metadata_flags(_: &std::fs::Metadata) -> u32 {
    0
}

#[cfg(unix)]
fn mode(metadata: &std::fs::Metadata) -> u32 {
    metadata.permissions().mode()
}

#[cfg(unix)]
fn owner(metadata: &std::fs::Metadata) -> (u32, u32) {
    (metadata.uid(), metadata.gid())
}

#[cfg(not(unix))]
fn owner(_: &std::fs::Metadata) -> (u32, u32) {
    (0, 0)
}

#[cfg(unix)]
fn current_owner() -> (u32, u32) {
    // SAFETY: these libc calls have no preconditions.
    unsafe { (libc::geteuid(), libc::getegid()) }
}

#[cfg(not(unix))]
fn current_owner() -> (u32, u32) {
    (0, 0)
}

#[cfg(not(unix))]
fn mode(_: &std::fs::Metadata) -> u32 {
    0o600
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn logical_line_count(bytes: &[u8]) -> usize {
    if bytes.is_empty() {
        0
    } else {
        bytes.iter().filter(|byte| **byte == b'\n').count() + usize::from(!bytes.ends_with(b"\n"))
    }
}

#[derive(Clone, Copy)]
enum LineEnding {
    Lf,
    CrLf,
}

fn decode_source(bytes: &[u8]) -> Result<(Vec<String>, LineEnding, bool), PatchError> {
    let text = std::str::from_utf8(bytes).map_err(|_| PatchError::UnsupportedContent)?;
    if text.as_bytes().contains(&0) {
        return Err(PatchError::UnsupportedContent);
    }
    let ending = if text.contains("\r\n") {
        let mut previous = None;
        let mixed_or_lone_cr = text.bytes().any(|byte| {
            let invalid = (byte == b'\n' && previous != Some(b'\r'))
                || (previous == Some(b'\r') && byte != b'\n');
            previous = Some(byte);
            invalid
        });
        if mixed_or_lone_cr || previous == Some(b'\r') {
            return Err(PatchError::UnsupportedContent);
        }
        LineEnding::CrLf
    } else {
        if text.contains('\r') {
            return Err(PatchError::UnsupportedContent);
        }
        LineEnding::Lf
    };
    let final_newline = text.ends_with('\n');
    let normalized = text.replace("\r\n", "\n");
    let mut lines = normalized
        .split('\n')
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if final_newline {
        lines.pop();
    }
    Ok((lines, ending, final_newline))
}

fn encode_source(lines: &[String], ending: LineEnding, final_newline: bool) -> Vec<u8> {
    let separator = match ending {
        LineEnding::Lf => "\n",
        LineEnding::CrLf => "\r\n",
    };
    let mut text = lines.join(separator);
    if final_newline && !lines.is_empty() {
        text.push_str(separator);
    }
    text.into_bytes()
}

fn apply_hunks(
    mut source: Vec<String>,
    hunks: &[Hunk],
) -> Result<(Vec<String>, usize, usize), PatchError> {
    let mut additions = 0;
    let mut deletions = 0;
    let mut replacements = Vec::with_capacity(hunks.len());
    for hunk in hunks {
        let expected = hunk
            .lines
            .iter()
            .filter(|line| !matches!(line, HunkLine::Add(_)))
            .map(HunkLine::text)
            .collect::<Vec<_>>();
        if expected.is_empty() {
            return Err(PatchError::Ambiguous);
        }
        let matches = source
            .windows(expected.len())
            .enumerate()
            .filter(|(_, window)| {
                window
                    .iter()
                    .map(String::as_str)
                    .eq(expected.iter().copied())
            })
            .map(|(index, _)| index)
            .collect::<Vec<_>>();
        if matches.len() != 1 {
            return Err(if matches.is_empty() {
                PatchError::HunkMissing
            } else {
                PatchError::Ambiguous
            });
        }
        let replacement = hunk
            .lines
            .iter()
            .filter(|line| !matches!(line, HunkLine::Remove(_)))
            .map(|line| line.text().to_owned())
            .collect::<Vec<_>>();
        additions += hunk
            .lines
            .iter()
            .filter(|line| matches!(line, HunkLine::Add(_)))
            .count();
        deletions += hunk
            .lines
            .iter()
            .filter(|line| matches!(line, HunkLine::Remove(_)))
            .count();
        let start = matches[0];
        let end = start + expected.len();
        if replacements.iter().any(
            |(other_start, other_end, _): &(usize, usize, Vec<String>)| {
                start < *other_end && *other_start < end
            },
        ) {
            return Err(PatchError::Ambiguous);
        }
        replacements.push((start, end, replacement));
    }
    replacements.sort_unstable_by_key(|replacement| std::cmp::Reverse(replacement.0));
    for (start, end, replacement) in replacements {
        source.splice(start..end, replacement);
    }
    Ok((source, additions, deletions))
}

enum ParsedOperation {
    Add { path: String, lines: Vec<String> },
    Update { path: String, hunks: Vec<Hunk> },
    Delete { path: String },
}

impl ParsedOperation {
    fn path(&self) -> &str {
        match self {
            Self::Add { path, .. } | Self::Update { path, .. } | Self::Delete { path } => path,
        }
    }
}

struct Hunk {
    lines: Vec<HunkLine>,
}

enum HunkLine {
    Context(String),
    Add(String),
    Remove(String),
}

impl HunkLine {
    fn text(&self) -> &str {
        match self {
            Self::Context(text) | Self::Add(text) | Self::Remove(text) => text,
        }
    }
}

fn parse(patch: &str) -> Result<Vec<ParsedOperation>, PatchError> {
    let lines = patch.lines().collect::<Vec<_>>();
    if lines.first() != Some(&"*** Begin Patch") || lines.last() != Some(&"*** End Patch") {
        return Err(PatchError::Invalid);
    }
    let mut operations = Vec::new();
    let mut index = 1;
    while index + 1 < lines.len() {
        if let Some(path) = lines[index].strip_prefix("*** Add File: ") {
            index += 1;
            let mut added = Vec::new();
            while index + 1 < lines.len() && !lines[index].starts_with("*** ") {
                let line = lines[index].strip_prefix('+').ok_or(PatchError::Invalid)?;
                added.push(line.to_owned());
                index += 1;
            }
            operations.push(ParsedOperation::Add {
                path: path.into(),
                lines: added,
            });
        } else if let Some(path) = lines[index].strip_prefix("*** Delete File: ") {
            operations.push(ParsedOperation::Delete { path: path.into() });
            index += 1;
        } else if let Some(path) = lines[index].strip_prefix("*** Update File: ") {
            index += 1;
            let mut hunks = Vec::new();
            while index + 1 < lines.len() && !lines[index].starts_with("*** ") {
                if !is_hunk_header(lines[index]) {
                    return Err(PatchError::Invalid);
                }
                index += 1;
                let mut hunk_lines = Vec::new();
                while index + 1 < lines.len()
                    && !is_hunk_header(lines[index])
                    && !lines[index].starts_with("*** ")
                {
                    let (prefix, text) = lines[index].split_at(1);
                    hunk_lines.push(match prefix {
                        " " => HunkLine::Context(text.into()),
                        "+" => HunkLine::Add(text.into()),
                        "-" => HunkLine::Remove(text.into()),
                        _ => return Err(PatchError::Invalid),
                    });
                    index += 1;
                }
                if hunk_lines.is_empty() {
                    return Err(PatchError::Invalid);
                }
                hunks.push(Hunk { lines: hunk_lines });
            }
            operations.push(ParsedOperation::Update {
                path: path.into(),
                hunks,
            });
        } else {
            return Err(PatchError::Invalid);
        }
    }
    if operations.is_empty() {
        return Err(PatchError::Invalid);
    }
    Ok(operations)
}

fn is_hunk_header(line: &str) -> bool {
    line == "@@"
        || line
            .strip_prefix("@@ ")
            .is_some_and(|suffix| !suffix.is_empty())
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum PatchError {
    #[error("patch is invalid")]
    Invalid,
    #[error("patch limit exceeded")]
    LimitExceeded,
    #[error("patch contains duplicate operations")]
    DuplicateOperation,
    #[error(transparent)]
    Workspace(WorkspaceError),
    #[error("patch source is unavailable")]
    SourceUnavailable,
    #[error("patch source metadata cannot be preserved")]
    UnsupportedMetadata,
    #[error("patch source is not UTF-8 text")]
    UnsupportedContent,
    #[error("patch hunk has no exact match")]
    HunkMissing,
    #[error("patch hunk matches more than one location")]
    Ambiguous,
    #[error("patch source changed after approval")]
    Stale,
    #[error("recovery artifact is unavailable")]
    RecoveryUnavailable,
    #[error("effect progress could not be recorded")]
    EffectRecordFailed,
    #[error("patch commit failed")]
    CommitFailed,
    #[error("patch effect outcome is uncertain")]
    OutcomeUncertain,
    #[error("recoverable Trash is unavailable")]
    TrashUnavailable,
    #[error("patch cancelled")]
    Cancelled,
    #[error("internal patch invariant failed")]
    Internal,
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    use super::*;
    use crate::agent::types::ArtifactId;
    use crate::tools::output::ArtifactCommit;

    struct MemoryArtifacts;

    impl ArtifactWriter for MemoryArtifacts {
        fn write(&self, request: ArtifactRequest) -> Result<ArtifactCommit, &'static str> {
            Ok(ArtifactCommit {
                artifact_id: ArtifactId::new(),
                byte_count: request.bytes.len(),
                sha256: digest(&request.bytes),
                truncated: false,
            })
        }
    }

    struct RefusingArtifacts;

    impl ArtifactWriter for RefusingArtifacts {
        fn write(&self, _: ArtifactRequest) -> Result<ArtifactCommit, &'static str> {
            Err("injected refusal")
        }
    }

    struct TruncatingArtifacts;

    impl ArtifactWriter for TruncatingArtifacts {
        fn write(&self, request: ArtifactRequest) -> Result<ArtifactCommit, &'static str> {
            Ok(ArtifactCommit {
                artifact_id: ArtifactId::new(),
                byte_count: request.bytes.len(),
                sha256: digest(&request.bytes),
                truncated: true,
            })
        }
    }

    struct TestTrash {
        directory: PathBuf,
        moved: Mutex<Vec<PathBuf>>,
    }

    impl Trash for TestTrash {
        fn move_to_trash(&self, parent: &File, name: &CStr) -> Result<(), PatchError> {
            let destination = self.directory.join(format!("trash-{}", Uuid::new_v4()));
            use std::os::unix::ffi::OsStrExt as _;
            let destination_name = CString::new(destination.as_os_str().as_bytes())
                .map_err(|_| PatchError::CommitFailed)?;
            // SAFETY: both names are NUL-terminated and the directory descriptor is live.
            let result = unsafe {
                libc::renameat(
                    parent.as_raw_fd(),
                    name.as_ptr(),
                    libc::AT_FDCWD,
                    destination_name.as_ptr(),
                )
            };
            if result != 0 {
                return Err(PatchError::CommitFailed);
            }
            self.moved.lock().unwrap().push(destination);
            Ok(())
        }
    }

    #[test]
    fn add_update_and_delete_are_preflighted_and_committed() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("update.txt"), "before\nkeep\n").unwrap();
        std::fs::write(root.path().join("delete.txt"), "recover me\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let plan = prepare(
            &workspace,
            "*** Begin Patch\n*** Add File: add.txt\n+new\n*** Update File: update.txt\n@@\n-before\n+after\n keep\n*** Delete File: delete.txt\n*** End Patch\n",
        )
        .unwrap();
        let trash_directory = tempfile::tempdir().unwrap();
        let trash = TestTrash {
            directory: trash_directory.path().to_owned(),
            moved: Mutex::new(Vec::new()),
        };
        let result = execute(
            &plan,
            TurnId::new(),
            ToolCallId::new(),
            &MemoryArtifacts,
            &MemoryEffectRecorder,
            &trash,
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(root.path().join("add.txt")).unwrap(),
            "new\n"
        );
        assert_eq!(
            std::fs::read_to_string(root.path().join("update.txt")).unwrap(),
            "after\nkeep\n"
        );
        assert!(!root.path().join("delete.txt").exists());
        assert_eq!(result.completed_paths.len(), 3);
        assert_eq!(result.status, "completed");
        assert_eq!(result.recovery_artifacts.len(), 2);
    }

    #[test]
    fn ambiguous_hunk_and_stale_source_fail_without_mutation() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("same.txt"), "same\nsame\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        assert_eq!(
            prepare(
                &workspace,
                "*** Begin Patch\n*** Update File: same.txt\n@@\n-same\n+changed\n*** End Patch\n",
            )
            .unwrap_err(),
            PatchError::Ambiguous
        );

        std::fs::write(root.path().join("overlap.txt"), "a\nb\nc\n").unwrap();
        assert_eq!(
            prepare(
                &workspace,
                "*** Begin Patch\n*** Update File: overlap.txt\n@@\n-a\n-b\n+x\n@@\n-b\n-c\n+y\n*** End Patch\n",
            )
            .unwrap_err(),
            PatchError::Ambiguous
        );

        std::fs::write(root.path().join("dependent.txt"), "before\n").unwrap();
        assert_eq!(
            prepare(
                &workspace,
                "*** Begin Patch\n*** Update File: dependent.txt\n@@\n-before\n+middle\n@@\n-middle\n+after\n*** End Patch\n",
            )
            .unwrap_err(),
            PatchError::HunkMissing
        );

        std::fs::write(root.path().join("mixed.txt"), b"one\r\ntwo\n").unwrap();
        assert_eq!(
            prepare(
                &workspace,
                "*** Begin Patch\n*** Update File: mixed.txt\n@@\n-one\n+changed\n*** End Patch\n",
            )
            .unwrap_err(),
            PatchError::UnsupportedContent
        );

        std::fs::write(root.path().join("no-op.txt"), "same\n").unwrap();
        assert_eq!(
            prepare(
                &workspace,
                "*** Begin Patch\n*** Update File: no-op.txt\n@@\n same\n*** End Patch\n",
            )
            .unwrap_err(),
            PatchError::Invalid
        );
        assert_eq!(
            prepare(
                &workspace,
                "*** Begin Patch\n*** Update File: no-op.txt\n@@ \n-same\n+changed\n*** End Patch\n",
            )
            .unwrap_err(),
            PatchError::Invalid
        );

        std::fs::write(root.path().join("same.txt"), "before\n").unwrap();
        let plan = prepare(
            &workspace,
            "*** Begin Patch\n*** Update File: same.txt\n@@\n-before\n+after\n*** End Patch\n",
        )
        .unwrap();
        std::fs::write(root.path().join("same.txt"), "changed externally\n").unwrap();
        let trash_directory = tempfile::tempdir().unwrap();
        let result = execute(
            &plan,
            TurnId::new(),
            ToolCallId::new(),
            &MemoryArtifacts,
            &MemoryEffectRecorder,
            &TestTrash {
                directory: trash_directory.path().to_owned(),
                moved: Mutex::new(Vec::new()),
            },
            &CancellationToken::new(),
        );
        assert_eq!(result.unwrap().status, "failed_rolled_back");
        assert_eq!(
            std::fs::read_to_string(root.path().join("same.txt")).unwrap(),
            "changed externally\n"
        );
    }

    #[test]
    fn disjoint_hunks_apply_against_the_original_in_descending_order() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("target.txt"), "a\nb\nc\nd\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let plan = prepare(
            &workspace,
            "*** Begin Patch\n*** Update File: target.txt\n@@\n-c\n+C\n@@\n-a\n+A\n*** End Patch\n",
        )
        .unwrap();
        let trash_directory = tempfile::tempdir().unwrap();
        execute(
            &plan,
            TurnId::new(),
            ToolCallId::new(),
            &MemoryArtifacts,
            &MemoryEffectRecorder,
            &TestTrash {
                directory: trash_directory.path().to_owned(),
                moved: Mutex::new(Vec::new()),
            },
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(root.path().join("target.txt")).unwrap(),
            "A\nb\nC\nd\n"
        );
    }

    #[test]
    fn codex_style_hunk_header_is_compatibility_only() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("target.txt"), "before\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let plan = prepare(
            &workspace,
            "*** Begin Patch\n*** Update File: target.txt\n@@ -99,1 +99,1 @@\n-before\n+after\n*** End Patch\n",
        )
        .unwrap();
        let trash_directory = tempfile::tempdir().unwrap();
        let trash = TestTrash {
            directory: trash_directory.path().to_owned(),
            moved: Mutex::new(Vec::new()),
        };
        execute(
            &plan,
            TurnId::new(),
            ToolCallId::new(),
            &MemoryArtifacts,
            &MemoryEffectRecorder,
            &trash,
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(root.path().join("target.txt")).unwrap(),
            "after\n"
        );
    }

    #[test]
    fn metadata_only_change_after_approval_invalidates_the_patch() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("target.txt"), "before\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let plan = prepare(
            &workspace,
            "*** Begin Patch\n*** Update File: target.txt\n@@\n-before\n+after\n*** End Patch\n",
        )
        .unwrap();
        use std::os::unix::fs::PermissionsExt as _;
        std::fs::set_permissions(
            root.path().join("target.txt"),
            std::fs::Permissions::from_mode(0o640),
        )
        .unwrap();
        let trash_directory = tempfile::tempdir().unwrap();
        let result = execute(
            &plan,
            TurnId::new(),
            ToolCallId::new(),
            &MemoryArtifacts,
            &MemoryEffectRecorder,
            &TestTrash {
                directory: trash_directory.path().to_owned(),
                moved: Mutex::new(Vec::new()),
            },
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(result.status, "failed_rolled_back");
        assert_eq!(
            std::fs::read_to_string(root.path().join("target.txt")).unwrap(),
            "before\n"
        );
    }

    #[derive(Default)]
    struct RecordingEffects(Mutex<Vec<EffectProgress>>);

    impl EffectRecorder for RecordingEffects {
        fn started(&self, progress: &EffectProgress) -> Result<(), &'static str> {
            self.0.lock().unwrap().push(progress.clone());
            Ok(())
        }

        fn completed(&self, progress: &EffectProgress) -> Result<(), &'static str> {
            self.0.lock().unwrap().push(progress.clone());
            Ok(())
        }
    }

    #[test]
    fn effect_progress_is_directional_and_bound_to_recovery_identity() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("target.txt"), "before\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let plan = prepare(
            &workspace,
            "*** Begin Patch\n*** Update File: target.txt\n@@\n-before\n+after\n*** End Patch\n",
        )
        .unwrap();
        let effects = RecordingEffects::default();
        let trash_directory = tempfile::tempdir().unwrap();
        execute(
            &plan,
            TurnId::new(),
            ToolCallId::new(),
            &MemoryArtifacts,
            &effects,
            &TestTrash {
                directory: trash_directory.path().to_owned(),
                moved: Mutex::new(Vec::new()),
            },
            &CancellationToken::new(),
        )
        .unwrap();
        let records = effects.0.lock().unwrap();
        assert_eq!(records.len(), 2);
        assert!(records.iter().all(|record| {
            record.direction == EffectDirection::Forward
                && record.operation == EffectOperation::Update
                && record.path == "target.txt"
                && record.recovery_artifact.is_some()
        }));
    }

    struct FailFirstCompletion(AtomicBool);

    impl EffectRecorder for FailFirstCompletion {
        fn started(&self, _: &EffectProgress) -> Result<(), &'static str> {
            Ok(())
        }

        fn completed(&self, progress: &EffectProgress) -> Result<(), &'static str> {
            if progress.index == 0 && !self.0.swap(true, Ordering::SeqCst) {
                Err("injected completion failure")
            } else {
                Ok(())
            }
        }
    }

    #[test]
    fn committed_effect_is_rolled_back_when_completion_recording_fails() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("target.txt"), "before\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let plan = prepare(
            &workspace,
            "*** Begin Patch\n*** Update File: target.txt\n@@\n-before\n+after\n*** End Patch\n",
        )
        .unwrap();
        let trash_directory = tempfile::tempdir().unwrap();
        let trash = TestTrash {
            directory: trash_directory.path().to_owned(),
            moved: Mutex::new(Vec::new()),
        };
        let result = execute(
            &plan,
            TurnId::new(),
            ToolCallId::new(),
            &MemoryArtifacts,
            &FailFirstCompletion(AtomicBool::new(false)),
            &trash,
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(result.status, "failed_rolled_back");
        assert_eq!(result.rolled_back_paths, ["target.txt"]);
        assert_eq!(
            std::fs::read_to_string(root.path().join("target.txt")).unwrap(),
            "before\n"
        );
    }

    #[test]
    fn recovery_refusal_or_truncation_causes_zero_mutation() {
        for artifacts in [
            &RefusingArtifacts as &dyn ArtifactWriter,
            &TruncatingArtifacts as &dyn ArtifactWriter,
        ] {
            let root = tempfile::tempdir().unwrap();
            std::fs::write(root.path().join("target.txt"), "before\n").unwrap();
            let workspace = Workspace::open(root.path()).unwrap();
            let plan = prepare(
                &workspace,
                "*** Begin Patch\n*** Update File: target.txt\n@@\n-before\n+after\n*** End Patch\n",
            )
            .unwrap();
            let trash_directory = tempfile::tempdir().unwrap();
            let trash = TestTrash {
                directory: trash_directory.path().to_owned(),
                moved: Mutex::new(Vec::new()),
            };
            assert_eq!(
                execute(
                    &plan,
                    TurnId::new(),
                    ToolCallId::new(),
                    artifacts,
                    &MemoryEffectRecorder,
                    &trash,
                    &CancellationToken::new(),
                ),
                Err(PatchError::RecoveryUnavailable)
            );
            assert_eq!(
                std::fs::read_to_string(root.path().join("target.txt")).unwrap(),
                "before\n"
            );
        }
    }

    #[test]
    fn total_recovery_cap_is_enforced_during_preflight() {
        let root = tempfile::tempdir().unwrap();
        for index in 0..5 {
            let file = File::create(root.path().join(format!("large-{index}"))).unwrap();
            file.set_len(MAXIMUM_RECOVERY_ARTIFACT_BYTES as u64)
                .unwrap();
        }
        let workspace = Workspace::open(root.path()).unwrap();
        let mut patch = String::from("*** Begin Patch\n");
        for index in 0..5 {
            patch.push_str(&format!("*** Delete File: large-{index}\n"));
        }
        patch.push_str("*** End Patch\n");
        assert!(matches!(
            prepare(&workspace, &patch),
            Err(PatchError::LimitExceeded)
        ));
        for index in 0..5 {
            assert!(root.path().join(format!("large-{index}")).exists());
        }
    }

    struct CancelOnCompletion(CancellationToken);

    impl EffectRecorder for CancelOnCompletion {
        fn started(&self, _: &EffectProgress) -> Result<(), &'static str> {
            Ok(())
        }

        fn completed(&self, progress: &EffectProgress) -> Result<(), &'static str> {
            if progress.index == 0 {
                self.0.cancel();
            }
            Ok(())
        }
    }

    struct StaleSecondAfterFirst {
        root: PathBuf,
    }

    impl EffectRecorder for StaleSecondAfterFirst {
        fn started(&self, _: &EffectProgress) -> Result<(), &'static str> {
            Ok(())
        }

        fn completed(&self, progress: &EffectProgress) -> Result<(), &'static str> {
            if progress.index == 0 {
                std::fs::write(self.root.join("second.txt"), "externally-changed\n")
                    .map_err(|_| "injected stale write failed")?;
            }
            Ok(())
        }
    }

    #[test]
    fn later_stale_source_rolls_back_prior_commits() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("first.txt"), "first-before\n").unwrap();
        std::fs::write(root.path().join("second.txt"), "second-before\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let plan = prepare(
            &workspace,
            "*** Begin Patch\n*** Update File: first.txt\n@@\n-first-before\n+first-after\n*** Update File: second.txt\n@@\n-second-before\n+second-after\n*** End Patch\n",
        )
        .unwrap();
        let trash_directory = tempfile::tempdir().unwrap();
        let trash = TestTrash {
            directory: trash_directory.path().to_owned(),
            moved: Mutex::new(Vec::new()),
        };
        let result = execute(
            &plan,
            TurnId::new(),
            ToolCallId::new(),
            &MemoryArtifacts,
            &StaleSecondAfterFirst {
                root: root.path().to_owned(),
            },
            &trash,
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(result.status, "failed_rolled_back");
        assert_eq!(result.rolled_back_paths, ["first.txt"]);
        assert_eq!(
            std::fs::read_to_string(root.path().join("first.txt")).unwrap(),
            "first-before\n"
        );
        assert_eq!(
            std::fs::read_to_string(root.path().join("second.txt")).unwrap(),
            "externally-changed\n"
        );
    }

    #[test]
    fn cancellation_after_commit_rolls_back_and_starts_no_later_step() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("first.txt"), "before\n").unwrap();
        std::fs::write(root.path().join("second.txt"), "untouched\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let plan = prepare(
            &workspace,
            "*** Begin Patch\n*** Update File: first.txt\n@@\n-before\n+after\n*** Update File: second.txt\n@@\n-untouched\n+changed\n*** End Patch\n",
        )
        .unwrap();
        let trash_directory = tempfile::tempdir().unwrap();
        let trash = TestTrash {
            directory: trash_directory.path().to_owned(),
            moved: Mutex::new(Vec::new()),
        };
        let cancellation = CancellationToken::new();
        let result = execute(
            &plan,
            TurnId::new(),
            ToolCallId::new(),
            &MemoryArtifacts,
            &CancelOnCompletion(cancellation.clone()),
            &trash,
            &cancellation,
        )
        .unwrap();
        assert_eq!(result.status, "cancelled_rolled_back");
        assert_eq!(
            std::fs::read_to_string(root.path().join("first.txt")).unwrap(),
            "before\n"
        );
        assert_eq!(
            std::fs::read_to_string(root.path().join("second.txt")).unwrap(),
            "untouched\n"
        );
    }

    struct FailAfterFirstTrash {
        directory: PathBuf,
        calls: AtomicUsize,
    }

    impl Trash for FailAfterFirstTrash {
        fn move_to_trash(&self, parent: &File, name: &CStr) -> Result<(), PatchError> {
            if self.calls.fetch_add(1, Ordering::SeqCst) != 0 {
                return Err(PatchError::CommitFailed);
            }
            let destination = self.directory.join(format!("trash-{}", Uuid::new_v4()));
            use std::os::unix::ffi::OsStrExt as _;
            let destination = CString::new(destination.as_os_str().as_bytes())
                .map_err(|_| PatchError::CommitFailed)?;
            // SAFETY: both names are NUL-terminated and the source directory is live.
            let result = unsafe {
                libc::renameat(
                    parent.as_raw_fd(),
                    name.as_ptr(),
                    libc::AT_FDCWD,
                    destination.as_ptr(),
                )
            };
            (result == 0).then_some(()).ok_or(PatchError::CommitFailed)
        }
    }

    #[test]
    fn rollback_failure_reports_exact_uncertain_path() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("target.txt"), "before\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let plan = prepare(
            &workspace,
            "*** Begin Patch\n*** Update File: target.txt\n@@\n-before\n+after\n*** End Patch\n",
        )
        .unwrap();
        let trash_directory = tempfile::tempdir().unwrap();
        let result = execute(
            &plan,
            TurnId::new(),
            ToolCallId::new(),
            &MemoryArtifacts,
            &FailFirstCompletion(AtomicBool::new(false)),
            &FailAfterFirstTrash {
                directory: trash_directory.path().to_owned(),
                calls: AtomicUsize::new(0),
            },
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(result.status, "uncertain");
        assert_eq!(result.uncertain_paths, ["target.txt"]);
        assert_eq!(
            std::fs::read_to_string(root.path().join("target.txt")).unwrap(),
            "after\n"
        );
    }

    #[test]
    #[ignore = "manual macOS Trash and restoration qualification"]
    fn mac_trash_moves_and_restores_a_descriptor_relative_target() {
        let root = tempfile::tempdir().unwrap();
        let name = format!("pho-phase4-trash-{}", Uuid::new_v4());
        std::fs::write(root.path().join(&name), "restore-me\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let target = workspace.open_parent(&name).unwrap();
        MacTrash
            .move_to_trash(&target.parent, &target.name)
            .unwrap();
        assert!(!root.path().join(&name).exists());

        let home = std::env::var_os("HOME").expect("HOME is required for the manual fixture");
        let trashed = PathBuf::from(home).join(".Trash").join(&name);
        assert!(trashed.exists(), "qualified Trash item was not observable");
        std::fs::rename(&trashed, root.path().join(&name)).unwrap();
        assert_eq!(
            std::fs::read_to_string(root.path().join(&name)).unwrap(),
            "restore-me\n"
        );
    }

    struct RetargetAncestor {
        root: PathBuf,
        outside: PathBuf,
    }

    impl EffectRecorder for RetargetAncestor {
        fn started(&self, progress: &EffectProgress) -> Result<(), &'static str> {
            if progress.index == 0 {
                std::fs::rename(self.root.join("sub"), self.root.join("original-sub"))
                    .map_err(|_| "rename failed")?;
                std::os::unix::fs::symlink(&self.outside, self.root.join("sub"))
                    .map_err(|_| "symlink failed")?;
            }
            Ok(())
        }

        fn completed(&self, _: &EffectProgress) -> Result<(), &'static str> {
            Ok(())
        }
    }

    #[test]
    fn ancestor_retarget_after_effect_record_cannot_mutate_outside_workspace() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("sub")).unwrap();
        std::fs::write(root.path().join("sub/target.txt"), "before\n").unwrap();
        std::fs::write(outside.path().join("target.txt"), "outside\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let plan = prepare(
            &workspace,
            "*** Begin Patch\n*** Update File: sub/target.txt\n@@\n-before\n+after\n*** End Patch\n",
        )
        .unwrap();
        let trash_directory = tempfile::tempdir().unwrap();
        let trash = TestTrash {
            directory: trash_directory.path().to_owned(),
            moved: Mutex::new(Vec::new()),
        };
        let result = execute(
            &plan,
            TurnId::new(),
            ToolCallId::new(),
            &MemoryArtifacts,
            &RetargetAncestor {
                root: root.path().to_owned(),
                outside: outside.path().to_owned(),
            },
            &trash,
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(result.status, "failed_rolled_back");
        assert_eq!(
            std::fs::read_to_string(outside.path().join("target.txt")).unwrap(),
            "outside\n"
        );
        assert_eq!(
            std::fs::read_to_string(root.path().join("original-sub/target.txt")).unwrap(),
            "before\n"
        );
    }
}
