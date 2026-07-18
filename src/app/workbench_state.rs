//! Pure, bounded state for the native workbench.
//!
//! This module deliberately contains no filesystem, session, GPUI, or process operations.  It
//! is the identity and transaction boundary between application services and native views.

use std::cmp::Ordering;
use std::collections::VecDeque;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};

use unicode_segmentation::UnicodeSegmentation;

use crate::agent::types::{SessionId, ToolCallId, TurnId, WorkspaceId};

use super::workbench_preferences::{
    DEFAULT_FILES_FRACTION, DEFAULT_INSPECTION_FRACTION, DEFAULT_NAVIGATION_FRACTION,
    DEFAULT_TERMINAL_FRACTION, MAX_FILES_FRACTION, MAX_INSPECTION_FRACTION,
    MAX_NAVIGATION_FRACTION, MAX_TERMINAL_FRACTION, MIN_FILES_FRACTION, MIN_INSPECTION_FRACTION,
    MIN_NAVIGATION_FRACTION, MIN_TERMINAL_FRACTION, PaneFractionsV2, PaneVisibilityPreferences,
    WorkbenchPreferencesV2, WorkspaceRegistrationId,
};

pub const MAX_WORKSPACES: usize = 64;
pub const MAX_CATALOG_ENTRIES: usize = 1_024;
pub const MAX_CHAT_TABS: usize = 16;
pub const MAX_FILE_TABS: usize = 32;
pub const MAX_TERMINAL_PLACEHOLDERS: usize = 8;
pub const MAX_DIAGNOSTICS: usize = 128;
pub const MAX_PATH_BYTES: usize = 4 * 1024;
pub const MAX_TITLE_GRAPHEMES: usize = 80;
pub const MAX_TITLE_BYTES: usize = 4 * 1024;
pub const MAX_DISPLAY_NAME_BYTES: usize = 256;
pub const MAX_TIMESTAMP_BYTES: usize = 128;
pub const MAX_PROFILE_FIELD_BYTES: usize = 256;
pub const MINIMUM_CHAT_WIDTH: u32 = 480;
pub const MINIMUM_NAVIGATION_WIDTH: u32 = 180;
pub const MINIMUM_INSPECTION_WIDTH: u32 = 360;
pub const MINIMUM_FILES_WIDTH: u32 = 200;

/// A non-chat shell pane. Chat is structural and deliberately omitted.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WorkbenchPane {
    Navigation,
    Inspection,
    Files,
    Terminal,
}

/// A bounded normalized fraction represented without floating-point state drift.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PaneFraction(u16);

impl PaneFraction {
    const SCALE: f64 = 10_000.0;

    pub fn from_fraction(value: f64) -> Self {
        let bounded = if value.is_finite() {
            value.clamp(0.0, 1.0)
        } else {
            0.0
        };
        Self((bounded * Self::SCALE).round() as u16)
    }

    pub fn as_fraction(self) -> f64 {
        f64::from(self.0) / Self::SCALE
    }
}

/// Explicit, process-independent pane presentation state.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PanePresentation {
    navigation_visible: bool,
    inspection_visible: bool,
    files_visible: bool,
    terminal_visible: bool,
    navigation_fraction: PaneFraction,
    inspection_fraction: PaneFraction,
    files_fraction: PaneFraction,
    terminal_fraction: PaneFraction,
}

impl Default for PanePresentation {
    fn default() -> Self {
        Self {
            navigation_visible: false,
            inspection_visible: false,
            files_visible: false,
            terminal_visible: false,
            navigation_fraction: PaneFraction::from_fraction(DEFAULT_NAVIGATION_FRACTION),
            inspection_fraction: PaneFraction::from_fraction(DEFAULT_INSPECTION_FRACTION),
            files_fraction: PaneFraction::from_fraction(DEFAULT_FILES_FRACTION),
            terminal_fraction: PaneFraction::from_fraction(DEFAULT_TERMINAL_FRACTION),
        }
    }
}

impl PanePresentation {
    pub fn from_preferences(preferences: &WorkbenchPreferencesV2) -> Self {
        Self {
            navigation_visible: preferences.pane_visibility.navigation,
            inspection_visible: preferences.pane_visibility.inspection,
            files_visible: preferences.pane_visibility.files,
            terminal_visible: preferences.pane_visibility.terminal,
            navigation_fraction: PaneFraction::from_fraction(preferences.pane_fractions.navigation),
            inspection_fraction: PaneFraction::from_fraction(preferences.pane_fractions.inspection),
            files_fraction: PaneFraction::from_fraction(preferences.pane_fractions.files),
            terminal_fraction: PaneFraction::from_fraction(preferences.pane_fractions.terminal),
        }
    }

    pub fn visibility(&self, pane: WorkbenchPane) -> bool {
        match pane {
            WorkbenchPane::Navigation => self.navigation_visible,
            WorkbenchPane::Inspection => self.inspection_visible,
            WorkbenchPane::Files => self.files_visible,
            WorkbenchPane::Terminal => self.terminal_visible,
        }
    }

    pub fn fraction(&self, pane: WorkbenchPane) -> PaneFraction {
        match pane {
            WorkbenchPane::Navigation => self.navigation_fraction,
            WorkbenchPane::Inspection => self.inspection_fraction,
            WorkbenchPane::Files => self.files_fraction,
            WorkbenchPane::Terminal => self.terminal_fraction,
        }
    }

    pub fn visibility_preferences(&self) -> PaneVisibilityPreferences {
        PaneVisibilityPreferences {
            navigation: self.navigation_visible,
            inspection: self.inspection_visible,
            files: self.files_visible,
            terminal: self.terminal_visible,
        }
    }

    pub fn fraction_preferences(&self) -> PaneFractionsV2 {
        PaneFractionsV2 {
            navigation: self.navigation_fraction.as_fraction(),
            inspection: self.inspection_fraction.as_fraction(),
            files: self.files_fraction.as_fraction(),
            terminal: self.terminal_fraction.as_fraction(),
        }
    }

    pub fn reveal(&mut self, pane: WorkbenchPane) {
        match pane {
            WorkbenchPane::Navigation => self.navigation_visible = true,
            WorkbenchPane::Inspection => self.inspection_visible = true,
            WorkbenchPane::Files => self.files_visible = true,
            // Terminal visibility is presentation-only and independent of inspection. Revealing
            // it never starts, focuses, or restarts a PTY; that remains a terminal-actor intent.
            WorkbenchPane::Terminal => self.terminal_visible = true,
        }
    }

    pub fn hide(&mut self, pane: WorkbenchPane) {
        match pane {
            WorkbenchPane::Navigation => self.navigation_visible = false,
            WorkbenchPane::Inspection => self.inspection_visible = false,
            WorkbenchPane::Files => self.files_visible = false,
            WorkbenchPane::Terminal => self.terminal_visible = false,
        }
    }

    pub fn toggle(&mut self, pane: WorkbenchPane) {
        if self.visibility(pane) {
            self.hide(pane);
        } else {
            self.reveal(pane);
        }
    }

    pub fn set_fraction(&mut self, pane: WorkbenchPane, fraction: PaneFraction) {
        let fraction =
            PaneFraction::from_fraction(clamp_pane_fraction(pane, fraction.as_fraction()));
        match pane {
            WorkbenchPane::Navigation => self.navigation_fraction = fraction,
            WorkbenchPane::Inspection => self.inspection_fraction = fraction,
            WorkbenchPane::Files => self.files_fraction = fraction,
            WorkbenchPane::Terminal => self.terminal_fraction = fraction,
        }
    }

    /// Computes width-pressure presentation without changing the user's explicit reveal choice.
    /// The collapse order is files, navigation, then inspection; chat is always reachable.
    pub fn layout_for_width(&self, width: u32) -> PaneLayout {
        let mut navigation_visible = self.navigation_visible;
        let mut inspection_visible = self.inspection_visible;
        let mut files_visible = self.files_visible;
        let required_width = |navigation: bool, inspection: bool, files: bool| {
            MINIMUM_CHAT_WIDTH
                + if navigation {
                    MINIMUM_NAVIGATION_WIDTH
                } else {
                    0
                }
                + if inspection {
                    MINIMUM_INSPECTION_WIDTH
                } else {
                    0
                }
                + if files { MINIMUM_FILES_WIDTH } else { 0 }
        };
        if required_width(navigation_visible, inspection_visible, files_visible) > width {
            files_visible = false;
        }
        if required_width(navigation_visible, inspection_visible, files_visible) > width {
            navigation_visible = false;
        }
        if required_width(navigation_visible, inspection_visible, files_visible) > width {
            inspection_visible = false;
        }
        PaneLayout {
            chat_visible: true,
            navigation_visible,
            inspection_visible,
            files_visible,
            // Terminal docks under chat and does not consume horizontal budget, so width
            // pressure never silently hides an explicitly revealed terminal.
            terminal_visible: self.terminal_visible,
        }
    }
}

fn clamp_pane_fraction(pane: WorkbenchPane, value: f64) -> f64 {
    let (minimum, maximum) = match pane {
        WorkbenchPane::Navigation => (MIN_NAVIGATION_FRACTION, MAX_NAVIGATION_FRACTION),
        WorkbenchPane::Inspection => (MIN_INSPECTION_FRACTION, MAX_INSPECTION_FRACTION),
        WorkbenchPane::Files => (MIN_FILES_FRACTION, MAX_FILES_FRACTION),
        WorkbenchPane::Terminal => (MIN_TERMINAL_FRACTION, MAX_TERMINAL_FRACTION),
    };
    value.clamp(minimum, maximum)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PaneLayout {
    pub chat_visible: bool,
    pub navigation_visible: bool,
    pub inspection_visible: bool,
    pub files_visible: bool,
    pub terminal_visible: bool,
}

static WORKSPACE_GENERATION: AtomicU64 = AtomicU64::new(1);
static SELECTION_GENERATION: AtomicU64 = AtomicU64::new(1);
static TREE_REQUEST: AtomicU64 = AtomicU64::new(1);
static FILE_REQUEST: AtomicU64 = AtomicU64::new(1);
static GIT_REQUEST: AtomicU64 = AtomicU64::new(1);
static TERMINAL_PLACEHOLDER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct WorkspaceGeneration(u64);
impl WorkspaceGeneration {
    pub fn new() -> Self {
        Self(WORKSPACE_GENERATION.fetch_add(1, AtomicOrdering::Relaxed))
    }
}
impl Default for WorkspaceGeneration {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct SelectionGeneration(u64);
impl SelectionGeneration {
    pub fn new() -> Self {
        Self(SELECTION_GENERATION.fetch_add(1, AtomicOrdering::Relaxed))
    }
}
impl Default for SelectionGeneration {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct TreeRequestId(u64);
impl TreeRequestId {
    pub fn new() -> Self {
        Self(TREE_REQUEST.fetch_add(1, AtomicOrdering::Relaxed))
    }
}
impl Default for TreeRequestId {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct FileRequestId(u64);
impl FileRequestId {
    pub fn new() -> Self {
        Self(FILE_REQUEST.fetch_add(1, AtomicOrdering::Relaxed))
    }
}
impl Default for FileRequestId {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct GitRequestId(u64);
impl GitRequestId {
    pub fn new() -> Self {
        Self(GIT_REQUEST.fetch_add(1, AtomicOrdering::Relaxed))
    }
}
impl Default for GitRequestId {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct TerminalPlaceholderId(u64);
impl TerminalPlaceholderId {
    pub fn new() -> Self {
        Self(TERMINAL_PLACEHOLDER.fetch_add(1, AtomicOrdering::Relaxed))
    }
}
impl Default for TerminalPlaceholderId {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RegistrationState {
    Closed,
    Opening,
    Ready,
    Missing,
    Stale,
    Failed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkspaceRegistration {
    pub registration_id: WorkspaceRegistrationId,
    pub canonical_path: PathBuf,
    pub display_name: String,
    pub last_selected_at: Option<u64>,
    pub state: RegistrationState,
}

impl WorkspaceRegistration {
    pub fn new(
        registration_id: WorkspaceRegistrationId,
        canonical_path: PathBuf,
        display_name: String,
    ) -> Result<Self, WorkbenchStateError> {
        validate_absolute_path(&canonical_path)?;
        validate_display_name(&display_name)?;
        Ok(Self {
            registration_id,
            canonical_path,
            display_name,
            last_selected_at: None,
            state: RegistrationState::Closed,
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SessionCompatibility {
    Compatible,
    Incompatible,
    ReadOnly,
    Damaged,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionProfileSummary {
    pub model: String,
    pub thinking_mode: String,
    pub reasoning_effort: String,
}

impl SessionProfileSummary {
    pub fn new(
        model: String,
        thinking_mode: String,
        reasoning_effort: String,
    ) -> Result<Self, WorkbenchStateError> {
        validate_profile_field(&model)?;
        validate_profile_field(&thinking_mode)?;
        validate_profile_field(&reasoning_effort)?;
        Ok(Self {
            model,
            thinking_mode,
            reasoning_effort,
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WorkspaceClassification {
    Registered(WorkspaceRegistrationId),
    Missing,
    Unregistered,
    Damaged,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionCatalogEntry {
    pub session_id: SessionId,
    pub workspace_classification: WorkspaceClassification,
    pub title: String,
    pub last_recorded_at: String,
    pub profile: Option<SessionProfileSummary>,
    pub compatibility: SessionCompatibility,
    pub active: bool,
}

impl SessionCatalogEntry {
    pub fn new(
        session_id: SessionId,
        workspace_classification: WorkspaceClassification,
        title: String,
        last_recorded_at: String,
        profile: Option<SessionProfileSummary>,
        compatibility: SessionCompatibility,
    ) -> Result<Self, WorkbenchStateError> {
        let title = bounded_title(&title)?;
        validate_timestamp(&last_recorded_at)?;
        Ok(Self {
            session_id,
            workspace_classification,
            title,
            last_recorded_at,
            profile,
            compatibility,
            active: false,
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionCatalog {
    entries: Vec<SessionCatalogEntry>,
}

impl Default for SessionCatalog {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionCatalog {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }

    pub fn entries(&self) -> &[SessionCatalogEntry] {
        &self.entries
    }

    pub fn upsert(&mut self, entry: SessionCatalogEntry) {
        if let Some(existing) = self
            .entries
            .iter_mut()
            .find(|existing| existing.session_id == entry.session_id)
        {
            let active = existing.active;
            *existing = entry;
            existing.active = active;
        } else {
            self.entries.push(entry);
        }
        self.entries.sort_by(catalog_order);
        self.entries.truncate(MAX_CATALOG_ENTRIES);
    }

    pub fn remove(&mut self, session_id: SessionId) -> bool {
        let before = self.entries.len();
        self.entries.retain(|entry| entry.session_id != session_id);
        before != self.entries.len()
    }
}

fn catalog_order(left: &SessionCatalogEntry, right: &SessionCatalogEntry) -> Ordering {
    right
        .last_recorded_at
        .cmp(&left.last_recorded_at)
        .then_with(|| left.session_id.cmp(&right.session_id))
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ChatTab {
    pub registration_id: WorkspaceRegistrationId,
    pub session_id: SessionId,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FileTabKind {
    Source,
    Diff,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FileTab {
    pub registration_id: WorkspaceRegistrationId,
    pub relative_path: String,
    pub kind: FileTabKind,
}

impl FileTab {
    pub fn new(
        registration_id: WorkspaceRegistrationId,
        relative_path: String,
        kind: FileTabKind,
    ) -> Result<Self, WorkbenchStateError> {
        validate_relative_path(&relative_path)?;
        Ok(Self {
            registration_id,
            relative_path,
            kind,
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TerminalPlaceholder {
    pub id: TerminalPlaceholderId,
    pub registration_id: WorkspaceRegistrationId,
    pub workspace_generation: WorkspaceGeneration,
    pub title: String,
}

impl TerminalPlaceholder {
    pub fn new(
        registration_id: WorkspaceRegistrationId,
        workspace_generation: WorkspaceGeneration,
        title: String,
    ) -> Result<Self, WorkbenchStateError> {
        validate_display_name(&title)?;
        Ok(Self {
            id: TerminalPlaceholderId::new(),
            registration_id,
            workspace_generation,
            title,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RetainedWorkspaceAuthority {
    Retained,
    Unavailable,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SelectedWorkbenchContext {
    pub registration_id: WorkspaceRegistrationId,
    pub workspace_generation: WorkspaceGeneration,
    pub retained_workspace: RetainedWorkspaceAuthority,
    pub session_id: Option<SessionId>,
    pub session_workspace_id: Option<WorkspaceId>,
    pub selection_generation: SelectionGeneration,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SelectionTarget {
    pub registration_id: WorkspaceRegistrationId,
    pub session_id: Option<SessionId>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ActiveOperation {
    Turn(TurnId),
    Approval {
        turn_id: TurnId,
        approval_id: crate::agent::types::ApprovalId,
    },
    Tool {
        turn_id: TurnId,
        tool_call_id: ToolCallId,
    },
}

impl ActiveOperation {
    fn turn_id(self) -> TurnId {
        match self {
            Self::Turn(id) => id,
            Self::Approval { turn_id, .. } | Self::Tool { turn_id, .. } => turn_id,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SelectionPhase {
    Idle,
    Selecting {
        target: SelectionTarget,
        generation: SelectionGeneration,
    },
    CancelPending {
        target: SelectionTarget,
        generation: SelectionGeneration,
        turn_id: TurnId,
    },
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct PendingRequests {
    pub tree: Option<(WorkspaceRegistrationId, WorkspaceGeneration, TreeRequestId)>,
    pub file: Option<(WorkspaceRegistrationId, WorkspaceGeneration, FileRequestId)>,
    pub git: Option<(WorkspaceRegistrationId, WorkspaceGeneration, GitRequestId)>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WorkbenchIntent {
    RevealPane {
        pane: WorkbenchPane,
    },
    HidePane {
        pane: WorkbenchPane,
    },
    TogglePane {
        pane: WorkbenchPane,
    },
    SetPaneFraction {
        pane: WorkbenchPane,
        fraction: PaneFraction,
    },
    RegisterWorkspace {
        canonical_path: PathBuf,
        display_name: String,
    },
    RemoveWorkspace {
        registration_id: WorkspaceRegistrationId,
    },
    SetRegistrationState {
        registration_id: WorkspaceRegistrationId,
        state: RegistrationState,
    },
    OpenChatTab {
        registration_id: WorkspaceRegistrationId,
        session_id: SessionId,
    },
    CloseChatTab {
        registration_id: WorkspaceRegistrationId,
        session_id: SessionId,
    },
    ReorderChatTab {
        from: usize,
        to: usize,
    },
    OpenFileTab {
        tab: FileTab,
    },
    CloseFileTab {
        tab: FileTab,
    },
    ReorderFileTab {
        from: usize,
        to: usize,
    },
    SelectContext {
        target: SelectionTarget,
    },
    CancelAndSwitch {
        target: SelectionTarget,
        turn_id: TurnId,
    },
    SetActiveOperation(ActiveOperation),
    ClearActiveOperation {
        turn_id: TurnId,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WorkbenchEvent {
    SelectionReady {
        generation: SelectionGeneration,
        registration_id: WorkspaceRegistrationId,
        workspace_generation: WorkspaceGeneration,
        retained_workspace: RetainedWorkspaceAuthority,
        session_id: Option<SessionId>,
        session_workspace_id: Option<WorkspaceId>,
    },
    SelectionFailed {
        generation: SelectionGeneration,
        code: &'static str,
    },
    AuthoritativeTurnTerminal {
        turn_id: TurnId,
    },
    TreeResult {
        registration_id: WorkspaceRegistrationId,
        workspace_generation: WorkspaceGeneration,
        request_id: TreeRequestId,
    },
    FileResult {
        registration_id: WorkspaceRegistrationId,
        workspace_generation: WorkspaceGeneration,
        request_id: FileRequestId,
    },
    GitResult {
        registration_id: WorkspaceRegistrationId,
        workspace_generation: WorkspaceGeneration,
        request_id: GitRequestId,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WorkbenchEffect {
    BeginSelection {
        target: SelectionTarget,
        generation: SelectionGeneration,
    },
    RequestTurnCancellation {
        turn_id: TurnId,
        target: SelectionTarget,
        generation: SelectionGeneration,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WorkbenchStateError {
    InvalidPath,
    InvalidDisplayName,
    InvalidTitle,
    InvalidTimestamp,
    InvalidProfile,
    DuplicateWorkspacePath,
    RegistryLimit,
    UnknownRegistration,
    DuplicateTab,
    TabLimit,
    InvalidTabIndex,
    SelectionInProgress,
    ActiveOperationBlocksSwitch,
    CancelTurnMismatch,
    StaleEvent,
    NoPendingRequest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkbenchState {
    pub pane_presentation: PanePresentation,
    pub registry: Vec<WorkspaceRegistration>,
    pub catalog: SessionCatalog,
    pub chat_tabs: Vec<ChatTab>,
    pub file_tabs: Vec<FileTab>,
    pub terminal_placeholders: Vec<TerminalPlaceholder>,
    pub selected: Option<SelectedWorkbenchContext>,
    pub selection: SelectionPhase,
    pub active_operation: Option<ActiveOperation>,
    pub pending_requests: PendingRequests,
    pub diagnostics: VecDeque<&'static str>,
}

impl Default for WorkbenchState {
    fn default() -> Self {
        Self::new()
    }
}

impl WorkbenchState {
    pub fn new() -> Self {
        Self {
            pane_presentation: PanePresentation::default(),
            registry: Vec::new(),
            catalog: SessionCatalog::new(),
            chat_tabs: Vec::new(),
            file_tabs: Vec::new(),
            terminal_placeholders: Vec::new(),
            selected: None,
            selection: SelectionPhase::Idle,
            active_operation: None,
            pending_requests: PendingRequests::default(),
            diagnostics: VecDeque::new(),
        }
    }

    /// Returns a deterministic presentation label without changing the persisted name.
    pub fn disambiguated_display_name(
        &self,
        registration_id: WorkspaceRegistrationId,
    ) -> Option<String> {
        let index = self
            .registry
            .iter()
            .position(|entry| entry.registration_id == registration_id)?;
        let entry = &self.registry[index];
        let duplicate_count = self
            .registry
            .iter()
            .take(index + 1)
            .filter(|candidate| candidate.display_name == entry.display_name)
            .count();
        let total = self
            .registry
            .iter()
            .filter(|candidate| candidate.display_name == entry.display_name)
            .count();
        if total == 1 {
            Some(entry.display_name.clone())
        } else {
            Some(format!("{} ({duplicate_count})", entry.display_name))
        }
    }

    pub fn pane_presentation(&self) -> PanePresentation {
        self.pane_presentation
    }

    pub fn restore_pane_presentation(&mut self, preferences: &WorkbenchPreferencesV2) {
        self.pane_presentation = PanePresentation::from_preferences(preferences);
    }

    pub fn reduce_intent(
        &mut self,
        intent: WorkbenchIntent,
    ) -> Result<Option<WorkbenchEffect>, WorkbenchStateError> {
        match intent {
            WorkbenchIntent::RevealPane { pane } => {
                self.pane_presentation.reveal(pane);
                Ok(None)
            }
            WorkbenchIntent::HidePane { pane } => {
                self.pane_presentation.hide(pane);
                Ok(None)
            }
            WorkbenchIntent::TogglePane { pane } => {
                self.pane_presentation.toggle(pane);
                Ok(None)
            }
            WorkbenchIntent::SetPaneFraction { pane, fraction } => {
                self.pane_presentation.set_fraction(pane, fraction);
                Ok(None)
            }
            WorkbenchIntent::RegisterWorkspace {
                canonical_path,
                display_name,
            } => {
                validate_absolute_path(&canonical_path)?;
                validate_display_name(&display_name)?;
                if self
                    .registry
                    .iter()
                    .any(|entry| entry.canonical_path == canonical_path)
                {
                    return Err(WorkbenchStateError::DuplicateWorkspacePath);
                }
                if self.registry.len() >= MAX_WORKSPACES {
                    return Err(WorkbenchStateError::RegistryLimit);
                }
                self.registry.push(WorkspaceRegistration::new(
                    WorkspaceRegistrationId::new(),
                    canonical_path,
                    display_name,
                )?);
                Ok(None)
            }
            WorkbenchIntent::RemoveWorkspace { registration_id } => {
                let index = self
                    .registry
                    .iter()
                    .position(|entry| entry.registration_id == registration_id)
                    .ok_or(WorkbenchStateError::UnknownRegistration)?;
                self.registry.remove(index);
                // Registration removal is navigation-only. Presentation tabs and terminal
                // placeholders retain their original identity rather than being retargeted.
                if self
                    .selected
                    .as_ref()
                    .is_some_and(|selected| selected.registration_id == registration_id)
                {
                    self.selected = None;
                }
                Ok(None)
            }
            WorkbenchIntent::SetRegistrationState {
                registration_id,
                state,
            } => {
                let registration = self
                    .registry
                    .iter_mut()
                    .find(|entry| entry.registration_id == registration_id)
                    .ok_or(WorkbenchStateError::UnknownRegistration)?;
                registration.state = state;
                Ok(None)
            }
            WorkbenchIntent::OpenChatTab {
                registration_id,
                session_id,
            } => {
                self.ensure_registration(registration_id)?;
                if self.chat_tabs.iter().any(|tab| {
                    tab.registration_id == registration_id && tab.session_id == session_id
                }) {
                    return Err(WorkbenchStateError::DuplicateTab);
                }
                if self.chat_tabs.len() >= MAX_CHAT_TABS {
                    return Err(WorkbenchStateError::TabLimit);
                }
                self.chat_tabs.push(ChatTab {
                    registration_id,
                    session_id,
                });
                if let Some(entry) = self
                    .catalog
                    .entries
                    .iter_mut()
                    .find(|entry| entry.session_id == session_id)
                {
                    entry.active = true;
                }
                Ok(None)
            }
            WorkbenchIntent::CloseChatTab {
                registration_id,
                session_id,
            } => {
                let before = self.chat_tabs.len();
                self.chat_tabs.retain(|tab| {
                    !(tab.registration_id == registration_id && tab.session_id == session_id)
                });
                if before == self.chat_tabs.len() {
                    return Err(WorkbenchStateError::DuplicateTab);
                }
                let active = self
                    .chat_tabs
                    .iter()
                    .any(|tab| tab.session_id == session_id);
                if let Some(entry) = self
                    .catalog
                    .entries
                    .iter_mut()
                    .find(|entry| entry.session_id == session_id)
                {
                    entry.active = active;
                }
                Ok(None)
            }
            WorkbenchIntent::ReorderChatTab { from, to } => reorder(&mut self.chat_tabs, from, to),
            WorkbenchIntent::OpenFileTab { tab } => {
                self.ensure_registration(tab.registration_id)?;
                validate_relative_path(&tab.relative_path)?;
                if self.file_tabs.contains(&tab) {
                    return Err(WorkbenchStateError::DuplicateTab);
                }
                if self.file_tabs.len() >= MAX_FILE_TABS {
                    return Err(WorkbenchStateError::TabLimit);
                }
                self.file_tabs.push(tab);
                Ok(None)
            }
            WorkbenchIntent::CloseFileTab { tab } => {
                let before = self.file_tabs.len();
                self.file_tabs.retain(|candidate| candidate != &tab);
                if before == self.file_tabs.len() {
                    return Err(WorkbenchStateError::DuplicateTab);
                }
                Ok(None)
            }
            WorkbenchIntent::ReorderFileTab { from, to } => reorder(&mut self.file_tabs, from, to),
            WorkbenchIntent::SelectContext { target } => self.begin_selection(target),
            WorkbenchIntent::CancelAndSwitch { target, turn_id } => {
                self.cancel_and_switch(target, turn_id)
            }
            WorkbenchIntent::SetActiveOperation(operation) => {
                self.active_operation = Some(operation);
                Ok(None)
            }
            WorkbenchIntent::ClearActiveOperation { turn_id } => {
                if self
                    .active_operation
                    .is_some_and(|operation| operation.turn_id() == turn_id)
                {
                    self.active_operation = None;
                }
                Ok(None)
            }
        }
    }

    pub fn reduce_event(
        &mut self,
        event: WorkbenchEvent,
    ) -> Result<Option<WorkbenchEffect>, WorkbenchStateError> {
        match event {
            WorkbenchEvent::SelectionReady {
                generation,
                registration_id,
                workspace_generation,
                retained_workspace,
                session_id,
                session_workspace_id,
            } => {
                let SelectionPhase::Selecting {
                    target,
                    generation: current,
                } = &self.selection
                else {
                    self.diagnose("stale_selection");
                    return Err(WorkbenchStateError::StaleEvent);
                };
                if *current != generation
                    || target.registration_id != registration_id
                    || target.session_id != session_id
                    || self
                        .registry
                        .iter()
                        .all(|entry| entry.registration_id != registration_id)
                {
                    self.diagnose("stale_selection");
                    return Err(WorkbenchStateError::StaleEvent);
                }
                self.selected = Some(SelectedWorkbenchContext {
                    registration_id,
                    workspace_generation,
                    retained_workspace,
                    session_id,
                    session_workspace_id,
                    selection_generation: generation,
                });
                self.selection = SelectionPhase::Idle;
                self.pending_requests = PendingRequests::default();
                Ok(None)
            }
            WorkbenchEvent::SelectionFailed { generation, code } => {
                if !matches!(&self.selection, SelectionPhase::Selecting { generation: current, .. } if *current == generation)
                {
                    self.diagnose("stale_selection_failure");
                    return Err(WorkbenchStateError::StaleEvent);
                }
                self.selection = SelectionPhase::Idle;
                self.diagnose(code);
                Ok(None)
            }
            WorkbenchEvent::AuthoritativeTurnTerminal { turn_id } => {
                if self
                    .active_operation
                    .is_none_or(|operation| operation.turn_id() != turn_id)
                {
                    self.diagnose("stale_terminal");
                    return Err(WorkbenchStateError::StaleEvent);
                }
                self.active_operation = None;
                let SelectionPhase::CancelPending {
                    target, generation, ..
                } = self.selection.clone()
                else {
                    return Ok(None);
                };
                self.selection = SelectionPhase::Selecting {
                    target: target.clone(),
                    generation,
                };
                Ok(Some(WorkbenchEffect::BeginSelection { target, generation }))
            }
            WorkbenchEvent::TreeResult {
                registration_id,
                workspace_generation,
                request_id,
            } => self.accept_tree_result(registration_id, workspace_generation, request_id),
            WorkbenchEvent::FileResult {
                registration_id,
                workspace_generation,
                request_id,
            } => self.accept_file_result(registration_id, workspace_generation, request_id),
            WorkbenchEvent::GitResult {
                registration_id,
                workspace_generation,
                request_id,
            } => self.accept_git_result(registration_id, workspace_generation, request_id),
        }
    }

    pub fn begin_tree_request(&mut self) -> Result<TreeRequestId, WorkbenchStateError> {
        let selected = self
            .selected
            .as_ref()
            .ok_or(WorkbenchStateError::UnknownRegistration)?;
        let request = TreeRequestId::new();
        self.pending_requests.tree = Some((
            selected.registration_id,
            selected.workspace_generation,
            request,
        ));
        Ok(request)
    }

    pub fn begin_file_request(&mut self) -> Result<FileRequestId, WorkbenchStateError> {
        let selected = self
            .selected
            .as_ref()
            .ok_or(WorkbenchStateError::UnknownRegistration)?;
        let request = FileRequestId::new();
        self.pending_requests.file = Some((
            selected.registration_id,
            selected.workspace_generation,
            request,
        ));
        Ok(request)
    }

    pub fn begin_git_request(&mut self) -> Result<GitRequestId, WorkbenchStateError> {
        let selected = self
            .selected
            .as_ref()
            .ok_or(WorkbenchStateError::UnknownRegistration)?;
        let request = GitRequestId::new();
        self.pending_requests.git = Some((
            selected.registration_id,
            selected.workspace_generation,
            request,
        ));
        Ok(request)
    }

    fn begin_selection(
        &mut self,
        target: SelectionTarget,
    ) -> Result<Option<WorkbenchEffect>, WorkbenchStateError> {
        self.ensure_registration(target.registration_id)?;
        if self.active_operation.is_some() {
            return Err(WorkbenchStateError::ActiveOperationBlocksSwitch);
        }
        if !matches!(&self.selection, SelectionPhase::Idle) {
            return Err(WorkbenchStateError::SelectionInProgress);
        }
        let generation = SelectionGeneration::new();
        self.selection = SelectionPhase::Selecting {
            target: target.clone(),
            generation,
        };
        Ok(Some(WorkbenchEffect::BeginSelection { target, generation }))
    }

    fn cancel_and_switch(
        &mut self,
        target: SelectionTarget,
        turn_id: TurnId,
    ) -> Result<Option<WorkbenchEffect>, WorkbenchStateError> {
        self.ensure_registration(target.registration_id)?;
        if self
            .active_operation
            .is_none_or(|operation| operation.turn_id() != turn_id)
        {
            return Err(WorkbenchStateError::CancelTurnMismatch);
        }
        if !matches!(&self.selection, SelectionPhase::Idle) {
            return Err(WorkbenchStateError::SelectionInProgress);
        }
        let generation = SelectionGeneration::new();
        self.selection = SelectionPhase::CancelPending {
            target: target.clone(),
            generation,
            turn_id,
        };
        Ok(Some(WorkbenchEffect::RequestTurnCancellation {
            turn_id,
            target,
            generation,
        }))
    }

    fn ensure_registration(
        &self,
        registration_id: WorkspaceRegistrationId,
    ) -> Result<(), WorkbenchStateError> {
        self.registry
            .iter()
            .any(|entry| entry.registration_id == registration_id)
            .then_some(())
            .ok_or(WorkbenchStateError::UnknownRegistration)
    }

    fn accept_tree_result(
        &mut self,
        registration_id: WorkspaceRegistrationId,
        workspace_generation: WorkspaceGeneration,
        request_id: TreeRequestId,
    ) -> Result<Option<WorkbenchEffect>, WorkbenchStateError> {
        if !self.request_matches(
            self.pending_requests.tree,
            registration_id,
            workspace_generation,
            request_id,
        ) {
            self.diagnose("stale_tree_result");
            return Err(WorkbenchStateError::StaleEvent);
        }
        self.pending_requests.tree = None;
        Ok(None)
    }
    fn accept_file_result(
        &mut self,
        registration_id: WorkspaceRegistrationId,
        workspace_generation: WorkspaceGeneration,
        request_id: FileRequestId,
    ) -> Result<Option<WorkbenchEffect>, WorkbenchStateError> {
        if !self.request_matches(
            self.pending_requests.file,
            registration_id,
            workspace_generation,
            request_id,
        ) {
            self.diagnose("stale_file_result");
            return Err(WorkbenchStateError::StaleEvent);
        }
        self.pending_requests.file = None;
        Ok(None)
    }
    fn accept_git_result(
        &mut self,
        registration_id: WorkspaceRegistrationId,
        workspace_generation: WorkspaceGeneration,
        request_id: GitRequestId,
    ) -> Result<Option<WorkbenchEffect>, WorkbenchStateError> {
        if !self.request_matches(
            self.pending_requests.git,
            registration_id,
            workspace_generation,
            request_id,
        ) {
            self.diagnose("stale_git_result");
            return Err(WorkbenchStateError::StaleEvent);
        }
        self.pending_requests.git = None;
        Ok(None)
    }
    fn request_matches<T: Copy + Eq>(
        &self,
        expected: Option<(WorkspaceRegistrationId, WorkspaceGeneration, T)>,
        registration_id: WorkspaceRegistrationId,
        workspace_generation: WorkspaceGeneration,
        request_id: T,
    ) -> bool {
        expected.is_some_and(
            |(expected_registration, expected_generation, expected_request)| {
                expected_registration == registration_id
                    && expected_generation == workspace_generation
                    && expected_request == request_id
                    && self.selected.as_ref().is_some_and(|selected| {
                        selected.registration_id == registration_id
                            && selected.workspace_generation == workspace_generation
                    })
            },
        )
    }
    fn diagnose(&mut self, code: &'static str) {
        if self.diagnostics.len() >= MAX_DIAGNOSTICS {
            self.diagnostics.pop_front();
        }
        self.diagnostics.push_back(code);
    }
}

fn reorder<T>(
    items: &mut [T],
    from: usize,
    to: usize,
) -> Result<Option<WorkbenchEffect>, WorkbenchStateError> {
    if from >= items.len() || to >= items.len() {
        return Err(WorkbenchStateError::InvalidTabIndex);
    }
    if from != to {
        items.swap(from, to);
    }
    Ok(None)
}

fn bounded_title(value: &str) -> Result<String, WorkbenchStateError> {
    if value.is_empty() {
        return Ok("New chat".into());
    }
    if value.chars().any(char::is_control) {
        return Err(WorkbenchStateError::InvalidTitle);
    }
    let title = value
        .graphemes(true)
        .take(MAX_TITLE_GRAPHEMES)
        .collect::<String>();
    if title.is_empty() || title.len() > MAX_TITLE_BYTES {
        Err(WorkbenchStateError::InvalidTitle)
    } else {
        Ok(title)
    }
}

fn validate_display_name(value: &str) -> Result<(), WorkbenchStateError> {
    if value.is_empty()
        || value.len() > MAX_DISPLAY_NAME_BYTES
        || value.contains('\0')
        || value.chars().any(char::is_control)
    {
        Err(WorkbenchStateError::InvalidDisplayName)
    } else {
        Ok(())
    }
}

fn validate_profile_field(value: &str) -> Result<(), WorkbenchStateError> {
    if value.is_empty()
        || value.len() > MAX_PROFILE_FIELD_BYTES
        || value.contains('\0')
        || value.chars().any(char::is_control)
    {
        Err(WorkbenchStateError::InvalidProfile)
    } else {
        Ok(())
    }
}

fn validate_timestamp(value: &str) -> Result<(), WorkbenchStateError> {
    if value.is_empty()
        || value.len() > MAX_TIMESTAMP_BYTES
        || value.contains('\0')
        || value.chars().any(char::is_control)
    {
        Err(WorkbenchStateError::InvalidTimestamp)
    } else {
        Ok(())
    }
}

fn validate_absolute_path(path: &Path) -> Result<(), WorkbenchStateError> {
    let text = path.to_str().ok_or(WorkbenchStateError::InvalidPath)?;
    if text.is_empty()
        || text.len() > MAX_PATH_BYTES
        || text.contains('\0')
        || !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err(WorkbenchStateError::InvalidPath);
    }
    Ok(())
}

fn validate_relative_path(value: &str) -> Result<(), WorkbenchStateError> {
    if value.is_empty()
        || value.len() > MAX_PATH_BYTES
        || value.contains('\0')
        || value.chars().any(char::is_control)
    {
        return Err(WorkbenchStateError::InvalidPath);
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
        return Err(WorkbenchStateError::InvalidPath);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registration(state: &mut WorkbenchState, name: &str) -> WorkspaceRegistrationId {
        state
            .reduce_intent(WorkbenchIntent::RegisterWorkspace {
                canonical_path: PathBuf::from(format!("/tmp/{name}")),
                display_name: name.into(),
            })
            .unwrap();
        state.registry.last().unwrap().registration_id
    }

    #[test]
    fn ids_are_monotonic_and_distinct() {
        assert!(WorkspaceGeneration::new() < WorkspaceGeneration::new());
        assert!(SelectionGeneration::new() < SelectionGeneration::new());
    }

    #[test]
    fn pane_intents_are_presentation_only_and_chat_remains_structural() {
        let mut state = WorkbenchState::new();
        assert_eq!(
            state.pane_presentation().layout_for_width(0),
            PaneLayout {
                chat_visible: true,
                navigation_visible: false,
                inspection_visible: false,
                files_visible: false,
                terminal_visible: false,
            }
        );
        state
            .reduce_intent(WorkbenchIntent::RevealPane {
                pane: WorkbenchPane::Terminal,
            })
            .unwrap();
        assert!(
            !state
                .pane_presentation()
                .visibility(WorkbenchPane::Inspection)
        );
        assert!(
            state
                .pane_presentation()
                .visibility(WorkbenchPane::Terminal)
        );
        state
            .reduce_intent(WorkbenchIntent::HidePane {
                pane: WorkbenchPane::Terminal,
            })
            .unwrap();
        assert!(
            !state
                .pane_presentation()
                .visibility(WorkbenchPane::Inspection)
        );
        assert!(
            !state
                .pane_presentation()
                .visibility(WorkbenchPane::Terminal)
        );
        assert!(state.registry.is_empty());
        assert!(state.chat_tabs.is_empty());
    }

    #[test]
    fn pane_pressure_collapses_files_navigation_then_inspection_without_forgetting_reveals() {
        let mut presentation = PanePresentation::default();
        for pane in [
            WorkbenchPane::Navigation,
            WorkbenchPane::Inspection,
            WorkbenchPane::Files,
            WorkbenchPane::Terminal,
        ] {
            presentation.reveal(pane);
        }
        assert_eq!(
            presentation.layout_for_width(
                MINIMUM_CHAT_WIDTH + MINIMUM_NAVIGATION_WIDTH + MINIMUM_INSPECTION_WIDTH
            ),
            PaneLayout {
                chat_visible: true,
                navigation_visible: true,
                inspection_visible: true,
                files_visible: false,
                terminal_visible: true,
            }
        );
        assert_eq!(
            presentation.layout_for_width(MINIMUM_CHAT_WIDTH + MINIMUM_INSPECTION_WIDTH),
            PaneLayout {
                chat_visible: true,
                navigation_visible: false,
                inspection_visible: true,
                files_visible: false,
                terminal_visible: true,
            }
        );
        assert_eq!(
            presentation.layout_for_width(MINIMUM_CHAT_WIDTH - 1),
            PaneLayout {
                chat_visible: true,
                navigation_visible: false,
                inspection_visible: false,
                files_visible: false,
                terminal_visible: true,
            }
        );
        assert!(presentation.visibility(WorkbenchPane::Files));
        assert!(presentation.visibility(WorkbenchPane::Navigation));
        assert!(presentation.visibility(WorkbenchPane::Inspection));
    }

    #[test]
    fn pane_fractions_are_clamped_and_rapid_toggles_are_deterministic() {
        let mut state = WorkbenchState::new();
        for _ in 0..20 {
            state
                .reduce_intent(WorkbenchIntent::TogglePane {
                    pane: WorkbenchPane::Files,
                })
                .unwrap();
        }
        assert!(!state.pane_presentation().visibility(WorkbenchPane::Files));
        state
            .reduce_intent(WorkbenchIntent::SetPaneFraction {
                pane: WorkbenchPane::Files,
                fraction: PaneFraction::from_fraction(1.0),
            })
            .unwrap();
        assert_eq!(
            state
                .pane_presentation()
                .fraction(WorkbenchPane::Files)
                .as_fraction(),
            MAX_FILES_FRACTION
        );
    }

    #[test]
    fn registry_rejects_duplicates_and_bounds_entries() {
        let mut state = WorkbenchState::new();
        let id = registration(&mut state, "one");
        assert_eq!(
            state.reduce_intent(WorkbenchIntent::RegisterWorkspace {
                canonical_path: PathBuf::from("/tmp/one"),
                display_name: "other".into()
            }),
            Err(WorkbenchStateError::DuplicateWorkspacePath)
        );
        for index in 1..MAX_WORKSPACES {
            registration(&mut state, &format!("w{index}"));
        }
        assert_eq!(state.registry.len(), MAX_WORKSPACES);
        assert_eq!(
            state.reduce_intent(WorkbenchIntent::RegisterWorkspace {
                canonical_path: PathBuf::from("/tmp/overflow"),
                display_name: "overflow".into()
            }),
            Err(WorkbenchStateError::RegistryLimit)
        );
        state
            .reduce_intent(WorkbenchIntent::RemoveWorkspace {
                registration_id: id,
            })
            .unwrap();
        assert!(
            !state
                .registry
                .iter()
                .any(|entry| entry.registration_id == id)
        );
    }

    #[test]
    fn tabs_are_bounded_scoped_and_presentation_only() {
        let mut state = WorkbenchState::new();
        let registration_id = registration(&mut state, "one");
        let session_id = SessionId::new();
        state
            .reduce_intent(WorkbenchIntent::OpenChatTab {
                registration_id,
                session_id,
            })
            .unwrap();
        assert_eq!(
            state.reduce_intent(WorkbenchIntent::OpenChatTab {
                registration_id,
                session_id
            }),
            Err(WorkbenchStateError::DuplicateTab)
        );
        let file = FileTab::new(registration_id, "src/lib.rs".into(), FileTabKind::Source).unwrap();
        state
            .reduce_intent(WorkbenchIntent::OpenFileTab { tab: file.clone() })
            .unwrap();
        state
            .reduce_intent(WorkbenchIntent::CloseFileTab { tab: file })
            .unwrap();
        assert!(state.file_tabs.is_empty());
        assert_eq!(state.chat_tabs[0].session_id, session_id);
    }

    #[test]
    fn catalog_is_bounded_and_sorted_by_latest_valid_record_time() {
        let mut catalog = SessionCatalog::new();
        for index in 0..(MAX_CATALOG_ENTRIES + 4) {
            catalog.upsert(
                SessionCatalogEntry::new(
                    SessionId::new(),
                    WorkspaceClassification::Missing,
                    format!("title-{index}"),
                    format!("2026-01-01T00:00:{index:04}.000Z"),
                    None,
                    SessionCompatibility::ReadOnly,
                )
                .unwrap(),
            );
        }
        assert_eq!(catalog.entries().len(), MAX_CATALOG_ENTRIES);
        assert!(
            catalog
                .entries()
                .windows(2)
                .all(|window| { window[0].last_recorded_at >= window[1].last_recorded_at })
        );
    }

    #[test]
    fn selection_is_atomic_and_rolls_back_on_failure() {
        let mut state = WorkbenchState::new();
        let registration_id = registration(&mut state, "one");
        let target = SelectionTarget {
            registration_id,
            session_id: None,
        };
        let first = SelectionGeneration::new();
        state.selected = Some(SelectedWorkbenchContext {
            registration_id,
            workspace_generation: WorkspaceGeneration::new(),
            retained_workspace: RetainedWorkspaceAuthority::Retained,
            session_id: None,
            session_workspace_id: None,
            selection_generation: first,
        });
        let old = state.selected.clone();
        let Some(WorkbenchEffect::BeginSelection { generation, .. }) = state
            .reduce_intent(WorkbenchIntent::SelectContext {
                target: target.clone(),
            })
            .unwrap()
        else {
            panic!()
        };
        assert_eq!(state.selected, old);
        state
            .reduce_event(WorkbenchEvent::SelectionFailed {
                generation,
                code: "open_failed",
            })
            .unwrap();
        assert_eq!(state.selected, old);
        let Some(WorkbenchEffect::BeginSelection { generation, .. }) = state
            .reduce_intent(WorkbenchIntent::SelectContext { target })
            .unwrap()
        else {
            panic!()
        };
        state
            .reduce_event(WorkbenchEvent::SelectionReady {
                generation,
                registration_id,
                workspace_generation: WorkspaceGeneration::new(),
                retained_workspace: RetainedWorkspaceAuthority::Retained,
                session_id: None,
                session_workspace_id: None,
            })
            .unwrap();
        assert_ne!(state.selected, old);
    }

    #[test]
    fn active_operation_requires_explicit_cancel_and_authoritative_terminal() {
        let mut state = WorkbenchState::new();
        let registration_id = registration(&mut state, "one");
        let turn_id = TurnId::new();
        let target = SelectionTarget {
            registration_id,
            session_id: None,
        };
        state
            .reduce_intent(WorkbenchIntent::SetActiveOperation(ActiveOperation::Turn(
                turn_id,
            )))
            .unwrap();
        assert_eq!(
            state.reduce_intent(WorkbenchIntent::SelectContext {
                target: target.clone()
            }),
            Err(WorkbenchStateError::ActiveOperationBlocksSwitch)
        );
        let Some(WorkbenchEffect::RequestTurnCancellation { generation, .. }) = state
            .reduce_intent(WorkbenchIntent::CancelAndSwitch {
                target: target.clone(),
                turn_id,
            })
            .unwrap()
        else {
            panic!()
        };
        assert!(matches!(
            state.selection,
            SelectionPhase::CancelPending { .. }
        ));
        assert_eq!(
            state
                .reduce_event(WorkbenchEvent::AuthoritativeTurnTerminal { turn_id })
                .unwrap(),
            Some(WorkbenchEffect::BeginSelection { target, generation })
        );
    }

    #[test]
    fn stale_selection_and_service_results_are_rejected() {
        let mut state = WorkbenchState::new();
        let registration_id = registration(&mut state, "one");
        let target = SelectionTarget {
            registration_id,
            session_id: None,
        };
        let Some(WorkbenchEffect::BeginSelection { generation, .. }) = state
            .reduce_intent(WorkbenchIntent::SelectContext { target })
            .unwrap()
        else {
            panic!()
        };
        assert_eq!(
            state.reduce_event(WorkbenchEvent::SelectionReady {
                generation: SelectionGeneration::new(),
                registration_id,
                workspace_generation: WorkspaceGeneration::new(),
                retained_workspace: RetainedWorkspaceAuthority::Retained,
                session_id: None,
                session_workspace_id: None
            }),
            Err(WorkbenchStateError::StaleEvent)
        );
        state
            .reduce_event(WorkbenchEvent::SelectionReady {
                generation,
                registration_id,
                workspace_generation: WorkspaceGeneration::new(),
                retained_workspace: RetainedWorkspaceAuthority::Retained,
                session_id: None,
                session_workspace_id: None,
            })
            .unwrap();
        let tree = state.begin_tree_request().unwrap();
        assert_eq!(
            state.reduce_event(WorkbenchEvent::TreeResult {
                registration_id,
                workspace_generation: state.selected.as_ref().unwrap().workspace_generation,
                request_id: TreeRequestId::new()
            }),
            Err(WorkbenchStateError::StaleEvent)
        );
        assert!(state.pending_requests.tree.is_some());
        state
            .reduce_event(WorkbenchEvent::TreeResult {
                registration_id,
                workspace_generation: state.selected.as_ref().unwrap().workspace_generation,
                request_id: tree,
            })
            .unwrap();
    }

    #[test]
    fn terminal_placeholders_keep_original_registration() {
        let mut state = WorkbenchState::new();
        let registration_id = registration(&mut state, "one");
        let placeholder = TerminalPlaceholder::new(
            registration_id,
            WorkspaceGeneration::new(),
            "Terminal".into(),
        )
        .unwrap();
        state.terminal_placeholders.push(placeholder.clone());
        state
            .reduce_intent(WorkbenchIntent::RemoveWorkspace { registration_id })
            .unwrap();
        assert_eq!(state.terminal_placeholders, vec![placeholder.clone()]);
        assert_eq!(placeholder.registration_id, registration_id);
    }
}
