//! Bounded, read-only Git inspection for the native workbench.

use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

#[cfg(unix)]
use std::os::unix::process::CommandExt as _;

use thiserror::Error;
use tokio::io::AsyncReadExt as _;
use tokio::process::{Child, Command};
use tokio_util::sync::CancellationToken;

use super::workbench_preferences::WorkspaceRegistrationId;
use super::workbench_state::{GitRequestId, WorkspaceGeneration};

pub const STATUS_MAXIMUM_BYTES: usize = 1024 * 1024;
pub const STATUS_MAXIMUM_RECORDS: usize = 10_000;
pub const STATUS_DEADLINE: Duration = Duration::from_secs(2);
pub const DIFF_MAXIMUM_BYTES: usize = 4 * 1024 * 1024;
pub const DIFF_MAXIMUM_LINES: usize = 20_000;
pub const DIFF_DEADLINE: Duration = Duration::from_secs(5);
pub const DIFF_PREVIEW_BYTES: usize = 512 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GitInspectionState {
    Loading,
    Ready,
    NotRepository,
    Detached,
    Unborn,
    Stale,
    TimedOut,
    Cancelled,
    Unsupported,
    Failed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GitPathKind {
    Changed,
    Untracked,
    Conflict,
    Renamed,
    Submodule,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GitPathStatus {
    pub path: String,
    pub original_path: Option<String>,
    pub index_status: char,
    pub worktree_status: char,
    pub kind: GitPathKind,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct GitDirtyCounts {
    pub staged: u32,
    pub unstaged: u32,
    pub untracked: u32,
    pub conflicts: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GitSnapshot {
    pub registration_id: WorkspaceRegistrationId,
    pub workspace_generation: WorkspaceGeneration,
    pub request_id: GitRequestId,
    pub state: GitInspectionState,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub upstream: Option<String>,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub path_statuses: Vec<GitPathStatus>,
    pub dirty_counts: GitDirtyCounts,
    pub counts_complete: bool,
    pub truncated: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DiffSection {
    pub staged: bool,
    pub path: String,
    pub original_path: Option<String>,
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
    pub binary: bool,
    pub preview: String,
    pub truncated: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UncommittedDiffSnapshot {
    pub registration_id: WorkspaceRegistrationId,
    pub workspace_generation: WorkspaceGeneration,
    pub request_id: GitRequestId,
    pub state: GitInspectionState,
    pub sections: Vec<DiffSection>,
    pub source_bytes: usize,
    pub truncated: bool,
    pub counts_complete: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GitOperation {
    Status,
    Diff,
}

#[derive(Clone, Eq, PartialEq)]
pub struct GitRequest {
    pub registration_id: WorkspaceRegistrationId,
    pub workspace_generation: WorkspaceGeneration,
    pub request_id: GitRequestId,
    pub cwd: PathBuf,
    pub operation: GitOperation,
}

impl std::fmt::Debug for GitRequest {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("GitRequest")
            .field("registration_id", &self.registration_id)
            .field("workspace_generation", &self.workspace_generation)
            .field("request_id", &self.request_id)
            .field("operation", &self.operation)
            .finish_non_exhaustive()
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Error)]
pub enum GitInspectionError {
    #[error("git inspection request is invalid")]
    InvalidRequest,
    #[error("git inspection output is malformed")]
    Malformed,
    #[error("git inspection failed")]
    Failed,
}

/// Executes one fixed Git inspection operation. The child receives no inherited environment or
/// stdin, and only the caller's already-retained canonical workspace path is used as cwd.
pub async fn execute(
    request: GitRequest,
    cancellation: CancellationToken,
) -> Result<GitInspectionResult, GitInspectionError> {
    if !request.cwd.is_absolute() || !request.cwd.is_dir() {
        return Err(GitInspectionError::InvalidRequest);
    }
    match request.operation {
        GitOperation::Status => {
            let outcome = run_command(
                &request,
                status_args(),
                STATUS_DEADLINE,
                STATUS_MAXIMUM_BYTES,
                cancellation,
            )
            .await;
            match outcome {
                CommandOutcome::Cancelled => Ok(GitInspectionResult::Status(empty_snapshot(
                    &request,
                    GitInspectionState::Cancelled,
                ))),
                CommandOutcome::TimedOut => Ok(GitInspectionResult::Status(empty_snapshot(
                    &request,
                    GitInspectionState::TimedOut,
                ))),
                CommandOutcome::Unsupported => Ok(GitInspectionResult::Status(empty_snapshot(
                    &request,
                    GitInspectionState::Unsupported,
                ))),
                CommandOutcome::OutputLimit => {
                    Ok(GitInspectionResult::Status(limited_snapshot(&request)))
                }
                CommandOutcome::Failed(stderr) if not_repository(&stderr) => {
                    Ok(GitInspectionResult::Status(empty_snapshot(
                        &request,
                        GitInspectionState::NotRepository,
                    )))
                }
                CommandOutcome::Failed(_) => Ok(GitInspectionResult::Status(empty_snapshot(
                    &request,
                    GitInspectionState::Failed,
                ))),
                CommandOutcome::Completed { stdout } => Ok(GitInspectionResult::Status(
                    parse_status(&stdout, &request)?,
                )),
            }
        }
        GitOperation::Diff => {
            let outcome = run_command(
                &request,
                diff_args(false),
                DIFF_DEADLINE,
                DIFF_MAXIMUM_BYTES,
                cancellation.clone(),
            )
            .await;
            let unstaged = match outcome {
                CommandOutcome::Cancelled => {
                    return Ok(GitInspectionResult::Diff(empty_diff(
                        &request,
                        GitInspectionState::Cancelled,
                    )));
                }
                CommandOutcome::TimedOut => {
                    return Ok(GitInspectionResult::Diff(empty_diff(
                        &request,
                        GitInspectionState::TimedOut,
                    )));
                }
                CommandOutcome::Unsupported => {
                    return Ok(GitInspectionResult::Diff(empty_diff(
                        &request,
                        GitInspectionState::Unsupported,
                    )));
                }
                CommandOutcome::OutputLimit => {
                    return Ok(GitInspectionResult::Diff(limited_diff(&request)));
                }
                CommandOutcome::Failed(stderr) if not_repository(&stderr) => {
                    return Ok(GitInspectionResult::Diff(empty_diff(
                        &request,
                        GitInspectionState::NotRepository,
                    )));
                }
                CommandOutcome::Failed(_) => {
                    return Ok(GitInspectionResult::Diff(empty_diff(
                        &request,
                        GitInspectionState::Failed,
                    )));
                }
                CommandOutcome::Completed { stdout } => stdout,
            };
            let staged_outcome = run_command(
                &request,
                diff_args(true),
                DIFF_DEADLINE,
                DIFF_MAXIMUM_BYTES.saturating_sub(unstaged.len()),
                cancellation,
            )
            .await;
            let staged = match staged_outcome {
                CommandOutcome::Cancelled => {
                    return Ok(GitInspectionResult::Diff(empty_diff(
                        &request,
                        GitInspectionState::Cancelled,
                    )));
                }
                CommandOutcome::TimedOut => {
                    return Ok(GitInspectionResult::Diff(empty_diff(
                        &request,
                        GitInspectionState::TimedOut,
                    )));
                }
                CommandOutcome::Unsupported => {
                    return Ok(GitInspectionResult::Diff(empty_diff(
                        &request,
                        GitInspectionState::Unsupported,
                    )));
                }
                CommandOutcome::OutputLimit => {
                    return Ok(GitInspectionResult::Diff(limited_diff(&request)));
                }
                CommandOutcome::Failed(stderr) if not_repository(&stderr) => {
                    return Ok(GitInspectionResult::Diff(empty_diff(
                        &request,
                        GitInspectionState::NotRepository,
                    )));
                }
                CommandOutcome::Failed(_) => {
                    return Ok(GitInspectionResult::Diff(empty_diff(
                        &request,
                        GitInspectionState::Failed,
                    )));
                }
                CommandOutcome::Completed { stdout } => stdout,
            };
            let source_bytes = unstaged.len().saturating_add(staged.len());
            let mut all = parse_numstat_and_diff(&unstaged, false)?;
            all.extend(parse_numstat_and_diff(&staged, true)?);
            Ok(GitInspectionResult::Diff(build_diff(
                &request,
                all,
                source_bytes,
            )))
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GitInspectionResult {
    Status(GitSnapshot),
    Diff(UncommittedDiffSnapshot),
}

fn status_args() -> Vec<&'static str> {
    vec![
        "--no-pager",
        "-c",
        "core.quotepath=false",
        "-c",
        "color.ui=false",
        "-c",
        "core.pager=cat",
        "-c",
        "core.hooksPath=/dev/null",
        "--no-optional-locks",
        "status",
        "--porcelain=v2",
        "--branch",
        "-z",
    ]
}

fn diff_args(staged: bool) -> Vec<&'static str> {
    let mut args = vec![
        "--no-pager",
        "-c",
        "core.quotepath=false",
        "-c",
        "color.ui=false",
        "-c",
        "core.pager=cat",
        "-c",
        "core.hooksPath=/dev/null",
        "--no-optional-locks",
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--numstat",
        "-z",
    ];
    if staged {
        args.push("--cached");
    }
    args
}

async fn run_command(
    request: &GitRequest,
    args: Vec<&'static str>,
    deadline: Duration,
    output_limit: usize,
    cancellation: CancellationToken,
) -> CommandOutcome {
    let mut command = Command::new("/usr/bin/git");
    command
        .args(args)
        .current_dir(&request.cwd)
        .env_clear()
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_PAGER", "cat")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(false);
    #[cfg(unix)]
    command.as_std_mut().process_group(0);
    let Ok(mut child) = command.spawn() else {
        return CommandOutcome::Unsupported;
    };
    let Some(stdout) = child.stdout.take() else {
        return CommandOutcome::Unsupported;
    };
    let Some(stderr) = child.stderr.take() else {
        return CommandOutcome::Unsupported;
    };
    let stdout_task = tokio::spawn(read_bound(stdout, output_limit));
    let stderr_task = tokio::spawn(read_bound(stderr, 64 * 1024));
    let waited = tokio::select! {
        result = child.wait() => result,
        _ = cancellation.cancelled() => {
            let _ = terminate_and_reap(&mut child).await;
            let _ = stdout_task.await;
            let _ = stderr_task.await;
            return CommandOutcome::Cancelled;
        }
        _ = tokio::time::sleep(deadline) => {
            let _ = terminate_and_reap(&mut child).await;
            let _ = stdout_task.await;
            let _ = stderr_task.await;
            return CommandOutcome::TimedOut;
        }
    };
    let stdout_result = stdout_task.await.ok();
    let stderr = stderr_task
        .await
        .ok()
        .and_then(Result::ok)
        .unwrap_or_default();
    let Ok(status) = waited else {
        return CommandOutcome::Failed(stderr);
    };
    let stdout = match stdout_result {
        Some(Ok(stdout)) => stdout,
        Some(Err(())) => return CommandOutcome::OutputLimit,
        None => return CommandOutcome::Failed(stderr),
    };
    if !status.success() {
        return CommandOutcome::Failed(stderr);
    }
    CommandOutcome::Completed { stdout }
}

async fn terminate_and_reap(child: &mut Child) -> bool {
    let _ = child.start_kill();
    tokio::time::timeout(Duration::from_secs(2), child.wait())
        .await
        .is_ok()
}

enum CommandOutcome {
    Completed { stdout: Vec<u8> },
    Failed(Vec<u8>),
    Unsupported,
    OutputLimit,
    TimedOut,
    Cancelled,
}

async fn read_bound<R>(mut reader: R, maximum: usize) -> Result<Vec<u8>, ()>
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut output = Vec::new();
    let mut buffer = [0_u8; 16 * 1024];
    loop {
        let count = reader.read(&mut buffer).await.map_err(|_| ())?;
        if count == 0 {
            return Ok(output);
        }
        if output.len().saturating_add(count) > maximum {
            return Err(());
        }
        output.extend_from_slice(&buffer[..count]);
    }
}

fn not_repository(stderr: &[u8]) -> bool {
    let text = String::from_utf8_lossy(stderr);
    text.contains("not a git repository")
}

fn empty_snapshot(request: &GitRequest, state: GitInspectionState) -> GitSnapshot {
    GitSnapshot {
        registration_id: request.registration_id,
        workspace_generation: request.workspace_generation,
        request_id: request.request_id,
        state,
        branch: None,
        head: None,
        upstream: None,
        ahead: None,
        behind: None,
        path_statuses: Vec::new(),
        dirty_counts: GitDirtyCounts::default(),
        counts_complete: false,
        truncated: false,
    }
}

fn empty_diff(request: &GitRequest, state: GitInspectionState) -> UncommittedDiffSnapshot {
    UncommittedDiffSnapshot {
        registration_id: request.registration_id,
        workspace_generation: request.workspace_generation,
        request_id: request.request_id,
        state,
        sections: Vec::new(),
        source_bytes: 0,
        truncated: false,
        counts_complete: false,
    }
}

fn limited_snapshot(request: &GitRequest) -> GitSnapshot {
    let mut snapshot = empty_snapshot(request, GitInspectionState::Failed);
    snapshot.truncated = true;
    snapshot
}

fn limited_diff(request: &GitRequest) -> UncommittedDiffSnapshot {
    let mut snapshot = empty_diff(request, GitInspectionState::Failed);
    snapshot.truncated = true;
    snapshot
}

pub fn parse_status(bytes: &[u8], request: &GitRequest) -> Result<GitSnapshot, GitInspectionError> {
    if bytes.len() > STATUS_MAXIMUM_BYTES {
        return Err(GitInspectionError::Malformed);
    }
    let mut branch = None;
    let mut head = None;
    let mut upstream = None;
    let mut ahead = None;
    let mut behind = None;
    let mut paths = Vec::new();
    let mut counts = GitDirtyCounts::default();
    let mut truncated = false;
    let mut fields = bytes.split(|byte| *byte == 0);
    while let Some(field) = fields.next() {
        if field.is_empty() {
            continue;
        }
        let text = std::str::from_utf8(field).map_err(|_| GitInspectionError::Malformed)?;
        if let Some(header) = text.strip_prefix("# ") {
            let Some((key, value)) = header.split_once(' ') else {
                continue;
            };
            match key {
                "branch.oid" => head = Some(value.to_owned()),
                "branch.head" => branch = Some(value.to_owned()),
                "branch.upstream" => upstream = Some(value.to_owned()),
                "branch.ab" => {
                    let mut values = value.split_whitespace();
                    ahead = values
                        .next()
                        .and_then(|value| value.strip_prefix('+'))
                        .and_then(|value| value.parse().ok());
                    behind = values
                        .next()
                        .and_then(|value| value.strip_prefix('-'))
                        .and_then(|value| value.parse().ok());
                }
                _ => {}
            }
            continue;
        }
        if paths.len() >= STATUS_MAXIMUM_RECORDS {
            truncated = true;
            continue;
        }
        let kind = text
            .as_bytes()
            .first()
            .copied()
            .ok_or(GitInspectionError::Malformed)?;
        let path_text = match kind {
            b'?' => {
                let path = text
                    .strip_prefix("? ")
                    .ok_or(GitInspectionError::Malformed)?;
                counts.untracked = counts.untracked.saturating_add(1);
                GitPathStatus {
                    path: path.into(),
                    original_path: None,
                    index_status: '?',
                    worktree_status: '?',
                    kind: GitPathKind::Untracked,
                }
            }
            b'1' | b'2' | b'u' => {
                let minimum_fields = match kind {
                    b'1' => 9,
                    b'2' => 10,
                    b'u' => 11,
                    _ => unreachable!(),
                };
                let path_index = minimum_fields - 1;
                let mut tokens = text.splitn(path_index + 1, ' ');
                let mut parts = Vec::with_capacity(path_index);
                for _ in 0..path_index {
                    parts.push(tokens.next().ok_or(GitInspectionError::Malformed)?);
                }
                let path = tokens.next().ok_or(GitInspectionError::Malformed)?;
                if path.is_empty() {
                    return Err(GitInspectionError::Malformed);
                }
                let xy = parts[1].as_bytes();
                if xy.len() < 2 {
                    return Err(GitInspectionError::Malformed);
                }
                let original_path = if kind == b'2' {
                    let original = fields.next().ok_or(GitInspectionError::Malformed)?;
                    Some(
                        std::str::from_utf8(original)
                            .map_err(|_| GitInspectionError::Malformed)?
                            .to_owned(),
                    )
                } else {
                    None
                };
                let submodule = parts[2].starts_with('S');
                let conflict = kind == b'u' || xy.contains(&b'U');
                let renamed = kind == b'2';
                if xy[0] != b'.' {
                    counts.staged = counts.staged.saturating_add(1);
                }
                if xy[1] != b'.' {
                    counts.unstaged = counts.unstaged.saturating_add(1);
                }
                if conflict {
                    counts.conflicts = counts.conflicts.saturating_add(1);
                }
                GitPathStatus {
                    path: path.to_owned(),
                    original_path,
                    index_status: xy[0] as char,
                    worktree_status: xy[1] as char,
                    kind: if submodule {
                        GitPathKind::Submodule
                    } else if conflict {
                        GitPathKind::Conflict
                    } else if renamed {
                        GitPathKind::Renamed
                    } else {
                        GitPathKind::Changed
                    },
                }
            }
            b'!' => continue,
            _ => continue,
        };
        paths.push(path_text);
    }
    let state = if branch.as_deref() == Some("(detached)") {
        GitInspectionState::Detached
    } else if head.as_deref().is_some_and(|value| {
        value == "(initial)" || (!value.is_empty() && value.chars().all(|c| c == '0'))
    }) {
        GitInspectionState::Unborn
    } else {
        GitInspectionState::Ready
    };
    Ok(GitSnapshot {
        registration_id: request.registration_id,
        workspace_generation: request.workspace_generation,
        request_id: request.request_id,
        state,
        branch,
        head,
        upstream,
        ahead,
        behind,
        path_statuses: paths,
        dirty_counts: counts,
        counts_complete: !truncated,
        truncated,
    })
}

fn parse_numstat_and_diff(
    bytes: &[u8],
    staged: bool,
) -> Result<Vec<DiffSection>, GitInspectionError> {
    if bytes.len() > DIFF_MAXIMUM_BYTES {
        return Err(GitInspectionError::Malformed);
    }
    let mut sections = Vec::new();
    let mut fields = bytes.split(|byte| *byte == 0);
    while let Some(field) = fields.next() {
        if field.is_empty() {
            continue;
        }
        let text = std::str::from_utf8(field).map_err(|_| GitInspectionError::Malformed)?;
        let mut parts = text.splitn(3, '\t');
        let additions = parts.next().and_then(|value| value.parse().ok());
        let deletions = parts.next().and_then(|value| value.parse().ok());
        let path_field = parts.next().unwrap_or("");
        let (path, original_path) = if path_field.is_empty() {
            // `--numstat -z` emits rename/copy paths as two following NUL records.
            let original = fields.next().ok_or(GitInspectionError::Malformed)?;
            let destination = fields.next().ok_or(GitInspectionError::Malformed)?;
            let original =
                std::str::from_utf8(original).map_err(|_| GitInspectionError::Malformed)?;
            let destination =
                std::str::from_utf8(destination).map_err(|_| GitInspectionError::Malformed)?;
            if original.is_empty() || destination.is_empty() {
                return Err(GitInspectionError::Malformed);
            }
            (destination.to_owned(), Some(original.to_owned()))
        } else {
            (path_field.to_owned(), parts.next().map(str::to_owned))
        };
        sections.push(DiffSection {
            staged,
            path,
            original_path,
            additions,
            deletions,
            binary: additions.is_none() || deletions.is_none(),
            preview: if additions.is_none() || deletions.is_none() {
                "[binary diff]".to_owned()
            } else {
                String::new()
            },
            truncated: false,
        });
        if sections.len() >= DIFF_MAXIMUM_LINES {
            break;
        }
    }
    Ok(sections)
}

fn build_diff(
    request: &GitRequest,
    mut sections: Vec<DiffSection>,
    source_bytes: usize,
) -> UncommittedDiffSnapshot {
    let truncated = source_bytes > DIFF_MAXIMUM_BYTES || sections.len() >= DIFF_MAXIMUM_LINES;
    if sections.len() > DIFF_MAXIMUM_LINES {
        sections.truncate(DIFF_MAXIMUM_LINES);
    }
    UncommittedDiffSnapshot {
        registration_id: request.registration_id,
        workspace_generation: request.workspace_generation,
        request_id: request.request_id,
        state: GitInspectionState::Ready,
        source_bytes,
        sections,
        truncated,
        counts_complete: !truncated,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> GitRequest {
        GitRequest {
            registration_id: WorkspaceRegistrationId::new(),
            workspace_generation: WorkspaceGeneration::new(),
            request_id: GitRequestId::new(),
            cwd: PathBuf::from("/tmp"),
            operation: GitOperation::Status,
        }
    }

    #[test]
    fn parses_branch_status_and_unicode_paths() {
        let request = request();
        let fixture = b"# branch.oid abc\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -1\x001 .M N... 100644 100644 100644 abc def path\xe2\x98\x83\0? new\xe2\x98\x83\0";
        let snapshot = parse_status(fixture, &request).unwrap();
        assert_eq!(snapshot.state, GitInspectionState::Ready);
        assert_eq!(snapshot.ahead, Some(2));
        assert_eq!(snapshot.behind, Some(1));
        assert_eq!(snapshot.path_statuses.len(), 2);
    }

    #[test]
    fn detached_and_unborn_states_are_explicit() {
        let request = request();
        let detached =
            parse_status(b"# branch.oid abc\0# branch.head (detached)\0", &request).unwrap();
        assert_eq!(detached.state, GitInspectionState::Detached);
        let unborn =
            parse_status(b"# branch.oid (initial)\0# branch.head main\0", &request).unwrap();
        assert_eq!(unborn.state, GitInspectionState::Unborn);
    }

    #[test]
    fn unknown_headers_are_ignored_but_malformed_records_fail() {
        let request = request();
        assert!(parse_status(b"# optional.future value\0", &request).is_ok());
        assert!(parse_status(b"1 broken\0", &request).is_err());
    }

    #[test]
    fn parses_rename_and_submodule_records() {
        let request = request();
        let fixture = b"2 R. N... 100644 100644 100644 abc def R100 new\0old\0"
            .iter()
            .copied()
            .chain(
                b"1 M. S... 160000 160000 160000 abc def submodule\0"
                    .iter()
                    .copied(),
            )
            .collect::<Vec<_>>();
        let snapshot = parse_status(&fixture, &request).unwrap();
        assert_eq!(snapshot.path_statuses[0].kind, GitPathKind::Renamed);
        assert_eq!(
            snapshot.path_statuses[0].original_path.as_deref(),
            Some("old")
        );
        assert_eq!(snapshot.path_statuses[1].kind, GitPathKind::Submodule);
    }

    #[test]
    fn parses_numstat_rename_and_binary_markers() {
        let rename = b"0\t0\t\0old name\0new name\0";
        let sections = parse_numstat_and_diff(rename, true).unwrap();
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].path, "new name");
        assert_eq!(sections[0].original_path.as_deref(), Some("old name"));

        let binary = parse_numstat_and_diff(b"-\t-\timage.bin\0", false).unwrap();
        assert!(binary[0].binary);
        assert_eq!(binary[0].preview, "[binary diff]");
    }

    #[test]
    fn status_bound_is_rejected() {
        let request = request();
        assert!(parse_status(&vec![b'x'; STATUS_MAXIMUM_BYTES + 1], &request).is_err());
    }

    #[test]
    fn command_arguments_disable_mutating_or_external_behaviors() {
        let status = status_args();
        assert!(status.contains(&"--porcelain=v2"));
        assert!(status.contains(&"--no-pager"));
        assert!(status.contains(&"-z"));
        let diff = diff_args(true);
        assert!(diff.contains(&"--no-ext-diff"));
        assert!(diff.contains(&"--no-textconv"));
        assert!(diff.contains(&"--cached"));
    }
}
