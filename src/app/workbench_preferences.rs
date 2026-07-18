//! Bounded, non-secret preferences for the native workbench.
//!
//! This document is deliberately independent of session journals.  A malformed candidate is
//! retained and reported to the caller; loading it must not make the current process overwrite
//! evidence that may need manual recovery.

use std::collections::BTreeSet;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::agent::types::SessionId;

pub const WORKBENCH_PREFERENCES_V1_SCHEMA_VERSION: u16 = 1;
pub const SCHEMA_VERSION: u16 = 2;
pub const MAX_ENCODED_BYTES: usize = 1024 * 1024;
pub const MAX_REGISTERED_WORKSPACES: usize = 64;
pub const MAX_OPEN_SESSION_TABS: usize = 16;
pub const MAX_OPEN_FILE_TABS: usize = 32;
pub const MAX_TERMINAL_TABS: usize = 8;
pub const MAX_SESSION_DRAFTS: usize = 16;

pub const MAX_PATH_BYTES: usize = 4 * 1024;
pub const MAX_DISPLAY_NAME_BYTES: usize = 256;
pub const MAX_DRAFT_BYTES: usize = 64 * 1024;
pub const MAX_LAYOUT_FRACTION: f64 = 1.0;
pub const MAX_FRAME_COORDINATE: f64 = 100_000.0;
pub const MAX_FRAME_DIMENSION: f64 = 20_000.0;
pub const MAX_ANCHOR: u32 = 1_000_000;
pub const MAX_TIMESTAMP: u64 = 4_102_444_800_000;

/// Appearance profiles supported by the native workbench.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ThemePreference {
    System,
    Light,
    #[default]
    Dark,
    HighContrast,
}

/// A logical window rectangle. Coordinates may be negative when a display is arranged to the
/// left or above the primary display, but remain bounded to prevent malformed persistence data.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WindowFrame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl WindowFrame {
    fn validate(&self) -> Result<(), PreferencesValidationError> {
        if !self.x.is_finite()
            || !self.y.is_finite()
            || !self.width.is_finite()
            || !self.height.is_finite()
            || self.x.abs() > MAX_FRAME_COORDINATE
            || self.y.abs() > MAX_FRAME_COORDINATE
            || !(1.0..=MAX_FRAME_DIMENSION).contains(&self.width)
            || !(1.0..=MAX_FRAME_DIMENSION).contains(&self.height)
        {
            return Err(PreferencesValidationError::WindowFrameOutOfBounds);
        }
        Ok(())
    }
}

/// Persisted pane geometry and collapse state. Fractions are in the inclusive range 0..=1.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WorkbenchLayoutV1 {
    pub navigation_sidebar_fraction: f64,
    pub file_tree_fraction: f64,
    pub chat_fraction: f64,
    pub inspection_fraction: f64,
    pub inspection_viewer_fraction: f64,
    pub navigation_collapsed: bool,
    pub file_tree_collapsed: bool,
}

impl Default for WorkbenchLayoutV1 {
    fn default() -> Self {
        Self {
            navigation_sidebar_fraction: 0.20,
            file_tree_fraction: 0.20,
            chat_fraction: 0.50,
            inspection_fraction: 0.50,
            inspection_viewer_fraction: 0.65,
            navigation_collapsed: false,
            file_tree_collapsed: false,
        }
    }
}

impl WorkbenchLayoutV1 {
    fn validate(&self) -> Result<(), PreferencesValidationError> {
        let fractions = [
            self.navigation_sidebar_fraction,
            self.file_tree_fraction,
            self.chat_fraction,
            self.inspection_fraction,
            self.inspection_viewer_fraction,
        ];
        if fractions.iter().any(|fraction| {
            !fraction.is_finite() || !(0.0..=MAX_LAYOUT_FRACTION).contains(fraction)
        }) {
            return Err(PreferencesValidationError::LayoutFractionOutOfBounds);
        }
        Ok(())
    }
}

/// The fixed native-shell profile selected by the user-facing workbench presentation.
///
/// Chat is structural in every profile and therefore intentionally has no visibility field.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkbenchLayoutProfile {
    #[default]
    ChatFirstV1,
}

pub const MIN_NAVIGATION_FRACTION: f64 = 0.10;
pub const MAX_NAVIGATION_FRACTION: f64 = 0.28;
pub const DEFAULT_NAVIGATION_FRACTION: f64 = 0.16;
pub const MIN_INSPECTION_FRACTION: f64 = 0.24;
pub const MAX_INSPECTION_FRACTION: f64 = 0.65;
pub const DEFAULT_INSPECTION_FRACTION: f64 = 0.42;
pub const MIN_FILES_FRACTION: f64 = 0.10;
pub const MAX_FILES_FRACTION: f64 = 0.36;
pub const DEFAULT_FILES_FRACTION: f64 = 0.18;
pub const MIN_TERMINAL_FRACTION: f64 = 0.16;
pub const MAX_TERMINAL_FRACTION: f64 = 0.70;
pub const DEFAULT_TERMINAL_FRACTION: f64 = 0.40;

/// Explicit pane presentation choices. These affect only the native shell.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PaneVisibilityPreferences {
    pub navigation: bool,
    pub inspection: bool,
    pub files: bool,
    pub terminal: bool,
}

/// Last valid pane fractions. Values remain available while their pane is hidden so reveal can
/// restore a bounded size without reconstructing presentation from session or process state.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PaneFractionsV2 {
    pub navigation: f64,
    pub inspection: f64,
    pub files: f64,
    pub terminal: f64,
}

impl Default for PaneFractionsV2 {
    fn default() -> Self {
        Self {
            navigation: DEFAULT_NAVIGATION_FRACTION,
            inspection: DEFAULT_INSPECTION_FRACTION,
            files: DEFAULT_FILES_FRACTION,
            terminal: DEFAULT_TERMINAL_FRACTION,
        }
    }
}

impl PaneFractionsV2 {
    fn validate(&self) -> Result<(), PreferencesValidationError> {
        let valid = |value: f64, minimum: f64, maximum: f64| {
            value.is_finite() && (minimum..=maximum).contains(&value)
        };
        if valid(
            self.navigation,
            MIN_NAVIGATION_FRACTION,
            MAX_NAVIGATION_FRACTION,
        ) && valid(
            self.inspection,
            MIN_INSPECTION_FRACTION,
            MAX_INSPECTION_FRACTION,
        ) && valid(self.files, MIN_FILES_FRACTION, MAX_FILES_FRACTION)
            && valid(self.terminal, MIN_TERMINAL_FRACTION, MAX_TERMINAL_FRACTION)
        {
            Ok(())
        } else {
            Err(PreferencesValidationError::PaneFractionOutOfBounds)
        }
    }

    fn from_v1(layout: &WorkbenchLayoutV1) -> Self {
        Self {
            navigation: layout
                .navigation_sidebar_fraction
                .clamp(MIN_NAVIGATION_FRACTION, MAX_NAVIGATION_FRACTION),
            inspection: layout
                .inspection_fraction
                .clamp(MIN_INSPECTION_FRACTION, MAX_INSPECTION_FRACTION),
            files: layout
                .file_tree_fraction
                .clamp(MIN_FILES_FRACTION, MAX_FILES_FRACTION),
            terminal: (1.0 - layout.inspection_viewer_fraction)
                .clamp(MIN_TERMINAL_FRACTION, MAX_TERMINAL_FRACTION),
        }
    }
}

impl PaneVisibilityPreferences {
    fn validate(&self) -> Result<(), PreferencesValidationError> {
        Ok(())
    }
}

/// Stable local identity for a sidebar workspace registration.
#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
pub struct WorkspaceRegistrationId(Uuid);

impl WorkspaceRegistrationId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for WorkspaceRegistrationId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for WorkspaceRegistrationId {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}

/// Preference-only workspace registry entry. The canonical path is revalidated by the workspace
/// service before it can grant tool authority.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceRegistrationPreference {
    pub registration_id: WorkspaceRegistrationId,
    pub canonical_path: PathBuf,
    pub display_name: String,
    pub last_selected_at: Option<u64>,
}

impl WorkspaceRegistrationPreference {
    fn validate(&self) -> Result<(), PreferencesValidationError> {
        validate_absolute_path(&self.canonical_path, "canonical_path")?;
        validate_display_string(&self.display_name, MAX_DISPLAY_NAME_BYTES, "display_name")?;
        if self
            .last_selected_at
            .is_some_and(|timestamp| timestamp > MAX_TIMESTAMP)
        {
            return Err(PreferencesValidationError::TimestampOutOfBounds);
        }
        Ok(())
    }
}

/// Dormant terminal metadata. It contains no process handle, PID, command, environment, or
/// terminal bytes; restored descriptors always require an explicit new process start.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TerminalRestoreDescriptor {
    pub registration_id: WorkspaceRegistrationId,
    pub initial_relative_cwd: String,
    pub display_title: String,
}

impl TerminalRestoreDescriptor {
    fn validate(&self) -> Result<(), PreferencesValidationError> {
        validate_relative_path(&self.initial_relative_cwd, "initial_relative_cwd")?;
        validate_display_string(&self.display_title, MAX_DISPLAY_NAME_BYTES, "display_title")?;
        Ok(())
    }
}

/// An unsent, bounded composer draft associated with a durable session identity. It is not a
/// session transcript and is never sent to the backend by this store.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DraftPreference {
    pub session_id: SessionId,
    pub text: String,
}

impl DraftPreference {
    fn validate(&self) -> Result<(), PreferencesValidationError> {
        validate_string(&self.text, MAX_DRAFT_BYTES, "draft_text", false)
    }
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TranscriptViewPreferences {
    pub collapsed: bool,
    pub anchor: Option<u32>,
}

impl TranscriptViewPreferences {
    fn validate(&self) -> Result<(), PreferencesValidationError> {
        if self.anchor.is_some_and(|anchor| anchor > MAX_ANCHOR) {
            return Err(PreferencesValidationError::TranscriptAnchorOutOfBounds);
        }
        Ok(())
    }
}

/// The complete released V1 preference document, retained only to make migration explicit.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WorkbenchPreferencesV1 {
    pub schema_version: u16,
    pub clean_shutdown: bool,
    pub theme: ThemePreference,
    pub window_frame: Option<WindowFrame>,
    pub layout: WorkbenchLayoutV1,
    pub registered_workspaces: Vec<WorkspaceRegistrationPreference>,
    pub selected_workspace_registration_id: Option<WorkspaceRegistrationId>,
    pub selected_session_id: Option<SessionId>,
    pub open_session_tabs: Vec<SessionId>,
    pub open_file_tabs: Vec<String>,
    pub terminal_tab_descriptors: Vec<TerminalRestoreDescriptor>,
    pub per_session_drafts: Vec<DraftPreference>,
    pub transcript_view_preferences: TranscriptViewPreferences,
}

impl Default for WorkbenchPreferencesV1 {
    fn default() -> Self {
        Self {
            schema_version: WORKBENCH_PREFERENCES_V1_SCHEMA_VERSION,
            clean_shutdown: false,
            theme: ThemePreference::Dark,
            window_frame: None,
            layout: WorkbenchLayoutV1::default(),
            registered_workspaces: Vec::new(),
            selected_workspace_registration_id: None,
            selected_session_id: None,
            open_session_tabs: Vec::new(),
            open_file_tabs: Vec::new(),
            terminal_tab_descriptors: Vec::new(),
            per_session_drafts: Vec::new(),
            transcript_view_preferences: TranscriptViewPreferences::default(),
        }
    }
}

impl WorkbenchPreferencesV1 {
    pub fn validate(&self) -> Result<(), PreferencesValidationError> {
        if self.schema_version != WORKBENCH_PREFERENCES_V1_SCHEMA_VERSION {
            return Err(PreferencesValidationError::UnsupportedSchemaVersion);
        }
        if self.registered_workspaces.len() > MAX_REGISTERED_WORKSPACES {
            return Err(PreferencesValidationError::TooManyRegisteredWorkspaces);
        }
        if self.open_session_tabs.len() > MAX_OPEN_SESSION_TABS {
            return Err(PreferencesValidationError::TooManyOpenSessionTabs);
        }
        if self.open_file_tabs.len() > MAX_OPEN_FILE_TABS {
            return Err(PreferencesValidationError::TooManyOpenFileTabs);
        }
        if self.terminal_tab_descriptors.len() > MAX_TERMINAL_TABS {
            return Err(PreferencesValidationError::TooManyTerminalTabs);
        }
        if self.per_session_drafts.len() > MAX_SESSION_DRAFTS {
            return Err(PreferencesValidationError::TooManyDrafts);
        }
        if let Some(frame) = self.window_frame {
            frame.validate()?;
        }
        self.layout.validate()?;
        let registration_ids = self
            .registered_workspaces
            .iter()
            .map(|workspace| workspace.registration_id)
            .collect::<BTreeSet<_>>();
        if registration_ids.len() != self.registered_workspaces.len() {
            return Err(PreferencesValidationError::DuplicateIdentity);
        }
        if self
            .selected_workspace_registration_id
            .is_some_and(|id| !registration_ids.contains(&id))
        {
            return Err(PreferencesValidationError::DanglingIdentity);
        }
        for workspace in &self.registered_workspaces {
            workspace.validate()?;
        }
        let open_sessions = self
            .open_session_tabs
            .iter()
            .copied()
            .collect::<BTreeSet<_>>();
        if open_sessions.len() != self.open_session_tabs.len() {
            return Err(PreferencesValidationError::DuplicateIdentity);
        }
        if self
            .selected_session_id
            .is_some_and(|id| !open_sessions.contains(&id))
        {
            return Err(PreferencesValidationError::DanglingIdentity);
        }
        let open_files = self.open_file_tabs.iter().collect::<BTreeSet<_>>();
        if open_files.len() != self.open_file_tabs.len() {
            return Err(PreferencesValidationError::DuplicateIdentity);
        }
        for path in &self.open_file_tabs {
            validate_relative_path(path, "open_file_tab")?;
        }
        for descriptor in &self.terminal_tab_descriptors {
            descriptor.validate()?;
            if !registration_ids.contains(&descriptor.registration_id) {
                return Err(PreferencesValidationError::DanglingIdentity);
            }
        }
        let draft_sessions = self
            .per_session_drafts
            .iter()
            .map(|draft| draft.session_id)
            .collect::<BTreeSet<_>>();
        if draft_sessions.len() != self.per_session_drafts.len() {
            return Err(PreferencesValidationError::DuplicateIdentity);
        }
        for draft in &self.per_session_drafts {
            draft.validate()?;
        }
        self.transcript_view_preferences.validate()?;
        Ok(())
    }

    #[cfg(test)]
    fn encoded(&self) -> Result<Vec<u8>, PreferencesStoreError> {
        self.validate()?;
        let bytes = serde_json::to_vec(self).map_err(|_| PreferencesStoreError::EncodingFailed)?;
        if bytes.len() > MAX_ENCODED_BYTES {
            return Err(PreferencesStoreError::EncodedTooLarge);
        }
        Ok(bytes)
    }
}

/// The bounded V2 preference document used by the chat-first native workbench.
///
/// V2 retains all V1 fields so workspace/session restoration stays independent of pane
/// presentation. The added fields are presentation-only and never change session journals.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WorkbenchPreferencesV2 {
    pub schema_version: u16,
    pub clean_shutdown: bool,
    pub theme: ThemePreference,
    pub window_frame: Option<WindowFrame>,
    pub layout: WorkbenchLayoutV1,
    pub registered_workspaces: Vec<WorkspaceRegistrationPreference>,
    pub selected_workspace_registration_id: Option<WorkspaceRegistrationId>,
    pub selected_session_id: Option<SessionId>,
    pub open_session_tabs: Vec<SessionId>,
    pub open_file_tabs: Vec<String>,
    pub terminal_tab_descriptors: Vec<TerminalRestoreDescriptor>,
    pub per_session_drafts: Vec<DraftPreference>,
    pub transcript_view_preferences: TranscriptViewPreferences,
    pub layout_profile: WorkbenchLayoutProfile,
    pub pane_visibility: PaneVisibilityPreferences,
    pub pane_fractions: PaneFractionsV2,
}

impl Default for WorkbenchPreferencesV2 {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            clean_shutdown: false,
            theme: ThemePreference::Dark,
            window_frame: None,
            layout: WorkbenchLayoutV1::default(),
            registered_workspaces: Vec::new(),
            selected_workspace_registration_id: None,
            selected_session_id: None,
            open_session_tabs: Vec::new(),
            open_file_tabs: Vec::new(),
            terminal_tab_descriptors: Vec::new(),
            per_session_drafts: Vec::new(),
            transcript_view_preferences: TranscriptViewPreferences::default(),
            layout_profile: WorkbenchLayoutProfile::ChatFirstV1,
            pane_visibility: PaneVisibilityPreferences::default(),
            pane_fractions: PaneFractionsV2::default(),
        }
    }
}

impl WorkbenchPreferencesV2 {
    pub fn validate(&self) -> Result<(), PreferencesValidationError> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(PreferencesValidationError::UnsupportedSchemaVersion);
        }
        WorkbenchPreferencesV1 {
            schema_version: WORKBENCH_PREFERENCES_V1_SCHEMA_VERSION,
            clean_shutdown: self.clean_shutdown,
            theme: self.theme,
            window_frame: self.window_frame,
            layout: self.layout.clone(),
            registered_workspaces: self.registered_workspaces.clone(),
            selected_workspace_registration_id: self.selected_workspace_registration_id,
            selected_session_id: self.selected_session_id,
            open_session_tabs: self.open_session_tabs.clone(),
            open_file_tabs: self.open_file_tabs.clone(),
            terminal_tab_descriptors: self.terminal_tab_descriptors.clone(),
            per_session_drafts: self.per_session_drafts.clone(),
            transcript_view_preferences: self.transcript_view_preferences.clone(),
        }
        .validate()?;
        self.pane_visibility.validate()?;
        self.pane_fractions.validate()
    }

    pub fn encoded(&self) -> Result<Vec<u8>, PreferencesStoreError> {
        self.validate()?;
        let bytes = serde_json::to_vec(self).map_err(|_| PreferencesStoreError::EncodingFailed)?;
        if bytes.len() > MAX_ENCODED_BYTES {
            return Err(PreferencesStoreError::EncodedTooLarge);
        }
        Ok(bytes)
    }

    /// Applies a fully bounded presentation preference in one operation.
    pub fn set_pane_presentation(
        &mut self,
        visibility: PaneVisibilityPreferences,
        fractions: PaneFractionsV2,
    ) -> Result<(), PreferencesValidationError> {
        visibility.validate()?;
        fractions.validate()?;
        self.pane_visibility = visibility;
        self.pane_fractions = fractions;
        Ok(())
    }

    fn migrate_from_v1(v1: WorkbenchPreferencesV1) -> Self {
        let pane_visibility = PaneVisibilityPreferences {
            navigation: !v1.layout.navigation_collapsed,
            inspection: false,
            files: !v1.layout.file_tree_collapsed,
            terminal: false,
        };
        let pane_fractions = PaneFractionsV2::from_v1(&v1.layout);
        Self {
            schema_version: SCHEMA_VERSION,
            clean_shutdown: v1.clean_shutdown,
            theme: v1.theme,
            window_frame: v1.window_frame,
            layout: v1.layout,
            registered_workspaces: v1.registered_workspaces,
            selected_workspace_registration_id: v1.selected_workspace_registration_id,
            selected_session_id: v1.selected_session_id,
            open_session_tabs: v1.open_session_tabs,
            open_file_tabs: v1.open_file_tabs,
            terminal_tab_descriptors: v1.terminal_tab_descriptors,
            per_session_drafts: v1.per_session_drafts,
            transcript_view_preferences: v1.transcript_view_preferences,
            layout_profile: WorkbenchLayoutProfile::ChatFirstV1,
            pane_visibility,
            pane_fractions,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum PreferencesValidationError {
    #[error("schema version is unsupported")]
    UnsupportedSchemaVersion,
    #[error("too many registered workspaces")]
    TooManyRegisteredWorkspaces,
    #[error("too many open session tabs")]
    TooManyOpenSessionTabs,
    #[error("too many open file tabs")]
    TooManyOpenFileTabs,
    #[error("too many terminal tabs")]
    TooManyTerminalTabs,
    #[error("too many drafts")]
    TooManyDrafts,
    #[error("window frame is out of bounds")]
    WindowFrameOutOfBounds,
    #[error("layout fraction is out of bounds")]
    LayoutFractionOutOfBounds,
    #[error("pane fraction is out of bounds")]
    PaneFractionOutOfBounds,
    #[error("path is invalid")]
    InvalidPath,
    #[error("path is too long")]
    PathTooLong,
    #[error("string field is invalid")]
    InvalidString,
    #[error("string field is too long")]
    StringTooLong,
    #[error("timestamp is out of bounds")]
    TimestampOutOfBounds,
    #[error("transcript anchor is out of bounds")]
    TranscriptAnchorOutOfBounds,
    #[error("a preference identity is duplicated")]
    DuplicateIdentity,
    #[error("a preference identity has no owning entry")]
    DanglingIdentity,
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum PreferencesStoreError {
    #[error("preferences are unavailable")]
    Unavailable,
    #[error("preferences contain invalid values: {0}")]
    Invalid(#[from] PreferencesValidationError),
    #[error("preferences encoding failed")]
    EncodingFailed,
    #[error("preferences exceed the encoded size limit")]
    EncodedTooLarge,
    #[error("preferences candidate is retained after recovery")]
    OverwriteBlocked,
    #[error("preferences write failed")]
    WriteFailed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PreferencesDiagnostic {
    Corrupt,
    Oversized,
    NewerVersion { version: u64 },
    MigratedFromV1,
}

/// Load result and write owner for one preferences path. `overwrite_blocked` remains true for the
/// lifetime of an instance recovered from a bad candidate, so a later shutdown cannot erase it.
pub struct WorkbenchPreferencesStore {
    path: PathBuf,
    preferences: WorkbenchPreferencesV2,
    diagnostic: Option<PreferencesDiagnostic>,
    overwrite_blocked: bool,
}

impl WorkbenchPreferencesStore {
    pub fn load(path: impl AsRef<Path>) -> Result<Self, PreferencesStoreError> {
        let path = path.as_ref().to_path_buf();
        let bytes = match read_bounded(&path) {
            Ok(bytes) => bytes,
            Err(ReadError::Missing) => {
                return Ok(Self {
                    path,
                    preferences: WorkbenchPreferencesV2::default(),
                    diagnostic: None,
                    overwrite_blocked: false,
                });
            }
            Err(ReadError::Oversized) => {
                return Ok(Self::recovered(path, PreferencesDiagnostic::Oversized));
            }
            Err(ReadError::Io) => return Err(PreferencesStoreError::Unavailable),
        };

        let raw: serde_json::Value = match serde_json::from_slice(&bytes) {
            Ok(value) => value,
            Err(_) => return Ok(Self::recovered(path, PreferencesDiagnostic::Corrupt)),
        };
        let version = raw
            .get("schema_version")
            .and_then(serde_json::Value::as_u64);
        if let Some(version) = version.filter(|version| *version > u64::from(SCHEMA_VERSION)) {
            return Ok(Self::recovered(
                path,
                PreferencesDiagnostic::NewerVersion { version },
            ));
        }
        match version {
            Some(version) if version == u64::from(WORKBENCH_PREFERENCES_V1_SCHEMA_VERSION) => {
                let v1: WorkbenchPreferencesV1 = match serde_json::from_value(raw) {
                    Ok(value) => value,
                    Err(_) => return Ok(Self::recovered(path, PreferencesDiagnostic::Corrupt)),
                };
                if v1.validate().is_err() {
                    return Ok(Self::recovered(path, PreferencesDiagnostic::Corrupt));
                }
                Ok(Self {
                    path,
                    preferences: WorkbenchPreferencesV2::migrate_from_v1(v1),
                    diagnostic: Some(PreferencesDiagnostic::MigratedFromV1),
                    overwrite_blocked: false,
                })
            }
            Some(version) if version == u64::from(SCHEMA_VERSION) => {
                let preferences: WorkbenchPreferencesV2 = match serde_json::from_value(raw) {
                    Ok(value) => value,
                    Err(_) => return Ok(Self::recovered(path, PreferencesDiagnostic::Corrupt)),
                };
                if preferences.validate().is_err() {
                    return Ok(Self::recovered(path, PreferencesDiagnostic::Corrupt));
                }
                Ok(Self {
                    path,
                    preferences,
                    diagnostic: None,
                    overwrite_blocked: false,
                })
            }
            _ => Ok(Self::recovered(path, PreferencesDiagnostic::Corrupt)),
        }
    }

    pub fn preferences(&self) -> &WorkbenchPreferencesV2 {
        &self.preferences
    }

    pub fn preferences_mut(&mut self) -> &mut WorkbenchPreferencesV2 {
        &mut self.preferences
    }

    pub fn diagnostic(&self) -> Option<&PreferencesDiagnostic> {
        self.diagnostic.as_ref()
    }

    pub fn overwrite_blocked(&self) -> bool {
        self.overwrite_blocked
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn save(&self) -> Result<(), PreferencesStoreError> {
        if self.overwrite_blocked {
            return Err(PreferencesStoreError::OverwriteBlocked);
        }
        write_preferences(&self.path, &self.preferences)
    }

    fn recovered(path: PathBuf, diagnostic: PreferencesDiagnostic) -> Self {
        Self {
            path,
            preferences: WorkbenchPreferencesV2::default(),
            diagnostic: Some(diagnostic),
            overwrite_blocked: true,
        }
    }
}

pub fn write_preferences(
    path: impl AsRef<Path>,
    preferences: &WorkbenchPreferencesV2,
) -> Result<(), PreferencesStoreError> {
    let bytes = preferences.encoded()?;
    let path = path.as_ref();
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent).map_err(|_| PreferencesStoreError::Unavailable)?;
    set_private(parent, true).map_err(|_| PreferencesStoreError::Unavailable)?;

    let temporary = parent.join(format!(".workbench-v2.{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|_| PreferencesStoreError::WriteFailed)?;
        set_private(&temporary, false).map_err(|_| PreferencesStoreError::WriteFailed)?;
        file.write_all(&bytes)
            .and_then(|_| file.flush())
            .and_then(|_| file.sync_all())
            .map_err(|_| PreferencesStoreError::WriteFailed)?;
        fs::rename(&temporary, path).map_err(|_| PreferencesStoreError::WriteFailed)?;
        sync_directory(parent).map_err(|_| PreferencesStoreError::WriteFailed)
    })();
    // An unsuccessful atomic replacement leaves the sibling candidate available for manual
    // recovery. It is intentionally not deleted here.
    result
}

enum ReadError {
    Missing,
    Oversized,
    Io,
}

fn read_bounded(path: &Path) -> Result<Vec<u8>, ReadError> {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Err(ReadError::Missing),
        Err(_) => return Err(ReadError::Io),
    };
    let mut bytes = Vec::new();
    let limit = u64::try_from(MAX_ENCODED_BYTES + 1).unwrap_or(u64::MAX);
    Read::by_ref(&mut file)
        .take(limit)
        .read_to_end(&mut bytes)
        .map_err(|_| ReadError::Io)?;
    if bytes.len() > MAX_ENCODED_BYTES {
        Err(ReadError::Oversized)
    } else {
        Ok(bytes)
    }
}

fn validate_absolute_path(path: &Path, _: &'static str) -> Result<(), PreferencesValidationError> {
    let text = path
        .to_str()
        .ok_or(PreferencesValidationError::InvalidPath)?;
    if text.is_empty()
        || text.len() > MAX_PATH_BYTES
        || text.contains('\0')
        || text.chars().any(char::is_control)
        || !path.is_absolute()
    {
        return Err(if text.len() > MAX_PATH_BYTES {
            PreferencesValidationError::PathTooLong
        } else {
            PreferencesValidationError::InvalidPath
        });
    }
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return Err(PreferencesValidationError::InvalidPath);
    }
    Ok(())
}

fn validate_relative_path(value: &str, _: &'static str) -> Result<(), PreferencesValidationError> {
    if value.is_empty()
        || value.len() > MAX_PATH_BYTES
        || value.contains('\0')
        || value.chars().any(char::is_control)
    {
        return Err(if value.len() > MAX_PATH_BYTES {
            PreferencesValidationError::PathTooLong
        } else {
            PreferencesValidationError::InvalidPath
        });
    }
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::RootDir))
    {
        return Err(PreferencesValidationError::InvalidPath);
    }
    Ok(())
}

fn validate_display_string(
    value: &str,
    max_bytes: usize,
    _: &'static str,
) -> Result<(), PreferencesValidationError> {
    validate_string(value, max_bytes, "display", true)
}

fn validate_string(
    value: &str,
    max_bytes: usize,
    _: &'static str,
    reject_controls: bool,
) -> Result<(), PreferencesValidationError> {
    if reject_controls && value.is_empty() {
        return Err(PreferencesValidationError::InvalidString);
    }
    if value.len() > max_bytes {
        return Err(PreferencesValidationError::StringTooLong);
    }
    if value.contains('\0') || (reject_controls && value.chars().any(char::is_control)) {
        return Err(PreferencesValidationError::InvalidString);
    }
    Ok(())
}

#[cfg(unix)]
fn set_private(path: &Path, directory: bool) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mode = if directory { 0o700 } else { 0o600 };
    let mut permissions = fs::metadata(path)?.permissions();
    permissions.set_mode(mode);
    fs::set_permissions(path, permissions)
}

#[cfg(not(unix))]
fn set_private(_: &Path, _: bool) -> io::Result<()> {
    Ok(())
}

fn sync_directory(path: &Path) -> io::Result<()> {
    File::open(path)?.sync_all()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn path() -> PathBuf {
        PathBuf::from("/tmp/pho-workbench-tests/workspace")
    }

    fn valid_preferences() -> WorkbenchPreferencesV2 {
        let mut preferences = WorkbenchPreferencesV2::default();
        preferences
            .registered_workspaces
            .push(WorkspaceRegistrationPreference {
                registration_id: WorkspaceRegistrationId::new(),
                canonical_path: path(),
                display_name: "Workspace".into(),
                last_selected_at: Some(1_700_000_000_000),
            });
        preferences.open_file_tabs.push("src/main.rs".into());
        preferences
    }

    #[test]
    fn valid_preferences_round_trip() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("preferences.json");
        let expected = valid_preferences();
        write_preferences(&file, &expected).unwrap();
        let store = WorkbenchPreferencesStore::load(&file).unwrap();
        assert_eq!(store.preferences(), &expected);
        assert!(store.diagnostic().is_none());
        assert!(!store.overwrite_blocked());
    }

    #[test]
    fn v1_migration_preserves_compatible_choices_and_clamps_geometry() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("preferences.json");
        let mut v1 = WorkbenchPreferencesV1::default();
        v1.layout.navigation_collapsed = true;
        v1.layout.file_tree_collapsed = false;
        v1.layout.navigation_sidebar_fraction = 0.0;
        v1.layout.file_tree_fraction = 1.0;
        v1.layout.inspection_fraction = 0.0;
        v1.layout.inspection_viewer_fraction = 1.0;
        v1.open_file_tabs.push("src/main.rs".into());
        fs::write(&file, v1.encoded().unwrap()).unwrap();

        let store = WorkbenchPreferencesStore::load(&file).unwrap();
        let preferences = store.preferences();
        assert_eq!(
            store.diagnostic(),
            Some(&PreferencesDiagnostic::MigratedFromV1)
        );
        assert!(!store.overwrite_blocked());
        assert_eq!(
            preferences.layout_profile,
            WorkbenchLayoutProfile::ChatFirstV1
        );
        assert!(!preferences.pane_visibility.navigation);
        assert!(preferences.pane_visibility.files);
        assert!(!preferences.pane_visibility.inspection);
        assert!(!preferences.pane_visibility.terminal);
        assert_eq!(
            preferences.pane_fractions.navigation,
            MIN_NAVIGATION_FRACTION
        );
        assert_eq!(preferences.pane_fractions.files, MAX_FILES_FRACTION);
        assert_eq!(
            preferences.pane_fractions.inspection,
            MIN_INSPECTION_FRACTION
        );
        assert_eq!(preferences.pane_fractions.terminal, MIN_TERMINAL_FRACTION);
        assert_eq!(preferences.open_file_tabs, vec!["src/main.rs"]);
    }

    #[test]
    fn new_preferences_are_chat_first_and_writable() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("missing.json");
        let store = WorkbenchPreferencesStore::load(&file).unwrap();
        assert_eq!(
            store.preferences().layout_profile,
            WorkbenchLayoutProfile::ChatFirstV1
        );
        assert_eq!(
            store.preferences().pane_visibility,
            PaneVisibilityPreferences::default()
        );
        assert!(!store.overwrite_blocked());
    }

    #[test]
    fn corrupt_candidate_uses_defaults_and_blocks_overwrite() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("preferences.json");
        fs::write(&file, b"not-json").unwrap();
        let mut store = WorkbenchPreferencesStore::load(&file).unwrap();
        assert_eq!(store.diagnostic(), Some(&PreferencesDiagnostic::Corrupt));
        assert!(store.overwrite_blocked());
        store.preferences_mut().clean_shutdown = true;
        assert_eq!(store.save(), Err(PreferencesStoreError::OverwriteBlocked));
        assert_eq!(fs::read(&file).unwrap(), b"not-json");
    }

    #[test]
    fn oversized_and_newer_candidates_are_retained() {
        let directory = tempfile::tempdir().unwrap();
        let oversized = directory.path().join("oversized.json");
        fs::write(&oversized, vec![b'x'; MAX_ENCODED_BYTES + 1]).unwrap();
        let store = WorkbenchPreferencesStore::load(&oversized).unwrap();
        assert_eq!(store.diagnostic(), Some(&PreferencesDiagnostic::Oversized));
        assert!(store.overwrite_blocked());

        let newer = directory.path().join("newer.json");
        fs::write(&newer, br#"{"schema_version":3}"#).unwrap();
        let store = WorkbenchPreferencesStore::load(&newer).unwrap();
        assert_eq!(
            store.diagnostic(),
            Some(&PreferencesDiagnostic::NewerVersion { version: 3 })
        );
        assert!(store.overwrite_blocked());
    }

    #[test]
    fn missing_file_uses_writable_defaults() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("missing.json");
        let store = WorkbenchPreferencesStore::load(&file).unwrap();
        assert_eq!(store.preferences(), &WorkbenchPreferencesV2::default());
        assert!(!store.overwrite_blocked());
        store.save().unwrap();
    }

    #[test]
    fn bounds_and_relative_paths_are_validated() {
        let mut preferences = WorkbenchPreferencesV2::default();
        preferences.open_file_tabs.push("../escape".into());
        assert_eq!(
            preferences.validate(),
            Err(PreferencesValidationError::InvalidPath)
        );
        preferences.open_file_tabs.clear();
        preferences.open_file_tabs.push("/absolute".into());
        assert_eq!(
            preferences.validate(),
            Err(PreferencesValidationError::InvalidPath)
        );
        preferences.open_file_tabs.clear();
        preferences.open_file_tabs.push("ok/file.rs".into());
        preferences.open_session_tabs = (0..=MAX_OPEN_SESSION_TABS)
            .map(|_| SessionId::new())
            .collect();
        assert_eq!(
            preferences.validate(),
            Err(PreferencesValidationError::TooManyOpenSessionTabs)
        );
    }

    #[test]
    fn scalar_and_string_bounds_are_validated() {
        let mut preferences = WorkbenchPreferencesV2 {
            window_frame: Some(WindowFrame {
                x: 0.0,
                y: 0.0,
                width: MAX_FRAME_DIMENSION + 1.0,
                height: 100.0,
            }),
            ..Default::default()
        };
        assert_eq!(
            preferences.validate(),
            Err(PreferencesValidationError::WindowFrameOutOfBounds)
        );

        preferences.window_frame = None;
        preferences.layout.chat_fraction = 1.1;
        assert_eq!(
            preferences.validate(),
            Err(PreferencesValidationError::LayoutFractionOutOfBounds)
        );

        preferences.layout = WorkbenchLayoutV1::default();
        preferences.transcript_view_preferences.anchor = Some(MAX_ANCHOR + 1);
        assert_eq!(
            preferences.validate(),
            Err(PreferencesValidationError::TranscriptAnchorOutOfBounds)
        );

        preferences.transcript_view_preferences = TranscriptViewPreferences::default();
        preferences.per_session_drafts.push(DraftPreference {
            session_id: SessionId::new(),
            text: "x".repeat(MAX_DRAFT_BYTES + 1),
        });
        assert_eq!(
            preferences.validate(),
            Err(PreferencesValidationError::StringTooLong)
        );

        preferences.per_session_drafts.clear();
        preferences
            .registered_workspaces
            .push(WorkspaceRegistrationPreference {
                registration_id: WorkspaceRegistrationId::new(),
                canonical_path: path(),
                display_name: String::new(),
                last_selected_at: None,
            });
        assert_eq!(
            preferences.validate(),
            Err(PreferencesValidationError::InvalidString)
        );

        let mut preferences = WorkbenchPreferencesV2::default();
        preferences.pane_fractions.navigation = MIN_NAVIGATION_FRACTION - 0.01;
        assert_eq!(
            preferences.validate(),
            Err(PreferencesValidationError::PaneFractionOutOfBounds)
        );

        let mut preferences = WorkbenchPreferencesV2::default();
        preferences.pane_visibility.terminal = true;
        assert!(preferences.validate().is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn restrictive_file_and_directory_modes_are_set() {
        use std::os::unix::fs::PermissionsExt;

        let directory = tempfile::tempdir().unwrap();
        let preferences_dir = directory.path().join("preferences");
        let file = preferences_dir.join("workbench-v1.json");
        write_preferences(&file, &WorkbenchPreferencesV2::default()).unwrap();
        assert_eq!(
            fs::metadata(&preferences_dir).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(&file).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}
