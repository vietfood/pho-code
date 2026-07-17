//! Coordinator-owned workspace tree and immutable file snapshots.
//!
//! The services in this module have no GPUI or journal dependency.  They accept a retained
//! [`Workspace`] authority and return generation-bearing values that a caller may publish only
//! after checking the selected workbench context.

use std::cmp::Ordering;
use std::fmt;
use std::fs::File;
use std::io::Read;
use std::path::{Component, Path};

use sha2::{Digest, Sha256};

use crate::tools::workspace::{Workspace, WorkspaceError};

use super::workbench_preferences::WorkspaceRegistrationId;
use super::workbench_state::{FileRequestId, GitRequestId, TreeRequestId, WorkspaceGeneration};

pub const MAX_DIRECTORY_ENTRIES: usize = 2_048;
pub const MAX_TREE_DEPTH: usize = 64;
pub const MAX_RELATIVE_PATH_BYTES: usize = 4 * 1024;
pub const MAX_FILE_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_FILE_LINES: usize = 250_000;
pub const MAX_HIGHLIGHT_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_HIGHLIGHT_LINES: usize = 50_000;
pub const MAX_COPY_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_SEARCH_QUERY_BYTES: usize = 4 * 1024;
pub const MAX_SEARCH_MATCHES: usize = 4_096;
pub const MAX_SEARCH_RESULT_BYTES: usize = 64 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DirectorySnapshotState {
    Loading,
    Ready,
    Stale,
    Failed,
    Truncated,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TreeEntryKind {
    Directory,
    File,
    Symlink,
    Special,
    Inaccessible,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChildState {
    Unloaded,
    Opaque,
    Inaccessible,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreeEntry {
    pub relative_path: String,
    pub display_name: String,
    pub kind: TreeEntryKind,
    pub child_state: ChildState,
}

#[derive(Clone, Eq, PartialEq)]
pub struct DirectorySnapshot {
    pub registration_id: WorkspaceRegistrationId,
    pub workspace_generation: WorkspaceGeneration,
    pub request_id: TreeRequestId,
    pub relative_directory: String,
    pub state: DirectorySnapshotState,
    pub entries: Vec<TreeEntry>,
}

impl fmt::Debug for DirectorySnapshot {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("DirectorySnapshot")
            .field("registration_id", &self.registration_id)
            .field("workspace_generation", &self.workspace_generation)
            .field("request_id", &self.request_id)
            .field("relative_directory", &self.relative_directory)
            .field("state", &self.state)
            .field("entry_count", &self.entries.len())
            .finish()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FileSnapshotIdentity {
    pub registration_id: WorkspaceRegistrationId,
    pub workspace_generation: WorkspaceGeneration,
    pub request_id: FileRequestId,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FileIdentity {
    pub device: u64,
    pub inode: u64,
    pub size: u64,
    pub modified_seconds: i64,
    pub modified_nanos: i64,
    pub changed_seconds: i64,
    pub changed_nanos: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum QualifiedLanguage {
    Rust,
    Markdown,
    Json,
    Toml,
    Python,
    Shell,
    TypeScript,
    PlainText,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FileSnapshotState {
    Ready,
    Stale,
    ChangedDuringRead,
    Unsupported,
    TooLarge,
    Failed,
}

#[derive(Clone, Eq, PartialEq)]
pub struct FileSnapshot {
    pub identity: FileSnapshotIdentity,
    pub relative_path: String,
    pub source_utf8: String,
    pub line_index: Vec<usize>,
    pub file_identity: FileIdentity,
    pub content_digest: [u8; 32],
    pub language: QualifiedLanguage,
    pub highlight_eligible: bool,
    pub state: FileSnapshotState,
}

impl fmt::Debug for FileSnapshot {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("FileSnapshot")
            .field("identity", &self.identity)
            .field("relative_path", &self.relative_path)
            .field("source_bytes", &self.source_utf8.len())
            .field("line_count", &self.line_index.len())
            .field("file_identity", &self.file_identity)
            .field("content_digest", &hex_digest(&self.content_digest))
            .field("language", &self.language)
            .field("highlight_eligible", &self.highlight_eligible)
            .field("state", &self.state)
            .finish()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SearchMatch {
    pub start: usize,
    pub end: usize,
    pub line: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum InspectionError {
    InvalidPath,
    Workspace(WorkspaceError),
    DepthExceeded,
    PathTooLong,
    DirectoryUnavailable,
    DirectoryChanged,
    DirectoryTruncated,
    FileUnavailable,
    FileChangedDuringRead,
    FileTooLarge,
    TooManyLines,
    UnsupportedContent,
    InvalidRange,
    QueryTooLarge,
    SearchResultsTooLarge,
    StaleResult,
}

impl From<WorkspaceError> for InspectionError {
    fn from(error: WorkspaceError) -> Self {
        match error {
            WorkspaceError::WorkspaceChanged => Self::DirectoryChanged,
            WorkspaceError::Missing => Self::FileUnavailable,
            other => Self::Workspace(other),
        }
    }
}

/// Enumerate exactly one directory through the retained descriptor.  Symlinks and special files
/// are classified with `AT_SYMLINK_NOFOLLOW`; no child descriptor is opened for either kind.
pub fn enumerate_directory(
    workspace: &Workspace,
    registration_id: WorkspaceRegistrationId,
    workspace_generation: WorkspaceGeneration,
    request_id: TreeRequestId,
    relative_directory: &str,
    depth: usize,
) -> Result<DirectorySnapshot, InspectionError> {
    validate_relative_directory(relative_directory)?;
    if depth > MAX_TREE_DEPTH {
        return Err(InspectionError::DepthExceeded);
    }
    workspace.ensure_current().map_err(InspectionError::from)?;
    let (directory_name, directory) = workspace
        .open_directory(relative_directory)
        .map_err(InspectionError::from)?;
    #[cfg(unix)]
    {
        enumerate_unix(
            registration_id,
            workspace_generation,
            request_id,
            &directory_name,
            directory,
        )
    }
    #[cfg(not(unix))]
    {
        let _ = (
            registration_id,
            workspace_generation,
            request_id,
            directory_name,
            directory,
        );
        Err(InspectionError::DirectoryUnavailable)
    }
}

#[cfg(unix)]
fn enumerate_unix(
    registration_id: WorkspaceRegistrationId,
    workspace_generation: WorkspaceGeneration,
    request_id: TreeRequestId,
    relative_directory: &str,
    directory: File,
) -> Result<DirectorySnapshot, InspectionError> {
    use std::os::fd::{AsRawFd, IntoRawFd};

    let duplicate = directory
        .try_clone()
        .map_err(|_| InspectionError::DirectoryUnavailable)?
        .into_raw_fd();
    // SAFETY: `duplicate` is a valid cloned directory descriptor and fdopendir takes ownership.
    let stream = unsafe { libc::fdopendir(duplicate) };
    if stream.is_null() {
        // SAFETY: fdopendir failed and did not take ownership.
        unsafe { libc::close(duplicate) };
        return Err(InspectionError::DirectoryUnavailable);
    }
    let mut entries = Vec::new();
    let mut truncated = false;
    loop {
        clear_errno();
        // SAFETY: `stream` remains valid until closed below.
        let raw = unsafe { libc::readdir(stream) };
        if raw.is_null() {
            if current_errno() != 0 {
                // SAFETY: stream is owned by this function.
                unsafe { libc::closedir(stream) };
                return Err(InspectionError::DirectoryUnavailable);
            }
            break;
        }
        // SAFETY: readdir returns a live NUL-terminated d_name.
        let name = unsafe { std::ffi::CStr::from_ptr((*raw).d_name.as_ptr()) };
        if name.to_bytes() == b"." || name.to_bytes() == b".." {
            continue;
        }
        let name = name.to_bytes();
        if name.is_empty() || name.len() > MAX_RELATIVE_PATH_BYTES {
            continue;
        }
        let display_name = sanitize_name(name);
        let relative_path = if relative_directory == "." {
            display_name.clone()
        } else {
            format!("{relative_directory}/{display_name}")
        };
        if relative_path.len() > MAX_RELATIVE_PATH_BYTES {
            truncated = true;
            continue;
        }
        if entries.len() >= MAX_DIRECTORY_ENTRIES {
            truncated = true;
            continue;
        }
        let mut metadata = std::mem::MaybeUninit::<libc::stat>::uninit();
        // SAFETY: name is NUL-terminated and metadata points to valid storage.
        let result = unsafe {
            libc::fstatat(
                directory.as_raw_fd(),
                name.as_ptr().cast(),
                metadata.as_mut_ptr(),
                libc::AT_SYMLINK_NOFOLLOW,
            )
        };
        let (kind, child_state) = if result != 0 {
            let error = current_errno();
            if error == libc::ENOENT {
                // A concurrent disappearance is not authoritative; keep a visible inaccessible
                // row so the projection can explain why expansion changed.
                (TreeEntryKind::Inaccessible, ChildState::Inaccessible)
            } else {
                (TreeEntryKind::Inaccessible, ChildState::Inaccessible)
            }
        } else {
            // SAFETY: fstatat initialized metadata on success.
            let metadata = unsafe { metadata.assume_init() };
            let mode = metadata.st_mode & libc::S_IFMT;
            match mode {
                libc::S_IFDIR if name == b".git" => (TreeEntryKind::Directory, ChildState::Opaque),
                libc::S_IFDIR => (TreeEntryKind::Directory, ChildState::Unloaded),
                libc::S_IFREG => (TreeEntryKind::File, ChildState::Unloaded),
                libc::S_IFLNK => (TreeEntryKind::Symlink, ChildState::Inaccessible),
                _ => (TreeEntryKind::Special, ChildState::Inaccessible),
            }
        };
        entries.push(TreeEntry {
            relative_path,
            display_name,
            kind,
            child_state,
        });
    }
    // SAFETY: stream is owned by this function.
    if unsafe { libc::closedir(stream) } != 0 {
        return Err(InspectionError::DirectoryUnavailable);
    }
    entries.sort_by(tree_order);
    Ok(DirectorySnapshot {
        registration_id,
        workspace_generation,
        request_id,
        relative_directory: relative_directory.to_owned(),
        state: if truncated {
            DirectorySnapshotState::Truncated
        } else {
            DirectorySnapshotState::Ready
        },
        entries,
    })
}

fn sanitize_name(name: &[u8]) -> String {
    String::from_utf8_lossy(name)
        .chars()
        .map(|character| {
            if character.is_control() {
                '\u{fffd}'
            } else {
                character
            }
        })
        .collect()
}

#[cfg(unix)]
fn clear_errno() {
    // SAFETY: __errno_location/__error returns this thread's errno slot.
    #[cfg(target_os = "macos")]
    unsafe {
        *libc::__error() = 0;
    }
    #[cfg(not(target_os = "macos"))]
    unsafe {
        *libc::__errno_location() = 0;
    }
}

#[cfg(unix)]
fn current_errno() -> i32 {
    // SAFETY: __errno_location/__error returns this thread's errno slot.
    #[cfg(target_os = "macos")]
    unsafe {
        *libc::__error()
    }
    #[cfg(not(target_os = "macos"))]
    unsafe {
        *libc::__errno_location()
    }
}

fn tree_order(left: &TreeEntry, right: &TreeEntry) -> Ordering {
    let left_directory = left.kind == TreeEntryKind::Directory;
    let right_directory = right.kind == TreeEntryKind::Directory;
    right_directory
        .cmp(&left_directory)
        .then_with(|| left.relative_path.cmp(&right.relative_path))
}

fn validate_relative_directory(value: &str) -> Result<(), InspectionError> {
    if value == "." {
        return Ok(());
    }
    validate_relative_path(value)
}

fn validate_relative_path(value: &str) -> Result<(), InspectionError> {
    if value.is_empty()
        || value.len() > MAX_RELATIVE_PATH_BYTES
        || value.contains('\0')
        || value.chars().any(char::is_control)
    {
        return Err(if value.len() > MAX_RELATIVE_PATH_BYTES {
            InspectionError::PathTooLong
        } else {
            InspectionError::InvalidPath
        });
    }
    let path = Path::new(value);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(InspectionError::InvalidPath);
    }
    Ok(())
}

pub fn read_file_snapshot(
    workspace: &Workspace,
    identity: FileSnapshotIdentity,
    relative_path: &str,
) -> Result<FileSnapshot, InspectionError> {
    validate_relative_path(relative_path)?;
    workspace.ensure_current().map_err(InspectionError::from)?;
    let (resolved, file) = workspace
        .open_file(relative_path)
        .map_err(InspectionError::from)?;
    let before = file
        .metadata()
        .map_err(|_| InspectionError::FileUnavailable)?;
    if !before.is_file() {
        return Err(InspectionError::UnsupportedContent);
    }
    if before.len() > MAX_FILE_BYTES as u64 {
        return Err(InspectionError::FileTooLarge);
    }
    let before_identity = file_identity(&before);
    let mut limited = file.take((MAX_FILE_BYTES + 1) as u64);
    let mut bytes = Vec::new();
    limited
        .read_to_end(&mut bytes)
        .map_err(|_| InspectionError::FileUnavailable)?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err(InspectionError::FileTooLarge);
    }
    if bytes.contains(&0) || looks_binary(&bytes) {
        return Err(InspectionError::UnsupportedContent);
    }
    let source =
        String::from_utf8(bytes.clone()).map_err(|_| InspectionError::UnsupportedContent)?;
    let after = limited
        .get_ref()
        .metadata()
        .map_err(|_| InspectionError::FileUnavailable)?;
    if file_identity(&after) != before_identity {
        return Err(InspectionError::FileChangedDuringRead);
    }
    let (_, current) = workspace
        .open_file(relative_path)
        .map_err(|_| InspectionError::FileChangedDuringRead)?;
    let current_metadata = current
        .metadata()
        .map_err(|_| InspectionError::FileChangedDuringRead)?;
    if file_identity(&current_metadata) != before_identity {
        return Err(InspectionError::FileChangedDuringRead);
    }
    let line_index = make_line_index(&source)?;
    let digest = Sha256::digest(&bytes);
    let mut content_digest = [0_u8; 32];
    content_digest.copy_from_slice(&digest);
    let language = qualify_language(&resolved.display);
    Ok(FileSnapshot {
        identity,
        relative_path: resolved.display,
        source_utf8: source,
        line_index: line_index.clone(),
        file_identity: before_identity,
        content_digest,
        language,
        highlight_eligible: bytes.len() <= MAX_HIGHLIGHT_BYTES
            && line_index.len() <= MAX_HIGHLIGHT_LINES,
        state: FileSnapshotState::Ready,
    })
}

fn looks_binary(bytes: &[u8]) -> bool {
    bytes
        .iter()
        .any(|byte| matches!(*byte, 1..=8 | 11..=12 | 14..=31 | 127))
}

#[cfg(unix)]
fn file_identity(metadata: &std::fs::Metadata) -> FileIdentity {
    use std::os::unix::fs::MetadataExt;
    FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
        size: metadata.len(),
        modified_seconds: metadata.mtime(),
        modified_nanos: metadata.mtime_nsec(),
        changed_seconds: metadata.ctime(),
        changed_nanos: metadata.ctime_nsec(),
    }
}

#[cfg(not(unix))]
fn file_identity(metadata: &std::fs::Metadata) -> FileIdentity {
    FileIdentity {
        device: 0,
        inode: 0,
        size: metadata.len(),
        modified_seconds: 0,
        modified_nanos: 0,
        changed_seconds: 0,
        changed_nanos: 0,
    }
}

fn make_line_index(source: &str) -> Result<Vec<usize>, InspectionError> {
    let mut index = vec![0];
    for (offset, byte) in source.as_bytes().iter().enumerate() {
        if *byte == b'\n' {
            index.push(offset + 1);
            if index.len() > MAX_FILE_LINES {
                return Err(InspectionError::TooManyLines);
            }
        }
    }
    Ok(index)
}

fn qualify_language(path: &str) -> QualifiedLanguage {
    match Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
    {
        Some("rs") => QualifiedLanguage::Rust,
        Some("md" | "markdown") => QualifiedLanguage::Markdown,
        Some("json") => QualifiedLanguage::Json,
        Some("toml") => QualifiedLanguage::Toml,
        Some("py") => QualifiedLanguage::Python,
        Some("sh" | "bash" | "zsh") => QualifiedLanguage::Shell,
        Some("ts" | "tsx" | "js" | "jsx") => QualifiedLanguage::TypeScript,
        _ => QualifiedLanguage::PlainText,
    }
}

impl FileSnapshot {
    pub fn copy_range(&self, start: usize, end: usize) -> Result<String, InspectionError> {
        if start > end || end > self.source_utf8.len() || end - start > MAX_COPY_BYTES {
            return Err(InspectionError::InvalidRange);
        }
        if !self.source_utf8.is_char_boundary(start) || !self.source_utf8.is_char_boundary(end) {
            return Err(InspectionError::InvalidRange);
        }
        Ok(self.source_utf8[start..end].to_owned())
    }

    pub fn search_literal(
        &self,
        query: &str,
        maximum_matches: usize,
    ) -> Result<Vec<SearchMatch>, InspectionError> {
        if query.is_empty() || query.len() > MAX_SEARCH_QUERY_BYTES || query.contains('\0') {
            return Err(InspectionError::QueryTooLarge);
        }
        let maximum_matches = maximum_matches.min(MAX_SEARCH_MATCHES);
        if maximum_matches == 0 {
            return Ok(Vec::new());
        }
        let mut matches = Vec::new();
        let mut cursor = 0;
        while let Some(relative) = self.source_utf8[cursor..].find(query) {
            let start = cursor + relative;
            let end = start + query.len();
            let line = self
                .line_index
                .partition_point(|offset| *offset <= start)
                .saturating_sub(1)
                + 1;
            matches.push(SearchMatch { start, end, line });
            if matches.len() >= maximum_matches
                || matches.len() * std::mem::size_of::<SearchMatch>() > MAX_SEARCH_RESULT_BYTES
            {
                break;
            }
            cursor = end;
        }
        Ok(matches)
    }

    pub fn accepts_result(
        &self,
        registration_id: WorkspaceRegistrationId,
        workspace_generation: WorkspaceGeneration,
        request_id: FileRequestId,
    ) -> bool {
        self.identity.registration_id == registration_id
            && self.identity.workspace_generation == workspace_generation
            && self.identity.request_id == request_id
    }
}

pub fn accepts_directory_result(
    snapshot: &DirectorySnapshot,
    registration_id: WorkspaceRegistrationId,
    workspace_generation: WorkspaceGeneration,
    request_id: TreeRequestId,
) -> bool {
    snapshot.registration_id == registration_id
        && snapshot.workspace_generation == workspace_generation
        && snapshot.request_id == request_id
}

pub fn accepts_git_request(
    registration_id: WorkspaceRegistrationId,
    workspace_generation: WorkspaceGeneration,
    request_id: GitRequestId,
    expected: (WorkspaceRegistrationId, WorkspaceGeneration, GitRequestId),
) -> bool {
    (registration_id, workspace_generation, request_id) == expected
}

fn hex_digest(digest: &[u8; 32]) -> String {
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn ids() -> (
        WorkspaceRegistrationId,
        WorkspaceGeneration,
        FileRequestId,
        TreeRequestId,
    ) {
        (
            WorkspaceRegistrationId::new(),
            WorkspaceGeneration::new(),
            FileRequestId::new(),
            TreeRequestId::new(),
        )
    }

    #[test]
    fn directory_sorting_is_dirs_first_and_path_deterministic() {
        let root = tempdir().unwrap();
        fs::create_dir(root.path().join("z-dir")).unwrap();
        fs::write(root.path().join("a-file"), "a").unwrap();
        fs::create_dir(root.path().join("a-dir")).unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let (registration, generation, _, request) = ids();
        let snapshot =
            enumerate_directory(&workspace, registration, generation, request, ".", 0).unwrap();
        assert_eq!(snapshot.state, DirectorySnapshotState::Ready);
        assert_eq!(
            snapshot
                .entries
                .iter()
                .map(|entry| entry.display_name.as_str())
                .collect::<Vec<_>>(),
            vec!["a-dir", "z-dir", "a-file"]
        );
    }

    #[test]
    fn symlink_special_and_git_are_inert() {
        let root = tempdir().unwrap();
        fs::create_dir(root.path().join(".git")).unwrap();
        fs::write(root.path().join("file"), "x").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(root.path().join("file"), root.path().join("link")).unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let (registration, generation, _, request) = ids();
        let snapshot =
            enumerate_directory(&workspace, registration, generation, request, ".", 0).unwrap();
        let git = snapshot
            .entries
            .iter()
            .find(|entry| entry.display_name == ".git")
            .unwrap();
        assert_eq!(git.child_state, ChildState::Opaque);
        #[cfg(unix)]
        {
            let link = snapshot
                .entries
                .iter()
                .find(|entry| entry.display_name == "link")
                .unwrap();
            assert_eq!(link.kind, TreeEntryKind::Symlink);
            assert_eq!(link.child_state, ChildState::Inaccessible);
        }
    }

    #[test]
    fn directory_truncation_is_explicit() {
        let root = tempdir().unwrap();
        for index in 0..(MAX_DIRECTORY_ENTRIES + 2) {
            fs::write(root.path().join(format!("f{index}")), "x").unwrap();
        }
        let workspace = Workspace::open(root.path()).unwrap();
        let (registration, generation, _, request) = ids();
        let snapshot =
            enumerate_directory(&workspace, registration, generation, request, ".", 0).unwrap();
        assert_eq!(snapshot.state, DirectorySnapshotState::Truncated);
        assert_eq!(snapshot.entries.len(), MAX_DIRECTORY_ENTRIES);
    }

    #[test]
    fn root_replacement_rejects_old_workspace_generation() {
        let parent = tempdir().unwrap();
        let root_path = parent.path().join("workspace");
        fs::create_dir(&root_path).unwrap();
        let workspace = Workspace::open(&root_path).unwrap();
        let moved = parent.path().join("moved");
        fs::rename(&root_path, &moved).unwrap();
        fs::create_dir(&root_path).unwrap();
        let (registration, generation, _, request) = ids();
        assert_eq!(
            enumerate_directory(&workspace, registration, generation, request, ".", 0),
            Err(InspectionError::DirectoryChanged)
        );
    }

    #[test]
    fn file_snapshot_preserves_bom_crlf_and_builds_digest_index() {
        let root = tempdir().unwrap();
        fs::write(
            root.path().join("main.rs"),
            b"\xef\xbb\xbffn main() {\r\n}\r\n",
        )
        .unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let (registration, generation, request, _) = ids();
        let snapshot = read_file_snapshot(
            &workspace,
            FileSnapshotIdentity {
                registration_id: registration,
                workspace_generation: generation,
                request_id: request,
            },
            "main.rs",
        )
        .unwrap();
        assert_eq!(snapshot.language, QualifiedLanguage::Rust);
        assert_eq!(snapshot.source_utf8.as_bytes()[..3], [0xef, 0xbb, 0xbf]);
        assert_eq!(snapshot.source_utf8, "\u{feff}fn main() {\r\n}\r\n");
        assert_eq!(snapshot.line_index, vec![0, 16, 19]);
        assert!(snapshot.highlight_eligible);
        let expected: [u8; 32] = Sha256::digest(snapshot.source_utf8.as_bytes()).into();
        assert_eq!(snapshot.content_digest, expected);
    }

    #[test]
    fn file_snapshot_rejects_binary_invalid_and_oversized_content() {
        let root = tempdir().unwrap();
        fs::write(root.path().join("nul"), b"a\0b").unwrap();
        fs::write(root.path().join("invalid"), [0xff, 0xfe]).unwrap();
        fs::write(root.path().join("large"), vec![b'x'; MAX_FILE_BYTES + 1]).unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let (registration, generation, request, _) = ids();
        for path in ["nul", "invalid"] {
            assert_eq!(
                read_file_snapshot(
                    &workspace,
                    FileSnapshotIdentity {
                        registration_id: registration,
                        workspace_generation: generation,
                        request_id: request
                    },
                    path
                ),
                Err(InspectionError::UnsupportedContent)
            );
        }
        assert_eq!(
            read_file_snapshot(
                &workspace,
                FileSnapshotIdentity {
                    registration_id: registration,
                    workspace_generation: generation,
                    request_id: request
                },
                "large"
            ),
            Err(InspectionError::FileTooLarge)
        );
    }

    #[test]
    fn file_snapshot_rejects_too_many_lines_and_bounds_copy_search() {
        let root = tempdir().unwrap();
        let lines = (0..=MAX_FILE_LINES).map(|_| "x\n").collect::<String>();
        fs::write(root.path().join("many.txt"), lines).unwrap();
        fs::write(root.path().join("text.txt"), "abc abc abc\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let (registration, generation, request, _) = ids();
        assert_eq!(
            read_file_snapshot(
                &workspace,
                FileSnapshotIdentity {
                    registration_id: registration,
                    workspace_generation: generation,
                    request_id: request
                },
                "many.txt"
            ),
            Err(InspectionError::TooManyLines)
        );
        let snapshot = read_file_snapshot(
            &workspace,
            FileSnapshotIdentity {
                registration_id: registration,
                workspace_generation: generation,
                request_id: request,
            },
            "text.txt",
        )
        .unwrap();
        assert_eq!(snapshot.copy_range(0, 3).unwrap(), "abc");
        assert_eq!(snapshot.search_literal("abc", 2).unwrap().len(), 2);
        assert!(!snapshot.accepts_result(registration, generation, FileRequestId::new()));
    }

    #[test]
    fn generation_acceptance_is_exact_for_all_request_identities() {
        let (registration, generation, file_request, tree_request) = ids();
        let directory = DirectorySnapshot {
            registration_id: registration,
            workspace_generation: generation,
            request_id: tree_request,
            relative_directory: ".".into(),
            state: DirectorySnapshotState::Ready,
            entries: vec![],
        };
        assert!(accepts_directory_result(
            &directory,
            registration,
            generation,
            tree_request
        ));
        assert!(!accepts_directory_result(
            &directory,
            registration,
            WorkspaceGeneration::new(),
            tree_request
        ));
        let snapshot = FileSnapshot {
            identity: FileSnapshotIdentity {
                registration_id: registration,
                workspace_generation: generation,
                request_id: file_request,
            },
            relative_path: "x".into(),
            source_utf8: String::new(),
            line_index: vec![0],
            file_identity: FileIdentity {
                device: 0,
                inode: 0,
                size: 0,
                modified_seconds: 0,
                modified_nanos: 0,
                changed_seconds: 0,
                changed_nanos: 0,
            },
            content_digest: [0; 32],
            language: QualifiedLanguage::PlainText,
            highlight_eligible: true,
            state: FileSnapshotState::Ready,
        };
        assert!(!snapshot.accepts_result(WorkspaceRegistrationId::new(), generation, file_request));
        let git_request = GitRequestId::new();
        assert!(accepts_git_request(
            registration,
            generation,
            git_request,
            (registration, generation, git_request)
        ));
    }

    #[test]
    fn debug_redacts_file_source() {
        let snapshot = FileSnapshot {
            identity: FileSnapshotIdentity {
                registration_id: WorkspaceRegistrationId::new(),
                workspace_generation: WorkspaceGeneration::new(),
                request_id: FileRequestId::new(),
            },
            relative_path: "secret.txt".into(),
            source_utf8: "private-body-marker".into(),
            line_index: vec![0],
            file_identity: FileIdentity {
                device: 0,
                inode: 0,
                size: 19,
                modified_seconds: 0,
                modified_nanos: 0,
                changed_seconds: 0,
                changed_nanos: 0,
            },
            content_digest: [0; 32],
            language: QualifiedLanguage::PlainText,
            highlight_eligible: true,
            state: FileSnapshotState::Ready,
        };
        assert!(!format!("{snapshot:?}").contains("private-body-marker"));
    }
}
