//! Read-only, bounded projection of durable session journals for native navigation.

use std::cmp::Ordering;
use std::fs::{self, File};
use std::io::Read as _;
use std::path::{Path, PathBuf};

use serde::Serialize;
use thiserror::Error;

use crate::agent::types::{SessionId, WorkspaceId};

use super::journal::{MAXIMUM_SESSION_JOURNAL_BYTES, MAXIMUM_SESSION_RECORDS};
use super::record::{MAXIMUM_RECORD_LINE_BYTES, RecordEnvelope, RecordPayload, SessionProfile};

pub const MAXIMUM_CATALOG_ENTRIES: usize = 1024;
pub const MAXIMUM_CATALOG_CANDIDATES: usize = 4096;
pub const MAXIMUM_TITLE_GRAPHEMES: usize = 80;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionClassification {
    Writable,
    ReadOnly,
    Damaged,
    MissingWorkspace,
    Incompatible,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionCompatibility {
    Compatible,
    Incompatible,
    Unknown,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct SessionProfileSummary {
    pub model: String,
    pub thinking_mode: String,
    pub reasoning_effort: String,
    pub profile_revision: u32,
    pub instruction_profile_revision: u32,
}

impl From<&SessionProfile> for SessionProfileSummary {
    fn from(profile: &SessionProfile) -> Self {
        Self {
            model: profile.model.clone(),
            thinking_mode: profile.thinking_mode.clone(),
            reasoning_effort: profile.reasoning_effort.clone(),
            profile_revision: profile.profile_revision,
            instruction_profile_revision: profile.instruction_profile_revision,
        }
    }
}

#[derive(Clone, Eq, PartialEq)]
pub struct SessionCatalogEntry {
    pub session_id: SessionId,
    pub journal_path: PathBuf,
    pub title: String,
    pub last_recorded_at: Option<String>,
    pub profile: Option<SessionProfileSummary>,
    pub compatibility: SessionCompatibility,
    pub workspace: Option<PathBuf>,
    pub workspace_id: Option<WorkspaceId>,
    pub classification: SessionClassification,
    pub read_only: bool,
}

impl std::fmt::Debug for SessionCatalogEntry {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SessionCatalogEntry")
            .field("session_id", &self.session_id)
            .field("title_bytes", &self.title.len())
            .field("last_recorded_at", &self.last_recorded_at)
            .field("profile", &self.profile)
            .field("compatibility", &self.compatibility)
            .field("workspace_present", &self.workspace.is_some())
            .field("workspace_id", &self.workspace_id)
            .field("classification", &self.classification)
            .field("read_only", &self.read_only)
            .finish_non_exhaustive()
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Error)]
pub enum CatalogError {
    #[error("session catalog is unavailable")]
    Unavailable,
    #[error("session catalog directory cannot be read")]
    Directory,
}

#[derive(Default)]
struct ParsedJournal {
    records: usize,
    damaged: bool,
    saw_session_created: bool,
    title: Option<String>,
    last_recorded_at: Option<String>,
    profile: Option<SessionProfile>,
    workspace: Option<PathBuf>,
    workspace_id: Option<WorkspaceId>,
}

/// Parse one bounded journal without opening a writer or repairing a torn tail.
///
/// The returned entry has an empty path because this helper is intended for pure fixtures. The
/// caller-supplied roots are treated as already canonical and are compared as paths, never by
/// display name.
pub fn parse_journal(
    bytes: &[u8],
    session_id: SessionId,
    registered_roots: &[PathBuf],
) -> SessionCatalogEntry {
    let mut parsed = ParsedJournal::default();
    if bytes.len() > MAXIMUM_SESSION_JOURNAL_BYTES {
        parsed.damaged = true;
    } else {
        parse_records(bytes, session_id, &mut parsed);
    }
    make_entry(session_id, PathBuf::new(), parsed, registered_roots, false)
}

/// Scan `Application Support/Pho Code/sessions` read-only.
pub fn scan_sessions(
    application_root: impl AsRef<Path>,
    registered_roots: &[PathBuf],
) -> Result<Vec<SessionCatalogEntry>, CatalogError> {
    let sessions = application_root.as_ref().join("sessions");
    let mut candidates = Vec::new();
    let entries = fs::read_dir(&sessions).map_err(|_| CatalogError::Directory)?;
    for entry in entries {
        let entry = entry.map_err(|_| CatalogError::Directory)?;
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("jsonl") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        let Ok(session_id) = stem.parse::<SessionId>() else {
            continue;
        };
        candidates.push((stem.to_owned(), path, session_id));
    }
    candidates.sort_by(|left, right| left.0.cmp(&right.0));
    candidates.truncate(MAXIMUM_CATALOG_CANDIDATES);

    let mut result = Vec::with_capacity(candidates.len());
    for (_, path, session_id) in candidates {
        let readonly = fs::metadata(&path)
            .map(|metadata| metadata.permissions().readonly())
            .unwrap_or(true);
        let mut parsed = ParsedJournal::default();
        match read_bounded(&path) {
            Ok(bytes) => parse_records(&bytes, session_id, &mut parsed),
            Err(ReadBoundedError::TooLarge | ReadBoundedError::Malformed) => {
                parsed.damaged = true;
            }
            Err(ReadBoundedError::Unavailable) => {
                parsed.damaged = true;
            }
        }
        result.push(make_entry(
            session_id,
            path,
            parsed,
            registered_roots,
            readonly,
        ));
    }

    result.sort_by(compare_entries);
    result.truncate(MAXIMUM_CATALOG_ENTRIES);
    Ok(result)
}

/// Short alias for callers that already use the session catalog as their scan boundary.
pub fn scan(
    application_root: impl AsRef<Path>,
    registered_roots: &[PathBuf],
) -> Result<Vec<SessionCatalogEntry>, CatalogError> {
    scan_sessions(application_root, registered_roots)
}

fn parse_records(bytes: &[u8], expected_session_id: SessionId, parsed: &mut ParsedJournal) {
    let mut cursor = 0;
    let mut expected_sequence = 1_u64;
    while cursor < bytes.len() {
        if parsed.records >= MAXIMUM_SESSION_RECORDS as usize {
            parsed.damaged = true;
            break;
        }
        let Some(relative_end) = bytes[cursor..].iter().position(|byte| *byte == b'\n') else {
            parsed.damaged = true;
            break;
        };
        let end = cursor + relative_end + 1;
        let line = &bytes[cursor..end];
        if line.len() > MAXIMUM_RECORD_LINE_BYTES {
            parsed.damaged = true;
            break;
        }
        let record = match RecordEnvelope::decode(line) {
            Ok(record) => record,
            Err(_) => {
                parsed.damaged = true;
                break;
            }
        };
        if record.session_id != expected_session_id || record.sequence != expected_sequence {
            parsed.damaged = true;
            break;
        }
        expected_sequence = match expected_sequence.checked_add(1) {
            Some(value) => value,
            None => {
                parsed.damaged = true;
                break;
            }
        };
        parsed.records += 1;
        parsed.last_recorded_at = Some(record.recorded_at.clone());
        if let Ok(payload) = record.typed_payload() {
            match payload {
                RecordPayload::SessionCreated(value) => {
                    if parsed.saw_session_created {
                        parsed.damaged = true;
                        break;
                    }
                    parsed.saw_session_created = true;
                    parsed.workspace_id = Some(value.workspace_id);
                    parsed.workspace = Some(PathBuf::from(value.workspace));
                    parsed.profile = Some(value.profile);
                }
                RecordPayload::SessionMetadataUpdated(value) => {
                    if let Some(workspace_id) = value.workspace_id {
                        parsed.workspace_id = Some(workspace_id);
                    }
                    if let Some(workspace) = value.workspace {
                        parsed.workspace = Some(PathBuf::from(workspace));
                    }
                    if let Some(profile) = value.profile {
                        parsed.profile = Some(profile);
                    }
                }
                RecordPayload::UserMessageCompleted(value) if parsed.title.is_none() => {
                    let title = title_from_message(&value.text);
                    if !title.is_empty() {
                        parsed.title = Some(title);
                    }
                }
                _ => {}
            }
        }
        cursor = end;
    }
    if cursor < bytes.len() || bytes.is_empty() {
        parsed.damaged = true;
    }
}

fn make_entry(
    session_id: SessionId,
    journal_path: PathBuf,
    parsed: ParsedJournal,
    registered_roots: &[PathBuf],
    filesystem_read_only: bool,
) -> SessionCatalogEntry {
    let title = parsed.title.unwrap_or_else(|| "New chat".into());
    let compatibility = match parsed.profile.as_ref() {
        Some(profile) if profile == &SessionProfile::default() => SessionCompatibility::Compatible,
        Some(_) => SessionCompatibility::Incompatible,
        None => SessionCompatibility::Unknown,
    };
    let workspace_matches = parsed.workspace.as_ref().is_some_and(|workspace| {
        registered_roots
            .iter()
            .any(|registered| registered == workspace)
    });
    let classification = if parsed.damaged || !parsed.saw_session_created {
        SessionClassification::Damaged
    } else if compatibility == SessionCompatibility::Incompatible {
        SessionClassification::Incompatible
    } else if !workspace_matches {
        SessionClassification::MissingWorkspace
    } else if filesystem_read_only {
        SessionClassification::ReadOnly
    } else {
        SessionClassification::Writable
    };
    let read_only = !matches!(classification, SessionClassification::Writable);
    SessionCatalogEntry {
        session_id,
        journal_path,
        title,
        last_recorded_at: parsed.last_recorded_at,
        profile: parsed.profile.as_ref().map(SessionProfileSummary::from),
        compatibility,
        workspace: parsed.workspace,
        workspace_id: parsed.workspace_id,
        classification,
        read_only,
    }
}

fn compare_entries(left: &SessionCatalogEntry, right: &SessionCatalogEntry) -> Ordering {
    right
        .last_recorded_at
        .cmp(&left.last_recorded_at)
        .then_with(|| left.session_id.cmp(&right.session_id))
}

fn title_from_message(message: &str) -> String {
    use unicode_segmentation::UnicodeSegmentation as _;

    let normalized = message.split_whitespace().collect::<Vec<_>>().join(" ");
    let title = normalized
        .graphemes(true)
        .take(MAXIMUM_TITLE_GRAPHEMES)
        .collect::<String>();
    title.trim().to_owned()
}

enum ReadBoundedError {
    Unavailable,
    TooLarge,
    Malformed,
}

fn read_bounded(path: &Path) -> Result<Vec<u8>, ReadBoundedError> {
    let metadata = fs::metadata(path).map_err(|_| ReadBoundedError::Unavailable)?;
    if metadata.len() > MAXIMUM_SESSION_JOURNAL_BYTES as u64 {
        return Err(ReadBoundedError::TooLarge);
    }
    let mut file = File::open(path).map_err(|_| ReadBoundedError::Unavailable)?;
    let mut bytes = Vec::with_capacity(metadata.len().min(64 * 1024) as usize);
    file.by_ref()
        .take(MAXIMUM_SESSION_JOURNAL_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ReadBoundedError::Unavailable)?;
    if bytes.len() > MAXIMUM_SESSION_JOURNAL_BYTES {
        return Err(ReadBoundedError::TooLarge);
    }
    if bytes.len() as u64 != metadata.len() {
        return Err(ReadBoundedError::Malformed);
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::types::{ItemId, TurnId};
    use crate::session::record::{SessionCreated, UserMessageCompleted};

    fn fixture(id: SessionId, title: &str, recorded_at: &str) -> Vec<u8> {
        let created = RecordEnvelope::new(
            id,
            1,
            &RecordPayload::SessionCreated(SessionCreated {
                workspace_id: WorkspaceId::new(),
                workspace: "/workspace/project".into(),
                profile: SessionProfile::default(),
                instruction_profile_digest: None,
                extra: Default::default(),
            }),
        )
        .unwrap()
        .with_recorded_at(recorded_at)
        .unwrap();
        let message = RecordEnvelope::new(
            id,
            2,
            &RecordPayload::UserMessageCompleted(UserMessageCompleted {
                turn_id: TurnId::new(),
                item_id: ItemId::new(),
                text: title.into(),
                extra: Default::default(),
            }),
        )
        .unwrap()
        .with_recorded_at(recorded_at)
        .unwrap();
        [created.encode().unwrap(), message.encode().unwrap()].concat()
    }

    #[test]
    fn title_collapses_whitespace_and_bounds_graphemes() {
        use unicode_segmentation::UnicodeSegmentation as _;

        let id = SessionId::new();
        let title = format!("  one\n\t two {}  ", "界".repeat(100));
        let entry = parse_journal(
            &fixture(id, &title, "2026-01-01T00:00:00.000Z"),
            id,
            &[PathBuf::from("/workspace/project")],
        );
        assert_eq!(entry.title.graphemes(true).count(), MAXIMUM_TITLE_GRAPHEMES);
        assert!(!entry.title.contains('\n'));
        assert!(entry.title.starts_with("one two"));
    }

    #[test]
    fn damaged_and_torn_records_are_read_only_without_repair() {
        let id = SessionId::new();
        let mut bytes = fixture(id, "title", "2026-01-01T00:00:00.000Z");
        bytes.extend_from_slice(b"{\"torn\":");
        let entry = parse_journal(&bytes, id, &[PathBuf::from("/workspace/project")]);
        assert_eq!(entry.classification, SessionClassification::Damaged);
        assert!(entry.read_only);
    }

    #[test]
    fn unknown_optional_members_remain_valid() {
        let id = SessionId::new();
        let mut bytes = fixture(id, "title", "2026-01-01T00:00:00.000Z");
        let final_record_end = bytes.len() - 1;
        let closing = bytes[..final_record_end]
            .iter()
            .rposition(|byte| *byte == b'}')
            .unwrap();
        bytes.splice(
            closing..=closing,
            b",\"unknown_optional\":true}".iter().copied(),
        );
        let entry = parse_journal(&bytes, id, &[PathBuf::from("/workspace/project")]);
        assert!(!entry.read_only);
    }

    #[test]
    fn wrong_session_id_is_damaged() {
        let id = SessionId::new();
        let other = SessionId::new();
        let entry = parse_journal(
            &fixture(other, "title", "2026-01-01T00:00:00.000Z"),
            id,
            &[],
        );
        assert_eq!(entry.classification, SessionClassification::Damaged);
    }

    #[test]
    fn recency_sort_has_session_id_tie_break() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("sessions")).unwrap();
        let older = SessionId::new();
        let newer = SessionId::new();
        fs::write(
            root.path().join("sessions").join(format!("{older}.jsonl")),
            fixture(older, "old", "2026-01-01T00:00:00.000Z"),
        )
        .unwrap();
        fs::write(
            root.path().join("sessions").join(format!("{newer}.jsonl")),
            fixture(newer, "new", "2026-02-01T00:00:00.000Z"),
        )
        .unwrap();
        let entries = scan_sessions(root.path(), &[PathBuf::from("/workspace/project")]).unwrap();
        assert_eq!(entries[0].session_id, newer);
    }

    #[test]
    fn equal_recency_uses_session_id_tie_break() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("sessions")).unwrap();
        let first = SessionId::new();
        let second = SessionId::new();
        let timestamp = "2026-02-01T00:00:00.000Z";
        fs::write(
            root.path().join("sessions").join(format!("{first}.jsonl")),
            fixture(first, "first", timestamp),
        )
        .unwrap();
        fs::write(
            root.path().join("sessions").join(format!("{second}.jsonl")),
            fixture(second, "second", timestamp),
        )
        .unwrap();
        let entries = scan_sessions(root.path(), &[PathBuf::from("/workspace/project")]).unwrap();
        assert_eq!(entries[0].session_id, first.min(second));
    }

    #[test]
    fn candidate_bound_is_deterministic_before_reading() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("sessions")).unwrap();
        let mut ids = Vec::new();
        for _ in 0..(MAXIMUM_CATALOG_ENTRIES + 1) {
            let id = SessionId::new();
            fs::write(
                root.path().join("sessions").join(format!("{id}.jsonl")),
                fixture(id, "title", "2026-01-01T00:00:00.000Z"),
            )
            .unwrap();
            ids.push(id);
        }
        let mut expected = ids.iter().map(ToString::to_string).collect::<Vec<_>>();
        expected.sort();
        expected.truncate(MAXIMUM_CATALOG_ENTRIES);
        let entries = scan_sessions(root.path(), &[PathBuf::from("/workspace/project")]).unwrap();
        let actual = entries
            .iter()
            .map(|entry| entry.session_id.to_string())
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(actual.len(), MAXIMUM_CATALOG_ENTRIES);
        assert_eq!(
            actual,
            expected
                .into_iter()
                .collect::<std::collections::BTreeSet<_>>()
        );
    }

    #[test]
    fn missing_workspace_and_incompatible_profile_are_read_only() {
        let id = SessionId::new();
        let missing = parse_journal(&fixture(id, "title", "2026-01-01T00:00:00.000Z"), id, &[]);
        assert_eq!(
            missing.classification,
            SessionClassification::MissingWorkspace
        );
        assert!(missing.read_only);

        let profile = SessionProfile {
            model: "other-model".into(),
            ..SessionProfile::default()
        };
        let created = RecordEnvelope::new(
            id,
            1,
            &RecordPayload::SessionCreated(SessionCreated {
                workspace_id: WorkspaceId::new(),
                workspace: "/workspace/project".into(),
                profile,
                instruction_profile_digest: None,
                extra: Default::default(),
            }),
        )
        .unwrap();
        let incompatible = parse_journal(
            &created.encode().unwrap(),
            id,
            &[PathBuf::from("/workspace/project")],
        );
        assert_eq!(
            incompatible.classification,
            SessionClassification::Incompatible
        );
        assert!(incompatible.read_only);
    }

    #[test]
    fn byte_and_line_bounds_fail_closed_without_panicking() {
        let id = SessionId::new();
        let oversized = parse_journal(&vec![b'x'; MAXIMUM_SESSION_JOURNAL_BYTES + 1], id, &[]);
        assert_eq!(oversized.classification, SessionClassification::Damaged);

        let mut oversized_line = vec![b'x'; MAXIMUM_RECORD_LINE_BYTES];
        oversized_line.push(b'\n');
        let oversized_line = parse_journal(&oversized_line, id, &[]);
        assert_eq!(
            oversized_line.classification,
            SessionClassification::Damaged
        );
    }

    #[test]
    fn scan_does_not_modify_journal_bytes() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("sessions")).unwrap();
        let id = SessionId::new();
        let bytes = fixture(id, "title", "2026-01-01T00:00:00.000Z");
        let path = root.path().join("sessions").join(format!("{id}.jsonl"));
        fs::write(&path, &bytes).unwrap();
        let _ = scan_sessions(root.path(), &[PathBuf::from("/workspace/project")]).unwrap();
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
}
