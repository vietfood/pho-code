use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[cfg(unix)]
use std::os::fd::AsRawFd as _;
#[cfg(unix)]
use std::os::unix::fs::MetadataExt as _;
#[cfg(unix)]
use std::os::unix::process::{CommandExt as _, ExitStatusExt as _};

use serde::Serialize;
use sha2::{Digest as _, Sha256};
use tokio::io::{AsyncRead, AsyncReadExt as _};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

use crate::agent::types::{ToolCallId, TurnId};

use super::ArtifactWriter;
use super::output::{ArtifactCommit, ArtifactPurpose, ArtifactRequest};
use super::workspace::{Workspace, WorkspaceError};

pub const MAXIMUM_COMMAND_BYTES: usize = 64 * 1024;
pub const MAXIMUM_TIMEOUT_SECONDS: u64 = 300;
pub const MAXIMUM_STREAM_BYTES: usize = 1024 * 1024;
pub const MAXIMUM_PREVIEW_BYTES: usize = 8 * 1024;
const TERMINATION_GRACE: Duration = Duration::from_millis(500);
const FORCE_REAP_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Debug)]
pub struct ShellRequest {
    pub command: String,
    pub cwd: String,
    pub timeout: Duration,
    workspace: Workspace,
    #[cfg(unix)]
    cwd_identity: (u64, u64),
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct ShellResult {
    pub exit_code: Option<i32>,
    pub signal: Option<i32>,
    pub timed_out: bool,
    pub cancelled: bool,
    pub duration_millis: u128,
    pub stdout: String,
    pub stderr: String,
    pub stdout_lossy: bool,
    pub stderr_lossy: bool,
    pub stdout_original_bytes: usize,
    pub stderr_original_bytes: usize,
    pub stdout_omitted_bytes: usize,
    pub stderr_omitted_bytes: usize,
    pub stdout_artifact: Option<ShellArtifact>,
    pub stderr_artifact: Option<ShellArtifact>,
    pub output_artifact_refused: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct ShellArtifact {
    pub artifact_id: crate::agent::types::ArtifactId,
    pub retained_bytes: usize,
    pub sha256: String,
    pub truncated: bool,
}

impl ShellResult {
    pub fn model_content(&self) -> Result<String, ShellError> {
        serde_json::to_string(self).map_err(|_| ShellError::Internal)
    }
}

pub fn validate(
    workspace: &Workspace,
    command: String,
    cwd: Option<String>,
    timeout_seconds: u64,
) -> Result<(ShellRequest, String, String), ShellError> {
    if command.is_empty()
        || command.len() > MAXIMUM_COMMAND_BYTES
        || command.as_bytes().contains(&0)
    {
        return Err(ShellError::InvalidArguments);
    }
    if timeout_seconds == 0 || timeout_seconds > MAXIMUM_TIMEOUT_SECONDS {
        return Err(ShellError::InvalidArguments);
    }
    reject_permanent_deletion(&command)?;
    let relative_cwd = if let Some(cwd) = cwd { cwd } else { ".".into() };
    let (_, cwd_directory) = workspace
        .open_directory(&relative_cwd)
        .map_err(ShellError::Workspace)?;
    #[cfg(unix)]
    let cwd_identity = {
        let metadata = cwd_directory
            .metadata()
            .map_err(|_| ShellError::InvalidWorkingDirectory)?;
        (metadata.dev(), metadata.ino())
    };
    let digest = format!(
        "{:x}",
        Sha256::digest(format!("shell\0{command}\0{relative_cwd}\0{timeout_seconds}").as_bytes())
    );
    let displayed_command = serde_json::to_string(&command).map_err(|_| ShellError::Internal)?;
    let displayed_cwd = serde_json::to_string(&relative_cwd).map_err(|_| ShellError::Internal)?;
    let summary = format!(
        "Run exact command {displayed_command} from workspace directory {displayed_cwd} with a {timeout_seconds}s timeout. This approved shell is not a sandbox and runs with the user's account permissions."
    );
    Ok((
        ShellRequest {
            command,
            cwd: relative_cwd,
            timeout: Duration::from_secs(timeout_seconds),
            workspace: workspace.clone(),
            #[cfg(unix)]
            cwd_identity,
        },
        digest,
        summary,
    ))
}

pub async fn execute(
    request: &ShellRequest,
    turn_id: TurnId,
    tool_call_id: ToolCallId,
    artifacts: Arc<dyn ArtifactWriter>,
    cancellation: CancellationToken,
) -> Result<ShellResult, ShellError> {
    if cancellation.is_cancelled() {
        return Err(ShellError::Cancelled);
    }
    let started = Instant::now();
    let (_, cwd) = request
        .workspace
        .open_directory(&request.cwd)
        .map_err(ShellError::Workspace)?;
    #[cfg(unix)]
    {
        let metadata = cwd
            .metadata()
            .map_err(|_| ShellError::InvalidWorkingDirectory)?;
        if (metadata.dev(), metadata.ino()) != request.cwd_identity {
            return Err(ShellError::WorkingDirectoryChanged);
        }
    }
    #[cfg(not(unix))]
    let cwd_path = request
        .workspace
        .resolve_constraint(Some(&request.cwd))
        .map_err(ShellError::Workspace)?
        .to_string_lossy()
        .into_owned();
    let mut command = Command::new("/bin/zsh");
    command
        .arg("-f")
        .arg("-c")
        .arg(&request.command)
        .env_clear()
        .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
        .env("LC_ALL", "C")
        .env("PAGER", "cat")
        .env("GIT_PAGER", "cat")
        .env("NO_COLOR", "1")
        .env("TMPDIR", "/tmp")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(false);
    #[cfg(not(unix))]
    command.current_dir(cwd_path);
    #[cfg(unix)]
    {
        let cwd_descriptor = cwd.as_raw_fd();
        // SAFETY: the descriptor remains open until spawn completes; the closure invokes only
        // async-signal-safe `fchdir` before exec in the child.
        unsafe {
            command.as_std_mut().pre_exec(move || {
                if libc::fchdir(cwd_descriptor) == 0 {
                    Ok(())
                } else {
                    Err(std::io::Error::last_os_error())
                }
            });
        }
        command.as_std_mut().process_group(0);
    }
    let mut child = command.spawn().map_err(|_| ShellError::SpawnFailed)?;
    drop(cwd);
    let process_group = child.id().ok_or(ShellError::SpawnFailed)? as i32;
    let stdout = child.stdout.take().ok_or(ShellError::SpawnFailed)?;
    let stderr = child.stderr.take().ok_or(ShellError::SpawnFailed)?;
    let stdout_task = tokio::spawn(capture(stdout));
    let stderr_task = tokio::spawn(capture(stderr));

    enum End {
        Exited(std::process::ExitStatus),
        Cancelled(std::process::ExitStatus),
        TimedOut(std::process::ExitStatus),
    }
    let end = tokio::select! {
        status = child.wait() => End::Exited(status.map_err(|_| ShellError::WaitFailed)?),
        _ = cancellation.cancelled() => {
            End::Cancelled(terminate_and_reap(&mut child, process_group).await?)
        }
        _ = tokio::time::sleep(request.timeout) => {
            End::TimedOut(terminate_and_reap(&mut child, process_group).await?)
        }
    };
    cleanup_remaining_group(process_group).await?;
    let stdout = stdout_task.await.map_err(|_| ShellError::OutputFailed)??;
    let stderr = stderr_task.await.map_err(|_| ShellError::OutputFailed)??;
    let (status, cancelled, timed_out) = match end {
        End::Exited(status) => (status, false, false),
        End::Cancelled(status) => (status, true, false),
        End::TimedOut(status) => (status, false, true),
    };

    let (stdout_preview, stdout_omitted) = preview(&stdout);
    let (stderr_preview, stderr_omitted) = preview(&stderr);
    let (stdout_text, stdout_lossy) = lossy_text(stdout_preview);
    let (stderr_text, stderr_lossy) = lossy_text(stderr_preview);
    let stdout_artifact = write_output_artifact(
        artifacts.as_ref(),
        turn_id,
        tool_call_id,
        "shell-stdout",
        &stdout,
    );
    let stderr_artifact = write_output_artifact(
        artifacts.as_ref(),
        turn_id,
        tool_call_id,
        "shell-stderr",
        &stderr,
    );
    let artifact_refused = stdout_artifact.is_err() || stderr_artifact.is_err();
    Ok(ShellResult {
        exit_code: status.code(),
        #[cfg(unix)]
        signal: status.signal(),
        #[cfg(not(unix))]
        signal: None,
        timed_out,
        cancelled,
        duration_millis: started.elapsed().as_millis(),
        stdout: stdout_text,
        stderr: stderr_text,
        stdout_lossy,
        stderr_lossy,
        stdout_original_bytes: stdout.total,
        stderr_original_bytes: stderr.total,
        stdout_omitted_bytes: stdout_omitted,
        stderr_omitted_bytes: stderr_omitted,
        stdout_artifact: stdout_artifact.unwrap_or(None),
        stderr_artifact: stderr_artifact.unwrap_or(None),
        output_artifact_refused: artifact_refused,
    })
}

fn write_output_artifact(
    artifacts: &dyn ArtifactWriter,
    turn_id: TurnId,
    tool_call_id: ToolCallId,
    classification: &'static str,
    capture: &Capture,
) -> Result<Option<ShellArtifact>, ()> {
    if capture.total <= MAXIMUM_PREVIEW_BYTES && std::str::from_utf8(&capture.bytes).is_ok() {
        return Ok(None);
    }
    let source_truncated = capture.total > capture.bytes.len();
    artifacts
        .write(ArtifactRequest {
            turn_id,
            tool_call_id,
            bytes: capture.bytes.clone(),
            classification,
            purpose: ArtifactPurpose::ToolOutput,
            all_or_nothing: false,
            maximum_bytes: MAXIMUM_STREAM_BYTES,
        })
        .map(|commit| Some(shell_artifact(commit, source_truncated)))
        .map_err(|_| ())
}

fn shell_artifact(commit: ArtifactCommit, source_truncated: bool) -> ShellArtifact {
    ShellArtifact {
        artifact_id: commit.artifact_id,
        retained_bytes: commit.byte_count,
        sha256: commit.sha256,
        truncated: source_truncated || commit.truncated,
    }
}

struct Capture {
    bytes: Vec<u8>,
    tail: Vec<u8>,
    total: usize,
}

async fn capture(mut reader: impl AsyncRead + Unpin) -> Result<Capture, ShellError> {
    let mut bytes = Vec::new();
    let mut tail = Vec::new();
    let mut total = 0_usize;
    let mut buffer = [0_u8; 8192];
    loop {
        let count = reader
            .read(&mut buffer)
            .await
            .map_err(|_| ShellError::OutputFailed)?;
        if count == 0 {
            break;
        }
        total = total.saturating_add(count);
        let remaining = MAXIMUM_STREAM_BYTES.saturating_sub(bytes.len());
        bytes.extend_from_slice(&buffer[..count.min(remaining)]);
        tail.extend_from_slice(&buffer[..count]);
        if tail.len() > MAXIMUM_PREVIEW_BYTES / 2 {
            let excess = tail.len() - MAXIMUM_PREVIEW_BYTES / 2;
            tail.drain(..excess);
        }
    }
    Ok(Capture { bytes, tail, total })
}

fn preview(capture: &Capture) -> (Vec<u8>, usize) {
    let preview = if capture.total <= MAXIMUM_PREVIEW_BYTES {
        capture.bytes.clone()
    } else {
        let head = MAXIMUM_PREVIEW_BYTES / 2;
        let mut preview = capture.bytes[..head.min(capture.bytes.len())].to_vec();
        preview.extend_from_slice(&capture.tail);
        preview
    };
    (
        preview,
        capture
            .total
            .saturating_sub(MAXIMUM_PREVIEW_BYTES.min(capture.bytes.len())),
    )
}

fn lossy_text(bytes: Vec<u8>) -> (String, bool) {
    match String::from_utf8(bytes) {
        Ok(text) => (text, false),
        Err(error) => (String::from_utf8_lossy(error.as_bytes()).into_owned(), true),
    }
}

async fn terminate_and_reap(
    child: &mut tokio::process::Child,
    process_group: i32,
) -> Result<std::process::ExitStatus, ShellError> {
    signal_group(process_group, libc::SIGTERM)?;
    tokio::time::sleep(TERMINATION_GRACE).await;
    if child
        .try_wait()
        .map_err(|_| ShellError::WaitFailed)?
        .is_none()
    {
        signal_group(process_group, libc::SIGKILL)?;
    }
    tokio::time::timeout(FORCE_REAP_TIMEOUT, child.wait())
        .await
        .map_err(|_| ShellError::OutcomeUncertain)?
        .map_err(|_| ShellError::WaitFailed)
}

async fn cleanup_remaining_group(process_group: i32) -> Result<(), ShellError> {
    if !process_group_exists(process_group)? {
        return Ok(());
    }
    signal_group(process_group, libc::SIGTERM)?;
    tokio::time::sleep(TERMINATION_GRACE).await;
    if process_group_exists(process_group)? {
        signal_group(process_group, libc::SIGKILL)?;
    }
    let deadline = Instant::now() + FORCE_REAP_TIMEOUT;
    while process_group_exists(process_group)? {
        if Instant::now() >= deadline {
            return Err(ShellError::OutcomeUncertain);
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    Ok(())
}

fn process_group_exists(process_group: i32) -> Result<bool, ShellError> {
    #[cfg(unix)]
    {
        // SAFETY: signal zero checks for a process group without delivering a signal.
        let result = unsafe { libc::kill(-process_group, 0) };
        if result == 0 {
            return Ok(true);
        }
        match std::io::Error::last_os_error().raw_os_error() {
            Some(libc::ESRCH) => Ok(false),
            Some(libc::EPERM) => Ok(true),
            _ => Err(ShellError::OutcomeUncertain),
        }
    }
    #[cfg(not(unix))]
    {
        let _ = process_group;
        Err(ShellError::OutcomeUncertain)
    }
}

fn signal_group(process_group: i32, signal: i32) -> Result<(), ShellError> {
    #[cfg(unix)]
    {
        // SAFETY: a negative PID targets the child-owned process group created at spawn.
        let result = unsafe { libc::kill(-process_group, signal) };
        if result == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH) {
            Ok(())
        } else {
            Err(ShellError::OutcomeUncertain)
        }
    }
    #[cfg(not(unix))]
    {
        let _ = (process_group, signal);
        Err(ShellError::OutcomeUncertain)
    }
}

fn reject_permanent_deletion(command: &str) -> Result<(), ShellError> {
    let tokens = tokenize(command)?;
    if tokens.iter().any(|token| {
        matches!(
            token.text.as_str(),
            "if" | "then"
                | "else"
                | "elif"
                | "fi"
                | "while"
                | "until"
                | "for"
                | "do"
                | "done"
                | "case"
                | "esac"
                | "function"
                | "{"
                | "}"
                | "eval"
                | "source"
                | "bash"
                | "sh"
                | "zsh"
                | "time"
                | "-exec"
                | "-execdir"
                | "-delete"
        )
    }) {
        return Err(ShellError::UnclassifiableCommand);
    }
    let mut executable = true;
    let mut wrapper = false;
    let mut index = 0_usize;
    while index < tokens.len() {
        let token = &tokens[index];
        if token.operator {
            if matches!(
                token.text.as_str(),
                ";" | "&&" | "||" | "|" | "&" | "(" | ")"
            ) {
                executable = true;
                wrapper = false;
            }
            if matches!(token.text.as_str(), "<" | ">" | "<<" | ">>") {
                if matches!(token.text.as_str(), "<<") || index + 1 >= tokens.len() {
                    return Err(ShellError::UnclassifiableCommand);
                }
                index += 2;
                continue;
            }
            index += 1;
            continue;
        }
        if executable
            && token.text.bytes().all(|byte| byte.is_ascii_digit())
            && tokens
                .get(index + 1)
                .is_some_and(|next| next.operator && matches!(next.text.as_str(), "<" | ">" | ">>"))
        {
            index += 1;
            continue;
        }
        if !executable && !wrapper {
            index += 1;
            continue;
        }
        if token.text.contains(['$', '`']) {
            return Err(ShellError::UnclassifiableCommand);
        }
        let basename = PathBuf::from(&token.text)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(&token.text)
            .to_owned();
        if matches!(basename.as_str(), "bash" | "sh" | "zsh" | "eval" | "source") {
            return Err(ShellError::UnclassifiableCommand);
        }
        if matches!(
            basename.as_str(),
            "rm" | "unlink" | "rmdir" | "srm" | "shred"
        ) {
            return Err(ShellError::PermanentDeletionRejected);
        }
        if executable && is_assignment_prefix(&token.text) {
            index += 1;
            continue;
        }
        if matches!(
            basename.as_str(),
            "sudo" | "command" | "env" | "xargs" | "exec" | "noglob" | "nocorrect" | "builtin"
        ) {
            wrapper = true;
            executable = false;
            index += 1;
            continue;
        }
        if wrapper && (token.text.starts_with('-') || token.text.contains('=')) {
            index += 1;
            continue;
        }
        executable = false;
        wrapper = false;
        index += 1;
    }
    Ok(())
}

fn is_assignment_prefix(token: &str) -> bool {
    let Some((name, _)) = token.split_once('=') else {
        return false;
    };
    let mut bytes = name.bytes();
    bytes
        .next()
        .is_some_and(|byte| byte == b'_' || byte.is_ascii_alphabetic())
        && bytes.all(|byte| byte == b'_' || byte.is_ascii_alphanumeric())
}

struct Token {
    text: String,
    operator: bool,
}

fn tokenize(input: &str) -> Result<Vec<Token>, ShellError> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut chars = input.chars().peekable();
    let mut quote = None;
    while let Some(character) = chars.next() {
        if let Some(delimiter) = quote {
            if character == delimiter {
                quote = None;
            } else if character == '\\' && delimiter == '"' {
                current.push(chars.next().ok_or(ShellError::UnclassifiableCommand)?);
            } else {
                current.push(character);
            }
            continue;
        }
        match character {
            '\'' | '"' => quote = Some(character),
            '\\' => current.push(chars.next().ok_or(ShellError::UnclassifiableCommand)?),
            ' ' | '\t' | '\r' | '\n' => push_word(&mut tokens, &mut current),
            ';' | '|' | '&' | '(' | ')' | '<' | '>' => {
                push_word(&mut tokens, &mut current);
                let mut operator = character.to_string();
                if matches!(character, '|' | '&' | '<' | '>') && chars.peek() == Some(&character) {
                    operator.push(chars.next().unwrap());
                }
                tokens.push(Token {
                    text: operator,
                    operator: true,
                });
            }
            _ => current.push(character),
        }
    }
    if quote.is_some() {
        return Err(ShellError::UnclassifiableCommand);
    }
    push_word(&mut tokens, &mut current);
    Ok(tokens)
}

fn push_word(tokens: &mut Vec<Token>, current: &mut String) {
    if !current.is_empty() {
        tokens.push(Token {
            text: std::mem::take(current),
            operator: false,
        });
    }
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum ShellError {
    #[error("shell arguments are invalid")]
    InvalidArguments,
    #[error(transparent)]
    Workspace(WorkspaceError),
    #[error("shell working directory is invalid")]
    InvalidWorkingDirectory,
    #[error("shell working directory changed after approval")]
    WorkingDirectoryChanged,
    #[error("permanent deletion is rejected; use /usr/bin/trash")]
    PermanentDeletionRejected,
    #[error("shell command cannot be classified safely")]
    UnclassifiableCommand,
    #[error("shell process could not start")]
    SpawnFailed,
    #[error("shell was cancelled before execution")]
    Cancelled,
    #[error("shell process wait failed")]
    WaitFailed,
    #[error("shell output capture failed")]
    OutputFailed,
    #[error("shell outcome is uncertain")]
    OutcomeUncertain,
    #[error("internal shell invariant failed")]
    Internal,
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::agent::types::ArtifactId;
    use crate::tools::output::ArtifactCommit;

    #[derive(Default)]
    struct MemoryArtifacts(Mutex<Vec<ArtifactRequest>>);

    struct RejectingArtifacts;

    impl ArtifactWriter for RejectingArtifacts {
        fn write(&self, _: ArtifactRequest) -> Result<ArtifactCommit, &'static str> {
            Err("refused")
        }
    }

    impl ArtifactWriter for MemoryArtifacts {
        fn write(&self, request: ArtifactRequest) -> Result<ArtifactCommit, &'static str> {
            let commit = ArtifactCommit {
                artifact_id: ArtifactId::new(),
                byte_count: request.bytes.len(),
                sha256: format!("{:x}", Sha256::digest(&request.bytes)),
                truncated: false,
            };
            self.0.lock().unwrap().push(request);
            Ok(commit)
        }
    }

    #[test]
    fn rejects_direct_absolute_and_wrapped_permanent_deletion() {
        for command in [
            "rm file",
            "/bin/rm file",
            "echo ok && unlink file",
            "sudo -n /bin/rmdir empty",
            "env FOO=bar shred file",
            "FOO=bar rm file",
            ">log /bin/rm file",
            "noglob rm file",
        ] {
            assert_eq!(
                reject_permanent_deletion(command),
                Err(ShellError::PermanentDeletionRejected),
                "{command}"
            );
        }
        assert!(reject_permanent_deletion("printf '%s\\n' rm").is_ok());
        assert!(reject_permanent_deletion("/usr/bin/trash file").is_ok());
        for command in [
            "if true; then rm file; fi",
            "eval 'rm file'",
            "zsh -c 'rm file'",
            "f() { rm file; }; f",
            "find . -name victim -exec rm {} ;",
            "find . -name victim -delete",
        ] {
            assert_eq!(
                reject_permanent_deletion(command),
                Err(ShellError::UnclassifiableCommand),
                "{command}"
            );
        }
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        assert!(matches!(
            validate(&workspace, "pwd".into(), Some("missing".into()), 5),
            Err(ShellError::Workspace(WorkspaceError::Missing))
        ));
    }

    #[tokio::test]
    async fn captures_both_pipes_and_filters_environment() {
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let (request, _, _) = validate(
            &workspace,
            "printf out; printf err >&2; test -z \"$DEEPSEEK_API_KEY\"; test -z \"$HOME\"; test -z \"$ZDOTDIR\"".into(),
            None,
            5,
        )
        .unwrap();
        let result = execute(
            &request,
            TurnId::new(),
            ToolCallId::new(),
            Arc::new(MemoryArtifacts::default()),
            CancellationToken::new(),
        )
        .await
        .unwrap();
        assert_eq!(result.exit_code, Some(0));
        assert_eq!(result.stdout, "out");
        assert_eq!(result.stderr, "err");
    }

    #[tokio::test]
    async fn cwd_replacement_after_approval_is_rejected() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("work")).unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let (request, _, _) = validate(&workspace, "pwd".into(), Some("work".into()), 5).unwrap();
        std::fs::rename(root.path().join("work"), root.path().join("old-work")).unwrap();
        std::fs::create_dir(root.path().join("work")).unwrap();
        assert_eq!(
            execute(
                &request,
                TurnId::new(),
                ToolCallId::new(),
                Arc::new(MemoryArtifacts::default()),
                CancellationToken::new(),
            )
            .await,
            Err(ShellError::WorkingDirectoryChanged)
        );
    }

    #[tokio::test]
    async fn timeout_reaps_the_process_group() {
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let (request, _, _) = validate(&workspace, "sleep 30".into(), None, 1).unwrap();
        let result = execute(
            &request,
            TurnId::new(),
            ToolCallId::new(),
            Arc::new(MemoryArtifacts::default()),
            CancellationToken::new(),
        )
        .await
        .unwrap();
        assert!(result.timed_out);
        assert!(result.duration_millis < 5_000);
    }

    #[tokio::test]
    async fn nonzero_and_signal_exits_are_reported() {
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        for (command, exit_code, signal) in [
            ("exit 7", Some(7), None),
            ("kill -TERM $$", None, Some(libc::SIGTERM)),
        ] {
            let (request, _, _) = validate(&workspace, command.into(), None, 5).unwrap();
            let result = execute(
                &request,
                TurnId::new(),
                ToolCallId::new(),
                Arc::new(MemoryArtifacts::default()),
                CancellationToken::new(),
            )
            .await
            .unwrap();
            assert_eq!(result.exit_code, exit_code, "{command}");
            assert_eq!(result.signal, signal, "{command}");
        }
    }

    #[tokio::test]
    async fn closed_stdin_invalid_utf8_and_artifact_refusal_are_visible() {
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let (stdin_request, _, _) = validate(&workspace, "/bin/cat".into(), None, 5).unwrap();
        let stdin_result = execute(
            &stdin_request,
            TurnId::new(),
            ToolCallId::new(),
            Arc::new(MemoryArtifacts::default()),
            CancellationToken::new(),
        )
        .await
        .unwrap();
        assert_eq!(stdin_result.exit_code, Some(0));
        assert!(stdin_result.stdout.is_empty());

        let (binary_request, _, _) =
            validate(&workspace, "/usr/bin/printf '\\377'".into(), None, 5).unwrap();
        let binary_result = execute(
            &binary_request,
            TurnId::new(),
            ToolCallId::new(),
            Arc::new(RejectingArtifacts),
            CancellationToken::new(),
        )
        .await
        .unwrap();
        assert!(binary_result.stdout_lossy);
        assert!(binary_result.output_artifact_refused);
        assert!(binary_result.stdout_artifact.is_none());
    }

    #[tokio::test]
    async fn cancellation_reaps_the_process_group() {
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let (request, _, _) = validate(&workspace, "sleep 30".into(), None, 30).unwrap();
        let cancellation = CancellationToken::new();
        let cancel = cancellation.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            cancel.cancel();
        });
        let result = execute(
            &request,
            TurnId::new(),
            ToolCallId::new(),
            Arc::new(MemoryArtifacts::default()),
            cancellation,
        )
        .await
        .unwrap();
        assert!(result.cancelled);
        assert!(result.duration_millis < 5_000);
    }

    #[tokio::test]
    async fn normal_shell_exit_terminates_background_descendants() {
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let (request, _, _) =
            validate(&workspace, "sleep 30 & printf '%s' $!".into(), None, 5).unwrap();
        let result = execute(
            &request,
            TurnId::new(),
            ToolCallId::new(),
            Arc::new(MemoryArtifacts::default()),
            CancellationToken::new(),
        )
        .await
        .unwrap();
        assert_eq!(result.exit_code, Some(0));
        let descendant = result.stdout.parse::<i32>().unwrap();
        // SAFETY: signal zero only checks whether the captured descendant PID remains live.
        let alive = unsafe { libc::kill(descendant, 0) } == 0;
        assert!(!alive, "background descendant remained live: {descendant}");
    }

    #[tokio::test]
    async fn output_flood_is_bounded_and_returns_an_opaque_artifact_reference() {
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let (request, _, _) =
            validate(&workspace, "yes x | head -c 2097152".into(), None, 5).unwrap();
        let result = execute(
            &request,
            TurnId::new(),
            ToolCallId::new(),
            Arc::new(MemoryArtifacts::default()),
            CancellationToken::new(),
        )
        .await
        .unwrap();
        assert_eq!(result.stdout_original_bytes, 2 * 1024 * 1024);
        assert!(result.stdout.len() <= MAXIMUM_PREVIEW_BYTES);
        let artifact = result.stdout_artifact.unwrap();
        assert_eq!(artifact.retained_bytes, MAXIMUM_STREAM_BYTES);
        assert!(artifact.truncated);
    }
}
