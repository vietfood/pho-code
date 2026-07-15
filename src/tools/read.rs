use std::io::{BufRead as _, BufReader, Read as _};

#[cfg(unix)]
use std::os::unix::fs::MetadataExt as _;

use serde::Serialize;
use tokio_util::sync::CancellationToken;

use super::workspace::{Workspace, WorkspaceError};

pub const MAXIMUM_FILE_BYTES: u64 = 16 * 1024 * 1024;
pub const MAXIMUM_RESULT_BYTES: usize = 16 * 1024;
pub const MAXIMUM_RESULT_LINES: usize = 400;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReadRequest {
    pub path: String,
    pub start_line: usize,
    pub line_count: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct ReadResult {
    pub path: String,
    pub requested_start_line: usize,
    pub returned_start_line: usize,
    pub returned_end_line: usize,
    pub text: String,
    pub end_of_file: bool,
    pub truncated: bool,
    pub next_line: Option<usize>,
    pub retained_bytes: usize,
    pub retained_lines: usize,
}

impl ReadResult {
    pub fn model_content(&self) -> Result<String, ReadError> {
        serde_json::to_string(self).map_err(|_| ReadError::Internal)
    }
}

pub fn read_file(
    workspace: &Workspace,
    request: &ReadRequest,
    cancellation: &CancellationToken,
) -> Result<ReadResult, ReadError> {
    read_file_inner(workspace, request, cancellation, || {})
}

fn read_file_inner(
    workspace: &Workspace,
    request: &ReadRequest,
    cancellation: &CancellationToken,
    before_reopen: impl FnOnce(),
) -> Result<ReadResult, ReadError> {
    if request.start_line == 0
        || request.line_count == 0
        || request.line_count > MAXIMUM_RESULT_LINES
    {
        return Err(ReadError::InvalidArguments);
    }
    let (resolved, file) = workspace
        .open_file(&request.path)
        .map_err(ReadError::Workspace)?;
    let before = file.metadata().map_err(|_| ReadError::Unavailable)?;
    if !before.is_file() {
        return Err(ReadError::UnsupportedFileType);
    }
    if before.len() > MAXIMUM_FILE_BYTES {
        return Err(ReadError::FileTooLarge);
    }

    let before_identity = identity(&before);
    let mut reader = BufReader::new(file.take(MAXIMUM_FILE_BYTES + 1));
    let mut raw = Vec::new();
    let mut line = Vec::new();
    let mut current_line = 0_usize;
    let mut returned_lines = 0_usize;
    let mut end_of_file = false;
    let mut truncated = false;
    let mut consumed = 0_u64;

    loop {
        if cancellation.is_cancelled() {
            return Err(ReadError::Cancelled);
        }
        line.clear();
        let count = reader
            .read_until(b'\n', &mut line)
            .map_err(|_| ReadError::Unavailable)?;
        if count == 0 {
            end_of_file = true;
            break;
        }
        consumed = consumed
            .checked_add(count as u64)
            .ok_or(ReadError::FileTooLarge)?;
        if consumed > MAXIMUM_FILE_BYTES {
            return Err(ReadError::FileTooLarge);
        }
        current_line = current_line.checked_add(1).ok_or(ReadError::Internal)?;
        if line.contains(&0) || std::str::from_utf8(&line).is_err() {
            return Err(ReadError::UnsupportedContent);
        }
        if current_line < request.start_line {
            continue;
        }
        if returned_lines == request.line_count {
            truncated = true;
            break;
        }
        let prefix = format!("{current_line:>6}\t");
        if raw.len() + prefix.len() + line.len() > MAXIMUM_RESULT_BYTES {
            truncated = true;
            break;
        }
        raw.extend_from_slice(prefix.as_bytes());
        raw.extend_from_slice(&line);
        returned_lines += 1;
    }

    let after = reader
        .get_ref()
        .get_ref()
        .metadata()
        .map_err(|_| ReadError::Unavailable)?;
    if identity(&after) != before_identity {
        return Err(ReadError::FileChangedDuringRead);
    }
    before_reopen();
    let (_, current) = workspace
        .open_file(&request.path)
        .map_err(|_| ReadError::FileChangedDuringRead)?;
    let current = current
        .metadata()
        .map_err(|_| ReadError::FileChangedDuringRead)?;
    if identity(&current) != before_identity {
        return Err(ReadError::FileChangedDuringRead);
    }
    let text = String::from_utf8(raw).map_err(|_| ReadError::Internal)?;
    let returned_end_line = if returned_lines == 0 {
        request.start_line.saturating_sub(1)
    } else {
        request.start_line + returned_lines - 1
    };
    let next_line = truncated.then_some(returned_end_line.saturating_add(1));
    Ok(ReadResult {
        path: resolved.display,
        requested_start_line: request.start_line,
        returned_start_line: request.start_line,
        returned_end_line,
        retained_bytes: text.len(),
        retained_lines: returned_lines,
        text,
        end_of_file,
        truncated,
        next_line,
    })
}

#[cfg(unix)]
fn identity(metadata: &std::fs::Metadata) -> (u64, u64, u64, i64, i64, i64, i64) {
    (
        metadata.dev(),
        metadata.ino(),
        metadata.len(),
        metadata.mtime(),
        metadata.mtime_nsec(),
        metadata.ctime(),
        metadata.ctime_nsec(),
    )
}

#[cfg(not(unix))]
fn identity(metadata: &std::fs::Metadata) -> (u64, Option<std::time::SystemTime>) {
    (metadata.len(), metadata.modified().ok())
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum ReadError {
    #[error("read arguments are invalid")]
    InvalidArguments,
    #[error(transparent)]
    Workspace(WorkspaceError),
    #[error("file is unavailable")]
    Unavailable,
    #[error("file type is unsupported")]
    UnsupportedFileType,
    #[error("file content is not bounded UTF-8 text")]
    UnsupportedContent,
    #[error("file exceeds the read policy")]
    FileTooLarge,
    #[error("file changed during read")]
    FileChangedDuringRead,
    #[error("read cancelled")]
    Cancelled,
    #[error("internal read invariant failed")]
    Internal,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_numbered_windows_and_explicit_next_line() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("sample.txt"), "one\ntwo\nthree\nfour\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let result = read_file(
            &workspace,
            &ReadRequest {
                path: "sample.txt".into(),
                start_line: 2,
                line_count: 2,
            },
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(result.text, "     2\ttwo\n     3\tthree\n");
        assert!(result.truncated);
        assert_eq!(result.next_line, Some(4));
    }

    #[test]
    fn rejects_binary_directories_and_escapes() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("binary"), b"a\0b").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        for path in ["binary", "."] {
            let result = read_file(
                &workspace,
                &ReadRequest {
                    path: path.into(),
                    start_line: 1,
                    line_count: 10,
                },
                &CancellationToken::new(),
            );
            assert!(result.is_err());
        }
        assert!(matches!(
            read_file(
                &workspace,
                &ReadRequest {
                    path: "../escape".into(),
                    start_line: 1,
                    line_count: 10,
                },
                &CancellationToken::new(),
            ),
            Err(ReadError::Workspace(WorkspaceError::OutsideWorkspace))
        ));
    }

    #[test]
    fn rejects_atomic_path_replacement_during_read() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("sample.txt"), "original\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let result = read_file_inner(
            &workspace,
            &ReadRequest {
                path: "sample.txt".into(),
                start_line: 1,
                line_count: 10,
            },
            &CancellationToken::new(),
            || {
                std::fs::rename(
                    root.path().join("sample.txt"),
                    root.path().join("original.txt"),
                )
                .unwrap();
                std::fs::write(root.path().join("sample.txt"), "replaced\n").unwrap();
            },
        );
        assert_eq!(result, Err(ReadError::FileChangedDuringRead));
    }

    #[test]
    fn handles_beyond_end_final_line_and_byte_truncation() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("sample.txt"), "one\ntwo").unwrap();
        std::fs::write(
            root.path().join("long.txt"),
            vec![b'x'; MAXIMUM_RESULT_BYTES + 1],
        )
        .unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let final_line = read_file(
            &workspace,
            &ReadRequest {
                path: "sample.txt".into(),
                start_line: 2,
                line_count: 10,
            },
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(final_line.text, "     2\ttwo");
        assert!(final_line.end_of_file);

        let beyond = read_file(
            &workspace,
            &ReadRequest {
                path: "sample.txt".into(),
                start_line: 9,
                line_count: 10,
            },
            &CancellationToken::new(),
        )
        .unwrap();
        assert!(beyond.text.is_empty());
        assert!(beyond.end_of_file);

        let bounded = read_file(
            &workspace,
            &ReadRequest {
                path: "long.txt".into(),
                start_line: 1,
                line_count: 10,
            },
            &CancellationToken::new(),
        )
        .unwrap();
        assert!(bounded.truncated);
        assert!(bounded.text.len() <= MAXIMUM_RESULT_BYTES);
        assert_eq!(bounded.next_line, Some(1));
    }

    #[test]
    fn rejects_invalid_utf8_oversize_and_same_length_in_place_change() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("invalid.txt"), [0xff]).unwrap();
        let oversized = std::fs::File::create(root.path().join("oversized.txt")).unwrap();
        oversized.set_len(MAXIMUM_FILE_BYTES + 1).unwrap();
        std::fs::write(root.path().join("mutable.txt"), "original\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        for (path, expected) in [
            ("invalid.txt", ReadError::UnsupportedContent),
            ("oversized.txt", ReadError::FileTooLarge),
        ] {
            assert_eq!(
                read_file(
                    &workspace,
                    &ReadRequest {
                        path: path.into(),
                        start_line: 1,
                        line_count: 10,
                    },
                    &CancellationToken::new(),
                ),
                Err(expected)
            );
        }
        let changed = read_file_inner(
            &workspace,
            &ReadRequest {
                path: "mutable.txt".into(),
                start_line: 1,
                line_count: 10,
            },
            &CancellationToken::new(),
            || std::fs::write(root.path().join("mutable.txt"), "modified\n").unwrap(),
        );
        assert_eq!(changed, Err(ReadError::FileChangedDuringRead));
    }
}
