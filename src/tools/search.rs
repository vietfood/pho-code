use std::io::Read as _;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

#[cfg(unix)]
use std::os::unix::fs::MetadataExt as _;

use fff_search::{
    FFFMode, FilePicker, FilePickerOptions, FileSearchConfig, FuzzySearchOptions, PaginationArgs,
    QueryParser, SharedFilePicker, SharedFrecency,
};
use neo_frizbee::{Config as FuzzyConfig, match_list_indices};
use notify::{RecommendedWatcher, RecursiveMode, Watcher as _};
use regex::RegexBuilder;
use serde::Serialize;
use tokio_util::sync::CancellationToken;

use super::workspace::Workspace;

pub const MAXIMUM_INDEXED_PATHS: usize = 100_000;
pub const MAXIMUM_QUERY_BYTES: usize = 4096;
pub const MAXIMUM_RESULTS: usize = 100;
pub const MAXIMUM_CONTEXT_LINES: usize = 3;
pub const MAXIMUM_FILE_BYTES: u64 = 4 * 1024 * 1024;
pub const SCAN_WAIT: Duration = Duration::from_secs(2);
pub const SEARCH_TIME_BUDGET_MS: u64 = 2_000;
pub const MAXIMUM_SNIPPET_BYTES: usize = 512;
pub const MAXIMUM_SERIALIZED_RESULT_BYTES: usize = 48 * 1024;

static GENERATION: AtomicU64 = AtomicU64::new(1);

pub struct WorkspaceSearch {
    workspace: Workspace,
    picker: SharedFilePicker,
    generation: u64,
    watcher: SafeRescanWatcher,
}

impl std::fmt::Debug for WorkspaceSearch {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("WorkspaceSearch")
            .field("generation", &self.generation)
            .finish_non_exhaustive()
    }
}

impl WorkspaceSearch {
    pub fn start(workspace: Workspace) -> Result<Self, SearchError> {
        workspace
            .ensure_current()
            .map_err(|_| SearchError::PreflightFailed)?;
        enforce_index_limit(workspace.root())?;
        let picker = SharedFilePicker::default();
        FilePicker::new_with_shared_state(
            picker.clone(),
            SharedFrecency::default(),
            FilePickerOptions {
                base_path: workspace.root().to_string_lossy().into_owned(),
                enable_mmap_cache: false,
                enable_content_indexing: false,
                mode: FFFMode::Ai,
                cache_budget: None,
                watch: false,
                follow_symlinks: false,
                enable_fs_root_scanning: false,
                enable_home_dir_scanning: false,
            },
        )
        .map_err(|_| SearchError::IndexStartupFailed)?;
        let watcher = SafeRescanWatcher::start(picker.clone(), workspace.clone())?;
        Ok(Self {
            workspace,
            picker,
            generation: GENERATION.fetch_add(1, Ordering::Relaxed),
            watcher,
        })
    }

    pub fn generation(&self) -> u64 {
        self.generation
    }

    pub fn state(&self) -> SearchState {
        if self.workspace.ensure_current().is_err() {
            return SearchState::Stale;
        }
        let Ok(guard) = self.picker.read() else {
            return SearchState::Stale;
        };
        let Some(picker) = guard.as_ref() else {
            return SearchState::Building;
        };
        let progress = picker.get_scan_progress();
        if progress.is_scanning {
            SearchState::Building
        } else if !self.watcher.healthy.load(Ordering::Acquire) {
            SearchState::Stale
        } else {
            SearchState::Ready
        }
    }

    pub fn search_files(
        &self,
        request: &FileSearchRequest,
    ) -> Result<FileSearchResult, SearchError> {
        validate_query(&request.query)?;
        validate_page(request.limit, request.cursor.as_deref())?;
        self.workspace
            .ensure_current()
            .map_err(|_| SearchError::IndexStale)?;
        if !self.picker.wait_for_scan(SCAN_WAIT) {
            return Err(SearchError::IndexBuilding);
        }
        self.watcher.ensure_healthy()?;
        let guard = self.picker.read().map_err(|_| SearchError::IndexStale)?;
        let picker = guard.as_ref().ok_or(SearchError::IndexBuilding)?;
        if picker.live_file_count() > MAXIMUM_INDEXED_PATHS {
            return Err(SearchError::IndexLimitExceeded);
        }
        let offset = parse_cursor(self.generation, request.cursor.as_deref())?;
        let parser = QueryParser::new(FileSearchConfig);
        let query = parser.parse(&request.query);
        let results = picker.fuzzy_search(
            &query,
            None,
            FuzzySearchOptions {
                max_threads: 2,
                current_file: None,
                project_path: None,
                combo_boost_score_multiplier: 0,
                min_combo_count: 0,
                pagination: PaginationArgs {
                    offset: 0,
                    limit: MAXIMUM_INDEXED_PATHS,
                },
            },
        );
        let constraint = self.constraint(request.path.as_deref())?;
        let mut all = Vec::new();
        for (item, score) in results.items.iter().zip(results.scores.iter()) {
            let path = item.relative_path(picker);
            if constraint
                .as_ref()
                .is_some_and(|constraint| !matches_constraint(&path, constraint))
            {
                continue;
            }
            if self.workspace.resolve_existing(&path).is_err() {
                continue;
            }
            all.push(FileMatch {
                path,
                score: score.total,
                match_kind: score.match_type.to_owned(),
            });
        }
        let mut page = Vec::new();
        let mut end = offset;
        for item in all.iter().skip(offset).take(request.limit) {
            page.push(item.clone());
            if serde_json::to_vec(&page)
                .map_err(|_| SearchError::SearchFailed)?
                .len()
                > MAXIMUM_SERIALIZED_RESULT_BYTES
            {
                page.pop();
                break;
            }
            end += 1;
        }
        Ok(FileSearchResult {
            generation: self.generation,
            state: SearchState::Ready,
            matches: page,
            next_cursor: (end < all.len()).then(|| format_cursor(self.generation, end)),
            total_matches: all.len(),
        })
    }

    pub fn search_text(
        &self,
        request: &TextSearchRequest,
        cancellation: &CancellationToken,
    ) -> Result<TextSearchResult, SearchError> {
        validate_query(&request.query)?;
        validate_page(request.limit, request.cursor.as_deref())?;
        self.workspace
            .ensure_current()
            .map_err(|_| SearchError::IndexStale)?;
        if request.context_lines > MAXIMUM_CONTEXT_LINES {
            return Err(SearchError::InvalidArguments);
        }
        if !self.picker.wait_for_scan(SCAN_WAIT) {
            return Err(SearchError::IndexBuilding);
        }
        self.watcher.ensure_healthy()?;
        let cursor = parse_text_cursor(self.generation, request.cursor.as_deref())?;
        let paths = {
            let guard = self.picker.read().map_err(|_| SearchError::IndexStale)?;
            let picker = guard.as_ref().ok_or(SearchError::IndexBuilding)?;
            if picker.live_file_count() > MAXIMUM_INDEXED_PATHS {
                return Err(SearchError::IndexLimitExceeded);
            }
            picker
                .get_files()
                .iter()
                .map(|file| file.relative_path(picker))
                .collect::<Vec<_>>()
        };
        let regex = if request.mode == TextSearchMode::Regex {
            let case_sensitive = effective_case_sensitive(request);
            Some(
                RegexBuilder::new(&request.query)
                    .case_insensitive(!case_sensitive)
                    .build()
                    .map_err(|_| SearchError::InvalidRegex)?,
            )
        } else {
            None
        };
        let constraint = self.constraint(request.path.as_deref())?;
        let mut matches = Vec::new();
        let started = Instant::now();
        let mut next_cursor = None;
        let mut searched = 0_usize;
        let mut searchable = 0_usize;
        let mut skipped_unreadable = 0_usize;
        let mut skipped_too_large = 0_usize;
        let mut skipped_unsupported = 0_usize;
        let mut skipped_changed = 0_usize;
        'files: for (index, path) in paths.iter().enumerate().skip(cursor.file) {
            if cancellation.is_cancelled() {
                return Err(SearchError::Cancelled);
            }
            if started.elapsed() >= Duration::from_millis(SEARCH_TIME_BUDGET_MS) {
                next_cursor = Some(format_text_cursor(self.generation, index, 0));
                break;
            }
            if constraint
                .as_ref()
                .is_some_and(|constraint| !matches_constraint(path, constraint))
            {
                continue;
            }
            searched += 1;
            let Ok((_, mut file)) = self.workspace.open_file(path) else {
                skipped_unreadable += 1;
                continue;
            };
            let Ok(metadata) = file.metadata() else {
                skipped_unreadable += 1;
                continue;
            };
            if metadata.len() > MAXIMUM_FILE_BYTES {
                skipped_too_large += 1;
                continue;
            }
            let mut bytes = Vec::with_capacity(metadata.len() as usize);
            if file
                .by_ref()
                .take(MAXIMUM_FILE_BYTES + 1)
                .read_to_end(&mut bytes)
                .is_err()
                || bytes.len() as u64 > MAXIMUM_FILE_BYTES
            {
                skipped_unreadable += 1;
                continue;
            }
            if bytes.contains(&0) {
                skipped_unsupported += 1;
                continue;
            }
            let Ok(text) = std::str::from_utf8(&bytes) else {
                skipped_unsupported += 1;
                continue;
            };
            let Ok(after) = file.metadata() else {
                skipped_unreadable += 1;
                continue;
            };
            if file_identity(&metadata) != file_identity(&after) {
                skipped_changed += 1;
                continue;
            }
            let Ok((_, current)) = self.workspace.open_file(path) else {
                skipped_changed += 1;
                continue;
            };
            let Ok(current) = current.metadata() else {
                skipped_changed += 1;
                continue;
            };
            if file_identity(&metadata) != file_identity(&current) {
                skipped_changed += 1;
                continue;
            }
            searchable += 1;
            let lines = text.lines().collect::<Vec<_>>();
            let first_line = if index == cursor.file { cursor.line } else { 0 };
            for (line_index, line) in lines.iter().enumerate().skip(first_line) {
                if cancellation.is_cancelled() {
                    return Err(SearchError::Cancelled);
                }
                if started.elapsed() >= Duration::from_millis(SEARCH_TIME_BUDGET_MS) {
                    next_cursor = Some(format_text_cursor(self.generation, index, line_index));
                    break 'files;
                }
                let Some((column, fuzzy_score)) = match_line(request, regex.as_ref(), line) else {
                    continue;
                };
                if matches.len() == request.limit {
                    next_cursor = Some(format_text_cursor(self.generation, index, line_index));
                    break 'files;
                }
                matches.push(TextMatch {
                    path: path.clone(),
                    line: (line_index + 1) as u64,
                    column,
                    text: bounded_snippet(line),
                    context_before: context_before(&lines, line_index, request.context_lines),
                    context_after: context_after(&lines, line_index, request.context_lines),
                    fuzzy_score,
                });
                if serde_json::to_vec(&matches)
                    .map_err(|_| SearchError::SearchFailed)?
                    .len()
                    > MAXIMUM_SERIALIZED_RESULT_BYTES
                {
                    matches.pop();
                    next_cursor = Some(format_text_cursor(self.generation, index, line_index));
                    break 'files;
                }
            }
        }
        Ok(TextSearchResult {
            generation: self.generation,
            state: SearchState::Ready,
            matches,
            next_cursor,
            files_searched: searched,
            searchable_files: searchable,
            skipped_unreadable,
            skipped_too_large,
            skipped_unsupported,
            skipped_changed,
        })
    }

    fn constraint(&self, path: Option<&str>) -> Result<Option<String>, SearchError> {
        let Some(path) = path else {
            return Ok(None);
        };
        if path == "." {
            return Ok(None);
        }
        let absolute = self
            .workspace
            .resolve_constraint(Some(path))
            .map_err(|_| SearchError::InvalidArguments)?;
        self.workspace
            .relative_display(&absolute)
            .map(Some)
            .map_err(|_| SearchError::InvalidArguments)
    }
}

fn enforce_index_limit(root: &std::path::Path) -> Result<(), SearchError> {
    enforce_index_limit_with(root, MAXIMUM_INDEXED_PATHS)
}

fn enforce_index_limit_with(root: &std::path::Path, maximum: usize) -> Result<(), SearchError> {
    let is_git_repo = root.join(".git").is_dir();
    let mut builder = ignore::WalkBuilder::new(root);
    builder
        .hidden(!is_git_repo)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(true)
        .ignore(true)
        .follow_links(false)
        .threads(1);
    let mut files = 0_usize;
    for entry in builder.build() {
        let entry = entry.map_err(|_| SearchError::PreflightFailed)?;
        if entry.file_type().is_some_and(|kind| kind.is_file()) {
            files = files
                .checked_add(1)
                .ok_or(SearchError::IndexLimitExceeded)?;
            if files > maximum {
                return Err(SearchError::IndexLimitExceeded);
            }
        }
    }
    Ok(())
}

struct SafeRescanWatcher {
    healthy: Arc<AtomicBool>,
    limit_exceeded: Arc<AtomicBool>,
    _watcher: RecommendedWatcher,
}

impl SafeRescanWatcher {
    fn start(picker: SharedFilePicker, workspace: Workspace) -> Result<Self, SearchError> {
        let healthy = Arc::new(AtomicBool::new(true));
        let callback_health = Arc::clone(&healthy);
        let limit_exceeded = Arc::new(AtomicBool::new(false));
        let callback_limit = Arc::clone(&limit_exceeded);
        let frecency = SharedFrecency::default();
        let root = workspace.root().to_path_buf();
        let mut watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                if event.is_err() {
                    callback_health.store(false, Ordering::Release);
                    return;
                }
                schedule_safe_rescan(
                    &picker,
                    &frecency,
                    &workspace,
                    MAXIMUM_INDEXED_PATHS,
                    &callback_health,
                    &callback_limit,
                );
            })
            .map_err(|_| SearchError::WatcherStartupFailed)?;
        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|_| SearchError::WatcherStartupFailed)?;
        Ok(Self {
            healthy,
            limit_exceeded,
            _watcher: watcher,
        })
    }

    fn ensure_healthy(&self) -> Result<(), SearchError> {
        if self.limit_exceeded.load(Ordering::Acquire) {
            Err(SearchError::IndexLimitExceeded)
        } else if self.healthy.load(Ordering::Acquire) {
            Ok(())
        } else {
            Err(SearchError::IndexStale)
        }
    }

    #[cfg(test)]
    fn mark_stale(&self) {
        self.healthy.store(false, Ordering::Release);
    }
}

fn schedule_safe_rescan(
    picker: &SharedFilePicker,
    frecency: &SharedFrecency,
    workspace: &Workspace,
    maximum: usize,
    healthy: &AtomicBool,
    limit_exceeded: &AtomicBool,
) {
    if workspace.ensure_current().is_err() {
        healthy.store(false, Ordering::Release);
        return;
    }
    match enforce_index_limit_with(workspace.root(), maximum) {
        Ok(()) if picker.trigger_full_rescan_async(frecency).is_ok() => {}
        Err(SearchError::IndexLimitExceeded) => {
            limit_exceeded.store(true, Ordering::Release);
            healthy.store(false, Ordering::Release);
        }
        Ok(()) | Err(_) => healthy.store(false, Ordering::Release),
    }
}

fn match_line(
    request: &TextSearchRequest,
    regex: Option<&regex::Regex>,
    line: &str,
) -> Option<(usize, Option<u16>)> {
    match request.mode {
        TextSearchMode::Literal => {
            let column = if effective_case_sensitive(request) {
                line.find(&request.query)
            } else {
                find_ascii_case_insensitive(line.as_bytes(), request.query.as_bytes())
            }?;
            Some((column, None))
        }
        TextSearchMode::Regex => regex?.find(line).map(|found| (found.start(), None)),
        TextSearchMode::Fuzzy => {
            let result = match_list_indices(&request.query, &[line], &FuzzyConfig::default())
                .into_iter()
                .next()?;
            let column = result.indices.iter().copied().min().unwrap_or(0);
            Some((column, Some(result.score)))
        }
    }
}

fn effective_case_sensitive(request: &TextSearchRequest) -> bool {
    request.case_sensitive || request.query.bytes().any(|byte| byte.is_ascii_uppercase())
}

fn find_ascii_case_insensitive(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|window| {
        window
            .iter()
            .zip(needle)
            .all(|(left, right)| left.eq_ignore_ascii_case(right))
    })
}

fn bounded_snippet(line: &str) -> String {
    if line.len() <= MAXIMUM_SNIPPET_BYTES {
        return line.to_owned();
    }
    let mut boundary = MAXIMUM_SNIPPET_BYTES;
    while !line.is_char_boundary(boundary) {
        boundary -= 1;
    }
    line[..boundary].to_owned()
}

fn context_before(lines: &[&str], index: usize, count: usize) -> Vec<String> {
    lines[index.saturating_sub(count)..index]
        .iter()
        .map(|line| bounded_snippet(line))
        .collect()
}

fn context_after(lines: &[&str], index: usize, count: usize) -> Vec<String> {
    let start = index.saturating_add(1).min(lines.len());
    let end = start.saturating_add(count).min(lines.len());
    lines[start..end]
        .iter()
        .map(|line| bounded_snippet(line))
        .collect()
}

fn matches_constraint(path: &str, constraint: &str) -> bool {
    path == constraint
        || path
            .strip_prefix(constraint)
            .is_some_and(|suffix| suffix.starts_with('/'))
}

fn validate_query(query: &str) -> Result<(), SearchError> {
    if query.is_empty()
        || query.len() > MAXIMUM_QUERY_BYTES
        || query.as_bytes().contains(&0)
        || query
            .chars()
            .all(|character| character.is_whitespace() || matches!(character, '*' | '?'))
    {
        Err(SearchError::InvalidArguments)
    } else {
        Ok(())
    }
}

fn validate_page(limit: usize, cursor: Option<&str>) -> Result<(), SearchError> {
    if limit == 0 || limit > MAXIMUM_RESULTS || cursor.is_some_and(|cursor| cursor.len() > 128) {
        Err(SearchError::InvalidArguments)
    } else {
        Ok(())
    }
}

fn format_cursor(generation: u64, offset: usize) -> String {
    format!("p4.{generation}.{offset}")
}

#[derive(Clone, Copy)]
struct TextCursor {
    file: usize,
    line: usize,
}

fn format_text_cursor(generation: u64, file: usize, line: usize) -> String {
    format!("t4.{generation}.{file}.{line}")
}

fn parse_text_cursor(generation: u64, cursor: Option<&str>) -> Result<TextCursor, SearchError> {
    let Some(cursor) = cursor else {
        return Ok(TextCursor { file: 0, line: 0 });
    };
    let mut parts = cursor.split('.');
    let prefix = parts.next();
    let cursor_generation = parts.next().and_then(|value| value.parse::<u64>().ok());
    let file = parts.next().and_then(|value| value.parse::<usize>().ok());
    let line = parts.next().and_then(|value| value.parse::<usize>().ok());
    if prefix != Some("t4")
        || cursor_generation != Some(generation)
        || parts.next().is_some()
        || file.is_none()
        || line.is_none()
    {
        return Err(SearchError::StaleCursor);
    }
    Ok(TextCursor {
        file: file.unwrap(),
        line: line.unwrap(),
    })
}

#[cfg(unix)]
fn file_identity(metadata: &std::fs::Metadata) -> (u64, u64, u64, i64, i64, i64, i64) {
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
fn file_identity(metadata: &std::fs::Metadata) -> (u64, Option<std::time::SystemTime>) {
    (metadata.len(), metadata.modified().ok())
}

fn parse_cursor(generation: u64, cursor: Option<&str>) -> Result<usize, SearchError> {
    let Some(cursor) = cursor else {
        return Ok(0);
    };
    let mut parts = cursor.split('.');
    let prefix = parts.next();
    let cursor_generation = parts.next().and_then(|value| value.parse::<u64>().ok());
    let offset = parts.next().and_then(|value| value.parse::<usize>().ok());
    if prefix != Some("p4")
        || cursor_generation != Some(generation)
        || parts.next().is_some()
        || offset.is_none()
    {
        return Err(SearchError::StaleCursor);
    }
    Ok(offset.unwrap())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchState {
    Building,
    Ready,
    Stale,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FileSearchRequest {
    pub query: String,
    pub path: Option<String>,
    pub limit: usize,
    pub cursor: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct FileMatch {
    pub path: String,
    pub score: i32,
    pub match_kind: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct FileSearchResult {
    pub generation: u64,
    pub state: SearchState,
    pub matches: Vec<FileMatch>,
    pub next_cursor: Option<String>,
    pub total_matches: usize,
}

impl FileSearchResult {
    pub fn model_content(&self) -> Result<String, SearchError> {
        serde_json::to_string(self).map_err(|_| SearchError::SearchFailed)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TextSearchMode {
    Literal,
    Regex,
    Fuzzy,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TextSearchRequest {
    pub query: String,
    pub path: Option<String>,
    pub mode: TextSearchMode,
    pub case_sensitive: bool,
    pub context_lines: usize,
    pub limit: usize,
    pub cursor: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct TextMatch {
    pub path: String,
    pub line: u64,
    pub column: usize,
    pub text: String,
    pub context_before: Vec<String>,
    pub context_after: Vec<String>,
    pub fuzzy_score: Option<u16>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct TextSearchResult {
    pub generation: u64,
    pub state: SearchState,
    pub matches: Vec<TextMatch>,
    pub next_cursor: Option<String>,
    pub files_searched: usize,
    pub searchable_files: usize,
    pub skipped_unreadable: usize,
    pub skipped_too_large: usize,
    pub skipped_unsupported: usize,
    pub skipped_changed: usize,
}

impl TextSearchResult {
    pub fn model_content(&self) -> Result<String, SearchError> {
        serde_json::to_string(self).map_err(|_| SearchError::SearchFailed)
    }
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum SearchError {
    #[error("search arguments are invalid")]
    InvalidArguments,
    #[error("search regular expression is invalid")]
    InvalidRegex,
    #[error("search preflight failed")]
    PreflightFailed,
    #[error("search index startup failed")]
    IndexStartupFailed,
    #[error("search watcher startup failed")]
    WatcherStartupFailed,
    #[error("search index is still building")]
    IndexBuilding,
    #[error("search index is stale")]
    IndexStale,
    #[error("search index path limit exceeded")]
    IndexLimitExceeded,
    #[error("search cursor belongs to another index generation")]
    StaleCursor,
    #[error("search cancelled")]
    Cancelled,
    #[error("search failed")]
    SearchFailed,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn service() -> (tempfile::TempDir, WorkspaceSearch) {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("src")).unwrap();
        std::fs::write(
            root.path().join("src/main.rs"),
            "fn main() { println!(\"needle\"); }\n",
        )
        .unwrap();
        std::fs::write(root.path().join("README.md"), "needle in docs\n").unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let search = WorkspaceSearch::start(workspace).unwrap();
        assert!(search.picker.wait_for_scan(Duration::from_secs(10)));
        (root, search)
    }

    #[test]
    fn fuzzy_file_and_literal_text_search_are_bounded() {
        let (_root, search) = service();
        let files = search
            .search_files(&FileSearchRequest {
                query: "main".into(),
                path: Some("src".into()),
                limit: 1,
                cursor: None,
            })
            .unwrap();
        assert_eq!(files.matches[0].path, "src/main.rs");
        let text = search
            .search_text(
                &TextSearchRequest {
                    query: "needle".into(),
                    path: None,
                    mode: TextSearchMode::Literal,
                    case_sensitive: true,
                    context_lines: 0,
                    limit: 10,
                    cursor: None,
                },
                &CancellationToken::new(),
            )
            .unwrap();
        assert_eq!(text.matches.len(), 2);
    }

    #[test]
    fn initial_outside_symlink_is_not_indexed_or_read() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret.txt"), "outside-marker\n").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(outside.path(), root.path().join("escape")).unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let search = WorkspaceSearch::start(workspace).unwrap();
        assert!(search.picker.wait_for_scan(Duration::from_secs(10)));
        let result = search.search_text(
            &TextSearchRequest {
                query: "outside-marker".into(),
                path: None,
                mode: TextSearchMode::Literal,
                case_sensitive: true,
                context_lines: 0,
                limit: 10,
                cursor: None,
            },
            &CancellationToken::new(),
        );
        #[cfg(unix)]
        assert!(result.unwrap().matches.is_empty());
    }

    #[test]
    fn stale_generation_cursor_is_rejected() {
        let (_root, search) = service();
        assert_eq!(
            parse_cursor(
                search.generation() + 1,
                Some(&format_cursor(search.generation(), 2))
            ),
            Err(SearchError::StaleCursor)
        );
        assert!(matches!(
            parse_text_cursor(
                search.generation() + 1,
                Some(&format_text_cursor(search.generation(), 2, 3))
            ),
            Err(SearchError::StaleCursor)
        ));
    }

    #[test]
    fn text_cursor_resumes_within_the_same_file_without_skipping_matches() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(
            root.path().join("many.txt"),
            "needle one\nneedle two\nneedle three\n",
        )
        .unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let search = WorkspaceSearch::start(workspace).unwrap();
        assert!(search.picker.wait_for_scan(Duration::from_secs(10)));
        let first = search
            .search_text(
                &TextSearchRequest {
                    query: "needle".into(),
                    path: Some("many.txt".into()),
                    mode: TextSearchMode::Literal,
                    case_sensitive: true,
                    context_lines: 0,
                    limit: 1,
                    cursor: None,
                },
                &CancellationToken::new(),
            )
            .unwrap();
        assert_eq!(first.matches[0].line, 1);
        let second = search
            .search_text(
                &TextSearchRequest {
                    query: "needle".into(),
                    path: Some("many.txt".into()),
                    mode: TextSearchMode::Literal,
                    case_sensitive: true,
                    context_lines: 0,
                    limit: 1,
                    cursor: first.next_cursor,
                },
                &CancellationToken::new(),
            )
            .unwrap();
        assert_eq!(second.matches[0].line, 2);
    }

    #[test]
    fn safe_rescan_observes_changes_without_indexing_outside_symlinks() {
        let (root, search) = service();
        std::fs::write(root.path().join("added.rs"), "added_marker\n").unwrap();
        wait_for_path(&search, "added", "added.rs", true);

        std::fs::rename(root.path().join("added.rs"), root.path().join("renamed.rs")).unwrap();
        wait_for_path(&search, "renamed", "renamed.rs", true);
        wait_for_path(&search, "added", "added.rs", false);

        std::fs::write(root.path().join("atomic-save.tmp"), "atomic_save_marker\n").unwrap();
        std::fs::rename(
            root.path().join("atomic-save.tmp"),
            root.path().join("README.md"),
        )
        .unwrap();
        wait_for_text(&search, "atomic_save_marker");

        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret"), "watcher_outside_marker\n").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(
            outside.path().join("secret"),
            root.path().join("outside-link"),
        )
        .unwrap();
        std::thread::sleep(Duration::from_secs(1));
        let result = search
            .search_text(
                &TextSearchRequest {
                    query: "watcher_outside_marker".into(),
                    path: None,
                    mode: TextSearchMode::Literal,
                    case_sensitive: true,
                    context_lines: 0,
                    limit: 10,
                    cursor: None,
                },
                &CancellationToken::new(),
            )
            .unwrap();
        assert!(result.matches.is_empty());

        std::fs::rename(
            root.path().join("renamed.rs"),
            outside.path().join("moved-out-of-workspace.rs"),
        )
        .unwrap();
        wait_for_path(&search, "renamed", "renamed.rs", false);
    }

    #[test]
    fn watcher_failure_transitions_search_to_stale() {
        let (_root, search) = service();
        search.watcher.mark_stale();
        assert_eq!(search.state(), SearchState::Stale);
        assert_eq!(
            search.search_files(&FileSearchRequest {
                query: "main".into(),
                path: None,
                limit: 10,
                cursor: None,
            }),
            Err(SearchError::IndexStale)
        );
    }

    #[test]
    fn dirty_rescan_preflight_marks_limit_without_scheduling() {
        let (_root, search) = service();
        let healthy = AtomicBool::new(true);
        let limit_exceeded = AtomicBool::new(false);
        schedule_safe_rescan(
            &search.picker,
            &SharedFrecency::default(),
            &search.workspace,
            1,
            &healthy,
            &limit_exceeded,
        );
        assert!(!healthy.load(Ordering::Acquire));
        assert!(limit_exceeded.load(Ordering::Acquire));
    }

    #[test]
    fn root_path_replacement_makes_search_stale() {
        let parent = tempfile::tempdir().unwrap();
        let root = parent.path().join("workspace");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("original.txt"), "marker\n").unwrap();
        let workspace = Workspace::open(&root).unwrap();
        let search = WorkspaceSearch::start(workspace).unwrap();
        assert!(search.picker.wait_for_scan(Duration::from_secs(10)));
        std::fs::rename(&root, parent.path().join("old-workspace")).unwrap();
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("replacement.txt"), "marker\n").unwrap();
        assert_eq!(search.state(), SearchState::Stale);
        assert_eq!(
            search.search_files(&FileSearchRequest {
                query: "replacement".into(),
                path: None,
                limit: 10,
                cursor: None,
            }),
            Err(SearchError::IndexStale)
        );
    }

    #[test]
    fn regex_fuzzy_ignore_binary_large_and_pagination_are_observable() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join(".gitignore"), "ignored.txt\n").unwrap();
        std::fs::write(root.path().join("ignored.txt"), "needle ignored\n").unwrap();
        for name in ["needle-a.txt", "needle-b.txt", "needle-c.txt"] {
            std::fs::write(root.path().join(name), "Alpha needle value\n").unwrap();
        }
        std::fs::write(root.path().join("binary.txt"), b"needle\0binary").unwrap();
        let large = std::fs::File::create(root.path().join("large.txt")).unwrap();
        large.set_len(MAXIMUM_FILE_BYTES + 1).unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        let search = WorkspaceSearch::start(workspace).unwrap();
        assert!(search.picker.wait_for_scan(Duration::from_secs(10)));

        let first = search
            .search_files(&FileSearchRequest {
                query: "needle".into(),
                path: None,
                limit: 1,
                cursor: None,
            })
            .unwrap();
        assert_eq!(first.matches.len(), 1);
        assert!(first.next_cursor.is_some());
        let second = search
            .search_files(&FileSearchRequest {
                query: "needle".into(),
                path: None,
                limit: 1,
                cursor: first.next_cursor,
            })
            .unwrap();
        assert_eq!(second.matches.len(), 1);
        assert_ne!(first.matches[0].path, second.matches[0].path);

        for mode in [TextSearchMode::Regex, TextSearchMode::Fuzzy] {
            let query = if mode == TextSearchMode::Regex {
                "Alpha\\s+needle"
            } else {
                "Al ndl"
            };
            let result = search
                .search_text(
                    &TextSearchRequest {
                        query: query.into(),
                        path: None,
                        mode,
                        case_sensitive: true,
                        context_lines: 0,
                        limit: 10,
                        cursor: None,
                    },
                    &CancellationToken::new(),
                )
                .unwrap();
            assert!(!result.matches.is_empty(), "mode={mode:?}");
            assert!(
                result
                    .matches
                    .iter()
                    .all(|found| found.path != "ignored.txt")
            );
            assert!(result.skipped_unsupported >= 1);
            assert!(result.skipped_too_large >= 1);
        }
    }

    #[test]
    #[ignore = "qualification measurement; run explicitly on supported macOS"]
    fn qualification_reports_repo_scan_metrics() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let workspace = Workspace::open(root).unwrap();
        enforce_index_limit(root).unwrap();
        let started = Instant::now();
        let search = WorkspaceSearch::start(workspace).unwrap();
        assert!(search.picker.wait_for_scan(Duration::from_secs(30)));
        std::thread::sleep(Duration::from_millis(250));
        let picker = search.picker.read().unwrap();
        let indexed = picker.as_ref().unwrap().live_file_count();
        let resident_kib = std::process::Command::new("/bin/ps")
            .args(["-o", "rss=", "-p", &std::process::id().to_string()])
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .and_then(|output| output.trim().parse::<u64>().ok())
            .unwrap_or(0);
        eprintln!(
            "phase4_search_metrics indexed={indexed} initial_scan_ms={} steady_resident_kib={resident_kib}",
            started.elapsed().as_millis(),
        );
        assert_ne!(
            resident_kib, 0,
            "macOS resident-set measurement unavailable"
        );
    }

    fn wait_for_path(search: &WorkspaceSearch, query: &str, path: &str, present: bool) {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let observed = search
                .search_files(&FileSearchRequest {
                    query: query.into(),
                    path: None,
                    limit: 100,
                    cursor: None,
                })
                .ok()
                .is_some_and(|result| result.matches.iter().any(|found| found.path == path));
            if observed == present {
                return;
            }
            assert!(
                Instant::now() < deadline,
                "path state did not converge: {path}"
            );
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    fn wait_for_text(search: &WorkspaceSearch, query: &str) {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let observed = search
                .search_text(
                    &TextSearchRequest {
                        query: query.into(),
                        path: None,
                        mode: TextSearchMode::Literal,
                        case_sensitive: true,
                        context_lines: 0,
                        limit: 10,
                        cursor: None,
                    },
                    &CancellationToken::new(),
                )
                .ok()
                .is_some_and(|result| !result.matches.is_empty());
            if observed {
                return;
            }
            assert!(Instant::now() < deadline, "text state did not converge");
            std::thread::sleep(Duration::from_millis(50));
        }
    }
}
