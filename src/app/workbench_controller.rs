//! Typed, background-owned controller for the native workbench.
//!
//! This is the only native application object that composes provider, session, workspace, tool,
//! approval, catalog, and preference operations. GPUI views receive bounded projections and
//! submit commands; they never perform these operations directly.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tokio_util::sync::CancellationToken;

use crate::agent::types::SessionId;
use crate::auth::{CredentialState, SecretText};
use crate::backend::BackendMessage;
use crate::session::catalog::{SessionClassification, scan_sessions};
use crate::terminal::{
    CloseReason, MAX_COLUMNS, MAX_ROWS, TerminalBinding, TerminalError, TerminalEventKind,
    TerminalIdentity, TerminalLaunchOptions, TerminalManager, TerminalSnapshot,
};
use crate::tools::ApprovalResponse;
use crate::tools::approval::InteractiveApprovalPolicy;

use super::action::{Intent, RuntimeEvent};
use super::git_inspection::{
    GitInspectionResult, GitOperation, GitRequest, GitSnapshot, UncommittedDiffSnapshot,
    execute as execute_git,
};
use super::runtime::{ApplicationCoordinator, CoordinatorError};
use super::services::HeadlessApplicationServices;
use super::workbench_preferences::{
    PaneFractionsV2, PaneVisibilityPreferences, WindowFrame, WorkbenchPreferencesStore,
    WorkspaceRegistrationId, WorkspaceRegistrationPreference,
};
use super::workbench_services::{
    DurableSessionContext, WorkbenchServiceError, create_durable_session, open_durable_session,
};
use super::workbench_state::{FileRequestId, GitRequestId, TreeRequestId, WorkspaceGeneration};
use super::workspace_inspection::{
    DirectorySnapshot, FileSnapshot, FileSnapshotIdentity, TreeEntryKind, enumerate_directory,
    read_file_snapshot,
};

pub const NATIVE_COMMAND_CAPACITY: usize = 16;
pub const NATIVE_EVENT_CAPACITY: usize = 512;
pub const NATIVE_CANCELLATION_CAPACITY: usize = 4;
pub const NATIVE_APPROVAL_CAPACITY: usize = 4;

/// Measured terminal content dimensions supplied by the native presentation after layout.
///
/// Keeping this type GPUI-neutral prevents a view from crossing into PTY ownership while making
/// the lazy-create precondition explicit at the controller boundary.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TerminalSurfaceDimensions {
    pub columns: u16,
    pub rows: u16,
    pub pixel_width: u16,
    pub pixel_height: u16,
}

impl TerminalSurfaceDimensions {
    pub fn new(columns: u16, rows: u16, pixel_width: u16, pixel_height: u16) -> Option<Self> {
        (columns > 0
            && columns <= MAX_COLUMNS
            && rows > 0
            && rows <= MAX_ROWS
            && pixel_width > 0
            && pixel_width <= 4096
            && pixel_height > 0
            && pixel_height <= 4096)
            .then_some(Self {
                columns,
                rows,
                pixel_width,
                pixel_height,
            })
    }

    fn launch_options(self) -> TerminalLaunchOptions {
        TerminalLaunchOptions {
            shell: None,
            columns: self.columns,
            rows: self.rows,
            pixel_width: self.pixel_width,
            pixel_height: self.pixel_height,
        }
    }
}

pub enum WorkbenchCommand {
    InstallCredential {
        candidate: SecretText,
    },
    RemoveCredential,
    OpenWorkspace {
        path: PathBuf,
    },
    SelectWorkspace {
        registration_id: WorkspaceRegistrationId,
    },
    NewSession,
    OpenSession {
        session_id: SessionId,
    },
    RefreshWorkspace,
    ExpandDirectory {
        relative_path: String,
    },
    OpenFile {
        relative_path: String,
    },
    RefreshGit,
    RefreshGitDiff,
    /// Persist bounded pane presentation without changing canonical session or terminal state.
    SetPanePresentation {
        visibility: PaneVisibilityPreferences,
        fractions: PaneFractionsV2,
    },
    SendPrompt {
        text: String,
    },
    /// Create exactly one first terminal for the expected workspace generation.
    CreateTerminal {
        workspace_generation: WorkspaceGeneration,
        dimensions: TerminalSurfaceDimensions,
    },
    /// Resize an existing terminal without changing its visibility or process lifecycle.
    ResizeTerminal {
        workspace_generation: WorkspaceGeneration,
        terminal_identity: TerminalIdentity,
        dimensions: TerminalSurfaceDimensions,
    },
    /// Restart only an already closed terminal using a new generation.
    RestartTerminal {
        workspace_generation: WorkspaceGeneration,
        terminal_identity: TerminalIdentity,
        dimensions: TerminalSurfaceDimensions,
    },
    /// Kept temporarily for the pre-6C start control. Native presentation must use
    /// `CreateTerminal` after measured dimensions exist.
    StartTerminal,
    TerminalInput {
        bytes: Vec<u8>,
    },
    InterruptTerminal,
    CloseTerminal,
}

impl std::fmt::Debug for WorkbenchCommand {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InstallCredential { .. } => formatter.write_str("InstallCredential([REDACTED])"),
            Self::RemoveCredential => formatter.write_str("RemoveCredential"),
            Self::OpenWorkspace { .. } => formatter.write_str("OpenWorkspace([REDACTED])"),
            Self::SelectWorkspace { registration_id } => formatter
                .debug_struct("SelectWorkspace")
                .field("registration_id", registration_id)
                .finish(),
            Self::NewSession => formatter.write_str("NewSession"),
            Self::OpenSession { session_id } => formatter
                .debug_struct("OpenSession")
                .field("session_id", session_id)
                .finish(),
            Self::RefreshWorkspace => formatter.write_str("RefreshWorkspace"),
            Self::ExpandDirectory { relative_path } => formatter
                .debug_struct("ExpandDirectory")
                .field("relative_path", relative_path)
                .finish(),
            Self::OpenFile { relative_path } => formatter
                .debug_struct("OpenFile")
                .field("relative_path", relative_path)
                .finish(),
            Self::RefreshGit => formatter.write_str("RefreshGit"),
            Self::RefreshGitDiff => formatter.write_str("RefreshGitDiff"),
            Self::SetPanePresentation { .. } => formatter.write_str("SetPanePresentation"),
            Self::SendPrompt { text } => formatter
                .debug_struct("SendPrompt")
                .field("text_bytes", &text.len())
                .finish(),
            Self::CreateTerminal {
                workspace_generation,
                dimensions,
            } => formatter
                .debug_struct("CreateTerminal")
                .field("workspace_generation", workspace_generation)
                .field("dimensions", dimensions)
                .finish(),
            Self::ResizeTerminal {
                workspace_generation,
                terminal_identity,
                dimensions,
            } => formatter
                .debug_struct("ResizeTerminal")
                .field("workspace_generation", workspace_generation)
                .field("terminal_identity", terminal_identity)
                .field("dimensions", dimensions)
                .finish(),
            Self::RestartTerminal {
                workspace_generation,
                terminal_identity,
                dimensions,
            } => formatter
                .debug_struct("RestartTerminal")
                .field("workspace_generation", workspace_generation)
                .field("terminal_identity", terminal_identity)
                .field("dimensions", dimensions)
                .finish(),
            Self::StartTerminal => formatter.write_str("StartTerminal"),
            Self::TerminalInput { bytes } => formatter
                .debug_struct("TerminalInput")
                .field("byte_count", &bytes.len())
                .finish(),
            Self::InterruptTerminal => formatter.write_str("InterruptTerminal"),
            Self::CloseTerminal => formatter.write_str("CloseTerminal"),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WorkbenchCommandKind {
    Credential,
    Workspace,
    Session,
    Turn,
    Terminal,
}

#[derive(Clone)]
pub enum WorkbenchControllerEvent {
    Snapshot(Box<WorkbenchSnapshot>),
    Runtime(RuntimeEvent),
    CommandFinished {
        kind: WorkbenchCommandKind,
        succeeded: bool,
        code: Option<&'static str>,
    },
}

impl std::fmt::Debug for WorkbenchControllerEvent {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Snapshot(snapshot) => snapshot.fmt(formatter),
            Self::Runtime(event) => event.fmt(formatter),
            Self::CommandFinished {
                kind,
                succeeded,
                code,
            } => formatter
                .debug_struct("CommandFinished")
                .field("kind", kind)
                .field("succeeded", succeeded)
                .field("code", code)
                .finish(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkspaceSummary {
    pub registration_id: WorkspaceRegistrationId,
    pub display_name: String,
    pub selected: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionSummary {
    pub session_id: SessionId,
    pub title: String,
    pub read_only: bool,
    pub selected: bool,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum TerminalPanelStatus {
    #[default]
    Inactive,
    Starting,
    Running,
    Exited,
    Closing,
    Closed,
    Failed,
    Uncertain,
}

#[derive(Clone)]
pub struct WorkbenchSnapshot {
    pub credentials: CredentialState,
    pub workspaces: Vec<WorkspaceSummary>,
    pub sessions: Vec<SessionSummary>,
    pub selected_registration_id: Option<WorkspaceRegistrationId>,
    pub workspace_generation: Option<WorkspaceGeneration>,
    pub selected_session_id: Option<SessionId>,
    pub messages: Vec<BackendMessage>,
    pub directory: Option<DirectorySnapshot>,
    pub directories: Vec<DirectorySnapshot>,
    pub file: Option<FileSnapshot>,
    pub git: Option<GitSnapshot>,
    pub git_diff: Option<UncommittedDiffSnapshot>,
    pub terminal: Option<TerminalSnapshot>,
    pub terminal_identity: Option<TerminalIdentity>,
    pub terminal_status: TerminalPanelStatus,
    pub pane_visibility: PaneVisibilityPreferences,
    pub pane_fractions: PaneFractionsV2,
    pub session_read_only: bool,
    pub workspace_available: bool,
    pub turn_active: bool,
}

impl std::fmt::Debug for WorkbenchSnapshot {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("WorkbenchSnapshot")
            .field("credentials", &self.credentials)
            .field("workspaces", &self.workspaces)
            .field("sessions", &self.sessions)
            .field("selected_registration_id", &self.selected_registration_id)
            .field("workspace_generation", &self.workspace_generation)
            .field("selected_session_id", &self.selected_session_id)
            .field("message_count", &self.messages.len())
            .field(
                "directory_entries",
                &self.directory.as_ref().map(|value| value.entries.len()),
            )
            .field("file_present", &self.file.is_some())
            .field("git_present", &self.git.is_some())
            .field("terminal_present", &self.terminal.is_some())
            .field("terminal_identity", &self.terminal_identity)
            .field("terminal_status", &self.terminal_status)
            .field("pane_visibility", &self.pane_visibility)
            .field("session_read_only", &self.session_read_only)
            .field("workspace_available", &self.workspace_available)
            .field("turn_active", &self.turn_active)
            .finish()
    }
}

pub struct WorkbenchController {
    services: Arc<HeadlessApplicationServices>,
    preferences: WorkbenchPreferencesStore,
    coordinator: ApplicationCoordinator,
    durable: Option<DurableSessionContext>,
    selected_registration_id: Option<WorkspaceRegistrationId>,
    workspace_generation: Option<WorkspaceGeneration>,
    directory: Option<DirectorySnapshot>,
    directories: BTreeMap<String, DirectorySnapshot>,
    file: Option<FileSnapshot>,
    git: Option<GitSnapshot>,
    git_diff: Option<UncommittedDiffSnapshot>,
    terminal_manager: TerminalManager,
    terminal_identity: Option<TerminalIdentity>,
    terminal_snapshot: Option<TerminalSnapshot>,
    terminal_status: TerminalPanelStatus,
}

impl std::fmt::Debug for WorkbenchController {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("WorkbenchController")
            .field("durable_session", &self.durable.is_some())
            .field("selected_registration_id", &self.selected_registration_id)
            .finish_non_exhaustive()
    }
}

impl WorkbenchController {
    pub async fn restore(
        services: Arc<HeadlessApplicationServices>,
        preferences: WorkbenchPreferencesStore,
    ) -> Self {
        let selected_registration_id = preferences.preferences().selected_workspace_registration_id;
        let selected_session_id = preferences.preferences().selected_session_id;
        let selected_path = selected_registration_id.and_then(|registration_id| {
            preferences
                .preferences()
                .registered_workspaces
                .iter()
                .find(|entry| entry.registration_id == registration_id)
                .map(|entry| entry.canonical_path.clone())
        });
        if let (Some(registration_id), Some(session_id), Some(path)) =
            (selected_registration_id, selected_session_id, selected_path)
            && let Ok(material) = open_durable_session(
                &services.sessions(),
                services.paths().root(),
                &path,
                session_id,
            )
            && let Ok(context) = material.activate(&services).await
        {
            let coordinator = local_placeholder(&services).await;
            let mut controller = Self {
                services,
                preferences,
                coordinator,
                durable: Some(context),
                selected_registration_id: Some(registration_id),
                workspace_generation: Some(WorkspaceGeneration::new()),
                directory: None,
                directories: BTreeMap::new(),
                file: None,
                git: None,
                git_diff: None,
                terminal_manager: TerminalManager::new(),
                terminal_identity: None,
                terminal_snapshot: None,
                terminal_status: TerminalPanelStatus::Inactive,
            }
            .use_durable_coordinator();
            let _ = controller.refresh_workspace();
            return controller;
        }
        let coordinator = local_placeholder(&services).await;
        Self {
            services,
            preferences,
            coordinator,
            durable: None,
            selected_registration_id: None,
            workspace_generation: None,
            directory: None,
            directories: BTreeMap::new(),
            file: None,
            git: None,
            git_diff: None,
            terminal_manager: TerminalManager::new(),
            terminal_identity: None,
            terminal_snapshot: None,
            terminal_status: TerminalPanelStatus::Inactive,
        }
    }

    fn use_durable_coordinator(mut self) -> Self {
        if let Some(context) = self.durable.as_mut() {
            std::mem::swap(&mut self.coordinator, &mut context.coordinator);
        }
        self
    }

    pub fn approval_policy(&self) -> Option<Arc<InteractiveApprovalPolicy>> {
        self.durable
            .as_ref()
            .map(|context| context.approvals.clone())
    }

    pub fn selected_workspace(&self) -> Option<crate::tools::workspace::Workspace> {
        self.durable
            .as_ref()
            .map(|context| context.workspace.clone())
    }

    pub fn snapshot(&self) -> WorkbenchSnapshot {
        let session = self.coordinator.state.session.as_ref();
        let registered_roots = self
            .preferences
            .preferences()
            .registered_workspaces
            .iter()
            .map(|entry| entry.canonical_path.clone())
            .collect::<Vec<_>>();
        let selected_path = self.selected_registration_id.and_then(|selected| {
            self.preferences
                .preferences()
                .registered_workspaces
                .iter()
                .find(|entry| entry.registration_id == selected)
                .map(|entry| entry.canonical_path.as_path())
        });
        let selected_session_id = session.map(|session| session.id);
        let sessions = scan_sessions(self.services.paths().root(), &registered_roots)
            .unwrap_or_default()
            .into_iter()
            .filter(|entry| {
                selected_path.is_some_and(|path| entry.workspace.as_deref() == Some(path))
            })
            .map(|entry| SessionSummary {
                session_id: entry.session_id,
                title: entry.title,
                read_only: entry.read_only
                    || !matches!(entry.classification, SessionClassification::Writable),
                selected: selected_session_id == Some(entry.session_id),
            })
            .collect();
        WorkbenchSnapshot {
            credentials: self.coordinator.state.credentials,
            workspaces: self
                .preferences
                .preferences()
                .registered_workspaces
                .iter()
                .map(|entry| WorkspaceSummary {
                    registration_id: entry.registration_id,
                    display_name: entry.display_name.clone(),
                    selected: self.selected_registration_id == Some(entry.registration_id),
                })
                .collect(),
            sessions,
            selected_registration_id: self.selected_registration_id,
            workspace_generation: self.workspace_generation,
            selected_session_id,
            messages: session.map_or_else(Vec::new, |session| session.messages.clone()),
            directory: self.directory.clone(),
            directories: self.directories.values().cloned().collect(),
            file: self.file.clone(),
            git: self.git.clone(),
            git_diff: self.git_diff.clone(),
            terminal: self.terminal_snapshot.clone(),
            terminal_identity: self.terminal_identity,
            terminal_status: self.terminal_status,
            pane_visibility: self.preferences.preferences().pane_visibility,
            pane_fractions: self.preferences.preferences().pane_fractions,
            session_read_only: session.is_none_or(|session| session.read_only),
            workspace_available: session.is_some_and(|session| session.workspace_available),
            turn_active: self
                .coordinator
                .state
                .active_turn
                .as_ref()
                .is_some_and(|turn| !turn.status.is_terminal()),
        }
    }

    pub async fn dispatch(
        &mut self,
        command: WorkbenchCommand,
        cancellation: CancellationToken,
        mut sink: impl FnMut(WorkbenchControllerEvent),
    ) {
        let kind = command.kind();
        let result = match command {
            WorkbenchCommand::InstallCredential { candidate } => {
                self.dispatch_intent(
                    Intent::InstallCredential { candidate },
                    cancellation,
                    &mut sink,
                )
                .await
            }
            WorkbenchCommand::RemoveCredential => {
                self.dispatch_intent(Intent::RemoveCredential, cancellation, &mut sink)
                    .await
            }
            WorkbenchCommand::OpenWorkspace { path } => self.open_workspace(path).await,
            WorkbenchCommand::SelectWorkspace { registration_id } => {
                self.select_workspace(registration_id).await
            }
            WorkbenchCommand::NewSession => self.new_session().await,
            WorkbenchCommand::OpenSession { session_id } => self.open_session(session_id).await,
            WorkbenchCommand::RefreshWorkspace => self.refresh_workspace(),
            WorkbenchCommand::ExpandDirectory { relative_path } => {
                self.expand_directory(relative_path)
            }
            WorkbenchCommand::OpenFile { relative_path } => self.open_file(relative_path),
            WorkbenchCommand::RefreshGit => self.refresh_git(cancellation).await,
            WorkbenchCommand::RefreshGitDiff => self.refresh_git_diff(cancellation).await,
            WorkbenchCommand::SetPanePresentation {
                visibility,
                fractions,
            } => self.set_pane_presentation(visibility, fractions),
            WorkbenchCommand::SendPrompt { text } => {
                let Some(session_id) = self
                    .coordinator
                    .state
                    .session
                    .as_ref()
                    .map(|session| session.id)
                else {
                    sink(WorkbenchControllerEvent::CommandFinished {
                        kind,
                        succeeded: false,
                        code: Some("session_unavailable"),
                    });
                    return;
                };
                self.dispatch_intent(
                    Intent::SendPrompt { session_id, text },
                    cancellation,
                    &mut sink,
                )
                .await
            }
            WorkbenchCommand::CreateTerminal {
                workspace_generation,
                dimensions,
            } => self.create_terminal(workspace_generation, dimensions),
            WorkbenchCommand::ResizeTerminal {
                workspace_generation,
                terminal_identity,
                dimensions,
            } => self.resize_terminal(workspace_generation, terminal_identity, dimensions),
            WorkbenchCommand::RestartTerminal {
                workspace_generation,
                terminal_identity,
                dimensions,
            } => self.restart_terminal(workspace_generation, terminal_identity, dimensions),
            WorkbenchCommand::StartTerminal => self.start_terminal(),
            WorkbenchCommand::TerminalInput { bytes } => self.write_terminal_input(bytes),
            WorkbenchCommand::InterruptTerminal => self.interrupt_terminal(),
            WorkbenchCommand::CloseTerminal => self.close_terminal(),
        };
        sink(WorkbenchControllerEvent::Snapshot(Box::new(
            self.snapshot(),
        )));
        sink(WorkbenchControllerEvent::CommandFinished {
            kind,
            succeeded: result.is_ok(),
            code: result.err().map(|error| error.code()),
        });
    }

    async fn dispatch_intent(
        &mut self,
        intent: Intent,
        cancellation: CancellationToken,
        sink: &mut impl FnMut(WorkbenchControllerEvent),
    ) -> Result<(), ControllerError> {
        self.coordinator
            .dispatch_cancellable(intent, cancellation, |event| {
                sink(WorkbenchControllerEvent::Runtime(event));
            })
            .await
            .map_err(ControllerError::Coordinator)
    }

    async fn open_workspace(&mut self, path: PathBuf) -> Result<(), ControllerError> {
        self.ensure_idle()?;
        let material = create_durable_session(
            &self.services.sessions(),
            self.services.paths().root(),
            &path,
        )
        .map_err(ControllerError::Service)?;
        let canonical_path = material.workspace.root().to_path_buf();
        let context = material
            .activate(&self.services)
            .await
            .map_err(ControllerError::Service)?;
        let registration_id = self
            .preferences
            .preferences()
            .registered_workspaces
            .iter()
            .find(|entry| entry.canonical_path == canonical_path)
            .map_or_else(WorkspaceRegistrationId::new, |entry| entry.registration_id);
        let inserted_registration = self
            .preferences
            .preferences()
            .registered_workspaces
            .iter()
            .all(|entry| entry.registration_id != registration_id);
        if inserted_registration {
            if self.preferences.preferences().registered_workspaces.len()
                >= super::workbench_preferences::MAX_REGISTERED_WORKSPACES
            {
                return Err(ControllerError::RegistryLimit);
            }
            let display_name = display_name(&canonical_path)?;
            self.preferences
                .preferences_mut()
                .registered_workspaces
                .push(WorkspaceRegistrationPreference {
                    registration_id,
                    canonical_path,
                    display_name,
                    last_selected_at: None,
                });
        }
        let result = self.install_context(registration_id, context).await;
        if result.is_err() && inserted_registration {
            self.preferences
                .preferences_mut()
                .registered_workspaces
                .retain(|entry| entry.registration_id != registration_id);
        }
        result
    }

    async fn new_session(&mut self) -> Result<(), ControllerError> {
        self.ensure_idle()?;
        let registration_id = self
            .selected_registration_id
            .ok_or(ControllerError::NoWorkspace)?;
        let path = self.registration_path(registration_id)?.to_path_buf();
        let material = create_durable_session(
            &self.services.sessions(),
            self.services.paths().root(),
            &path,
        )
        .map_err(ControllerError::Service)?;
        let context = material
            .activate(&self.services)
            .await
            .map_err(ControllerError::Service)?;
        self.install_context(registration_id, context).await
    }

    async fn select_workspace(
        &mut self,
        registration_id: WorkspaceRegistrationId,
    ) -> Result<(), ControllerError> {
        self.ensure_idle()?;
        let path = self.registration_path(registration_id)?.to_path_buf();
        let registered_roots = self
            .preferences
            .preferences()
            .registered_workspaces
            .iter()
            .map(|entry| entry.canonical_path.clone())
            .collect::<Vec<_>>();
        let session_id = scan_sessions(self.services.paths().root(), &registered_roots)
            .unwrap_or_default()
            .into_iter()
            .find(|entry| {
                entry.workspace.as_deref() == Some(path.as_path())
                    && !matches!(
                        entry.classification,
                        SessionClassification::Damaged
                            | SessionClassification::MissingWorkspace
                            | SessionClassification::Incompatible
                    )
            })
            .map(|entry| entry.session_id);
        let material = if let Some(session_id) = session_id {
            open_durable_session(
                &self.services.sessions(),
                self.services.paths().root(),
                &path,
                session_id,
            )
        } else {
            create_durable_session(
                &self.services.sessions(),
                self.services.paths().root(),
                &path,
            )
        }
        .map_err(ControllerError::Service)?;
        let context = material
            .activate(&self.services)
            .await
            .map_err(ControllerError::Service)?;
        self.install_context(registration_id, context).await
    }

    async fn open_session(&mut self, session_id: SessionId) -> Result<(), ControllerError> {
        self.ensure_idle()?;
        let registration_id = self
            .selected_registration_id
            .ok_or(ControllerError::NoWorkspace)?;
        let path = self.registration_path(registration_id)?.to_path_buf();
        let material = open_durable_session(
            &self.services.sessions(),
            self.services.paths().root(),
            &path,
            session_id,
        )
        .map_err(ControllerError::Service)?;
        let context = material
            .activate(&self.services)
            .await
            .map_err(ControllerError::Service)?;
        self.install_context(registration_id, context).await
    }

    async fn install_context(
        &mut self,
        registration_id: WorkspaceRegistrationId,
        mut context: DurableSessionContext,
    ) -> Result<(), ControllerError> {
        let session_id = context
            .coordinator
            .state
            .session
            .as_ref()
            .map(|session| session.id);
        let workspace_generation = WorkspaceGeneration::new();
        let directory = enumerate_directory(
            &context.workspace,
            registration_id,
            workspace_generation,
            TreeRequestId::new(),
            ".",
            0,
        )
        .map_err(|_| ControllerError::Inspection)?;

        // A terminal is permanently bound to the workspace generation that launched it. Until
        // terminal tabs can keep old generations visibly grouped, prove cleanup before changing
        // the selected workspace so the shell can never appear to have been retargeted.
        self.reset_terminal_for_workspace_change()?;

        let previous_preferences = self.preferences.preferences().clone();
        let preferences = self.preferences.preferences_mut();
        preferences.selected_workspace_registration_id = Some(registration_id);
        preferences.selected_session_id = session_id;
        if let Some(session_id) = session_id {
            preferences.open_session_tabs.retain(|id| *id != session_id);
            preferences.open_session_tabs.push(session_id);
            if preferences.open_session_tabs.len()
                > super::workbench_preferences::MAX_OPEN_SESSION_TABS
            {
                preferences.open_session_tabs.remove(0);
            }
        }
        if self.preferences.save().is_err() {
            *self.preferences.preferences_mut() = previous_preferences;
            return Err(ControllerError::Preferences);
        }

        if let Some(policy) = self.approval_policy() {
            policy.invalidate().await;
        }
        let placeholder = local_placeholder(&self.services).await;
        self.coordinator = std::mem::replace(&mut context.coordinator, placeholder);
        self.durable = Some(context);
        self.selected_registration_id = Some(registration_id);
        self.workspace_generation = Some(workspace_generation);
        self.directory = Some(directory);
        self.directories.clear();
        if let Some(directory) = self.directory.clone() {
            self.directories.insert(".".to_owned(), directory);
        }
        self.file = None;
        self.git = None;
        self.git_diff = None;
        Ok(())
    }

    fn set_pane_presentation(
        &mut self,
        visibility: PaneVisibilityPreferences,
        fractions: PaneFractionsV2,
    ) -> Result<(), ControllerError> {
        let previous = self.preferences.preferences().clone();
        self.preferences
            .preferences_mut()
            .set_pane_presentation(visibility, fractions)
            .map_err(|_| ControllerError::Preferences)?;
        if self.preferences.save().is_err() {
            *self.preferences.preferences_mut() = previous;
            return Err(ControllerError::Preferences);
        }
        Ok(())
    }

    fn terminal_binding(&self) -> Result<TerminalBinding, ControllerError> {
        let registration_id = self
            .selected_registration_id
            .ok_or(ControllerError::NoWorkspace)?;
        let workspace_generation = self
            .workspace_generation
            .ok_or(ControllerError::NoWorkspace)?;
        let workspace_root = self
            .durable
            .as_ref()
            .map(|context| context.workspace.root().to_path_buf())
            .ok_or(ControllerError::NoWorkspace)?;
        TerminalBinding::new(registration_id, workspace_generation, workspace_root, ".")
            .map_err(ControllerError::Terminal)
    }

    /// Compatibility adapter for the pre-6C explicit start button.  The chat-first surface uses
    /// [`Self::create_terminal`] with measured nonzero dimensions instead.
    fn start_terminal(&mut self) -> Result<(), ControllerError> {
        let dimensions = TerminalSurfaceDimensions::new(80, 24, 1, 1)
            .expect("constant terminal dimensions are valid");
        let workspace_generation = self
            .workspace_generation
            .ok_or(ControllerError::NoWorkspace)?;
        self.create_terminal(workspace_generation, dimensions)
    }

    fn create_terminal(
        &mut self,
        workspace_generation: WorkspaceGeneration,
        dimensions: TerminalSurfaceDimensions,
    ) -> Result<(), ControllerError> {
        self.ensure_terminal_workspace_generation(workspace_generation)?;
        let result = match (self.terminal_identity, self.terminal_status) {
            (Some(_), TerminalPanelStatus::Uncertain) => Err(ControllerError::TerminalCleanup),
            // Repeated reveal/create while opening is idempotent and cannot allocate a second
            // PTY. A deliberate restart remains a separate command after close.
            (Some(_), _) => Ok(()),
            (None, _) => (|| {
                let binding = self.terminal_binding()?;
                let identity = self
                    .terminal_manager
                    .create_terminal(binding, dimensions.launch_options())
                    .map_err(ControllerError::Terminal)?;
                self.terminal_identity = Some(identity);
                self.terminal_snapshot = None;
                self.terminal_status = TerminalPanelStatus::Starting;
                Ok(())
            })(),
        };
        if result.is_err() {
            self.terminal_status = TerminalPanelStatus::Failed;
        }
        result
    }

    fn resize_terminal(
        &mut self,
        workspace_generation: WorkspaceGeneration,
        terminal_identity: TerminalIdentity,
        dimensions: TerminalSurfaceDimensions,
    ) -> Result<(), ControllerError> {
        self.ensure_terminal_workspace_generation(workspace_generation)?;
        self.ensure_terminal_identity(terminal_identity)?;
        self.terminal_manager
            .resize(
                terminal_identity,
                dimensions.columns,
                dimensions.rows,
                dimensions.pixel_width,
                dimensions.pixel_height,
            )
            .map_err(ControllerError::Terminal)
    }

    fn restart_terminal(
        &mut self,
        workspace_generation: WorkspaceGeneration,
        terminal_identity: TerminalIdentity,
        dimensions: TerminalSurfaceDimensions,
    ) -> Result<(), ControllerError> {
        self.ensure_terminal_workspace_generation(workspace_generation)?;
        self.ensure_terminal_identity(terminal_identity)?;
        if self.terminal_status == TerminalPanelStatus::Uncertain {
            return Err(ControllerError::TerminalCleanup);
        }
        if self.terminal_status != TerminalPanelStatus::Closed {
            return Err(ControllerError::TerminalActive);
        }
        let next_identity = self
            .terminal_manager
            .restart(terminal_identity, dimensions.launch_options())
            .map_err(ControllerError::Terminal)?;
        self.terminal_identity = Some(next_identity);
        self.terminal_snapshot = None;
        self.terminal_status = TerminalPanelStatus::Starting;
        Ok(())
    }

    fn ensure_terminal_workspace_generation(
        &self,
        expected: WorkspaceGeneration,
    ) -> Result<(), ControllerError> {
        if self.workspace_generation == Some(expected) {
            Ok(())
        } else {
            Err(ControllerError::StaleWorkspace)
        }
    }

    fn ensure_terminal_identity(&self, expected: TerminalIdentity) -> Result<(), ControllerError> {
        if self.terminal_identity == Some(expected) {
            Ok(())
        } else {
            Err(ControllerError::StaleTerminal)
        }
    }

    fn write_terminal_input(&mut self, bytes: Vec<u8>) -> Result<(), ControllerError> {
        let identity = self
            .terminal_identity
            .ok_or(ControllerError::TerminalInactive)?;
        self.terminal_manager
            .write_input(identity, &bytes)
            .map_err(ControllerError::Terminal)
    }

    fn interrupt_terminal(&mut self) -> Result<(), ControllerError> {
        let identity = self
            .terminal_identity
            .ok_or(ControllerError::TerminalInactive)?;
        self.terminal_manager
            .send_interrupt(identity)
            .map_err(ControllerError::Terminal)
    }

    fn close_terminal(&mut self) -> Result<(), ControllerError> {
        let identity = self
            .terminal_identity
            .ok_or(ControllerError::TerminalInactive)?;
        self.terminal_manager
            .close(identity, CloseReason::User)
            .map_err(ControllerError::Terminal)?;
        self.terminal_status = TerminalPanelStatus::Closing;
        Ok(())
    }

    pub fn poll_terminal(&mut self) -> bool {
        let mut changed = false;
        while let Some(event) = self.terminal_manager.try_recv_event() {
            if Some(event.identity) != self.terminal_identity {
                continue;
            }
            self.terminal_status = match event.kind {
                TerminalEventKind::Opening => TerminalPanelStatus::Starting,
                TerminalEventKind::Ready | TerminalEventKind::SnapshotChanged => {
                    TerminalPanelStatus::Running
                }
                TerminalEventKind::ChildExited { .. } => TerminalPanelStatus::Exited,
                TerminalEventKind::Closing { .. } => TerminalPanelStatus::Closing,
                TerminalEventKind::Closed { .. } => TerminalPanelStatus::Closed,
                TerminalEventKind::Failed { .. } => TerminalPanelStatus::Failed,
                TerminalEventKind::Uncertain { .. } => TerminalPanelStatus::Uncertain,
                TerminalEventKind::OutputTruncated { .. }
                | TerminalEventKind::InputBackpressure => self.terminal_status,
            };
            changed = true;
            if let Ok(Some(snapshot)) = self.terminal_manager.snapshot(
                event.identity,
                self.terminal_snapshot
                    .as_ref()
                    .map(|snapshot| snapshot.sequence),
            ) {
                self.terminal_snapshot = Some(snapshot);
            }
        }
        changed
    }

    fn reset_terminal_for_workspace_change(&mut self) -> Result<(), ControllerError> {
        if !self.terminal_manager.shutdown_all(Duration::from_secs(2)) {
            self.terminal_status = TerminalPanelStatus::Uncertain;
            return Err(ControllerError::TerminalCleanup);
        }
        self.terminal_manager = TerminalManager::new();
        self.terminal_identity = None;
        self.terminal_snapshot = None;
        self.terminal_status = TerminalPanelStatus::Inactive;
        Ok(())
    }

    fn refresh_workspace(&mut self) -> Result<(), ControllerError> {
        let registration_id = self
            .selected_registration_id
            .ok_or(ControllerError::NoWorkspace)?;
        let generation = self
            .workspace_generation
            .ok_or(ControllerError::NoWorkspace)?;
        let workspace = self
            .durable
            .as_ref()
            .map(|context| &context.workspace)
            .ok_or(ControllerError::NoWorkspace)?;
        self.directory = Some(
            enumerate_directory(
                workspace,
                registration_id,
                generation,
                TreeRequestId::new(),
                ".",
                0,
            )
            .map_err(|_| ControllerError::Inspection)?,
        );
        self.directories.clear();
        if let Some(directory) = self.directory.clone() {
            self.directories.insert(".".to_owned(), directory);
        }
        Ok(())
    }

    fn expand_directory(&mut self, relative_path: String) -> Result<(), ControllerError> {
        let registration_id = self
            .selected_registration_id
            .ok_or(ControllerError::NoWorkspace)?;
        let generation = self
            .workspace_generation
            .ok_or(ControllerError::NoWorkspace)?;
        let workspace = self
            .durable
            .as_ref()
            .map(|context| &context.workspace)
            .ok_or(ControllerError::NoWorkspace)?;
        let is_known_directory = self.directories.values().any(|directory| {
            directory.entries.iter().any(|entry| {
                entry.relative_path == relative_path && entry.kind == TreeEntryKind::Directory
            })
        });
        if !is_known_directory {
            return Err(ControllerError::Inspection);
        }
        let depth = Path::new(&relative_path).components().count();
        let snapshot = enumerate_directory(
            workspace,
            registration_id,
            generation,
            TreeRequestId::new(),
            &relative_path,
            depth,
        )
        .map_err(|_| ControllerError::Inspection)?;
        if snapshot.registration_id != registration_id
            || snapshot.workspace_generation != generation
        {
            return Err(ControllerError::Inspection);
        }
        self.directories.insert(relative_path, snapshot);
        Ok(())
    }

    fn open_file(&mut self, relative_path: String) -> Result<(), ControllerError> {
        let registration_id = self
            .selected_registration_id
            .ok_or(ControllerError::NoWorkspace)?;
        let generation = self
            .workspace_generation
            .ok_or(ControllerError::NoWorkspace)?;
        let workspace = self
            .durable
            .as_ref()
            .map(|context| &context.workspace)
            .ok_or(ControllerError::NoWorkspace)?;
        let is_known_file = self.directories.values().any(|directory| {
            directory.entries.iter().any(|entry| {
                entry.relative_path == relative_path && entry.kind == TreeEntryKind::File
            })
        });
        if !is_known_file {
            return Err(ControllerError::Inspection);
        }
        self.file = Some(
            read_file_snapshot(
                workspace,
                FileSnapshotIdentity {
                    registration_id,
                    workspace_generation: generation,
                    request_id: FileRequestId::new(),
                },
                &relative_path,
            )
            .map_err(|_| ControllerError::Inspection)?,
        );
        self.git_diff = None;
        Ok(())
    }

    async fn refresh_git(
        &mut self,
        cancellation: CancellationToken,
    ) -> Result<(), ControllerError> {
        let registration_id = self
            .selected_registration_id
            .ok_or(ControllerError::NoWorkspace)?;
        let generation = self
            .workspace_generation
            .ok_or(ControllerError::NoWorkspace)?;
        let workspace = self
            .durable
            .as_ref()
            .map(|context| &context.workspace)
            .ok_or(ControllerError::NoWorkspace)?;
        workspace
            .ensure_current()
            .map_err(|_| ControllerError::Inspection)?;
        let result = execute_git(
            GitRequest {
                registration_id,
                workspace_generation: generation,
                request_id: GitRequestId::new(),
                cwd: workspace.root().to_path_buf(),
                operation: GitOperation::Status,
            },
            cancellation,
        )
        .await
        .map_err(|_| ControllerError::Git)?;
        workspace
            .ensure_current()
            .map_err(|_| ControllerError::Inspection)?;
        let GitInspectionResult::Status(snapshot) = result else {
            return Err(ControllerError::Git);
        };
        self.git = Some(snapshot);
        Ok(())
    }

    async fn refresh_git_diff(
        &mut self,
        cancellation: CancellationToken,
    ) -> Result<(), ControllerError> {
        let registration_id = self
            .selected_registration_id
            .ok_or(ControllerError::NoWorkspace)?;
        let generation = self
            .workspace_generation
            .ok_or(ControllerError::NoWorkspace)?;
        let workspace = self
            .durable
            .as_ref()
            .map(|context| &context.workspace)
            .ok_or(ControllerError::NoWorkspace)?;
        workspace
            .ensure_current()
            .map_err(|_| ControllerError::Inspection)?;
        let result = execute_git(
            GitRequest {
                registration_id,
                workspace_generation: generation,
                request_id: GitRequestId::new(),
                cwd: workspace.root().to_path_buf(),
                operation: GitOperation::Diff,
            },
            cancellation,
        )
        .await
        .map_err(|_| ControllerError::Git)?;
        workspace
            .ensure_current()
            .map_err(|_| ControllerError::Inspection)?;
        let GitInspectionResult::Diff(snapshot) = result else {
            return Err(ControllerError::Git);
        };
        if snapshot.registration_id != registration_id
            || snapshot.workspace_generation != generation
        {
            return Err(ControllerError::Git);
        }
        self.file = None;
        self.git_diff = Some(snapshot);
        Ok(())
    }

    fn ensure_idle(&self) -> Result<(), ControllerError> {
        if self
            .coordinator
            .state
            .active_turn
            .as_ref()
            .is_some_and(|turn| !turn.status.is_terminal())
        {
            Err(ControllerError::TurnActive)
        } else {
            Ok(())
        }
    }

    fn registration_path(
        &self,
        registration_id: WorkspaceRegistrationId,
    ) -> Result<&Path, ControllerError> {
        self.preferences
            .preferences()
            .registered_workspaces
            .iter()
            .find(|entry| entry.registration_id == registration_id)
            .map(|entry| entry.canonical_path.as_path())
            .ok_or(ControllerError::NoWorkspace)
    }

    pub async fn shutdown(mut self, window_frame: Option<WindowFrame>) {
        if let Some(policy) = self.approval_policy() {
            policy.invalidate().await;
        }
        let terminal_cleanup_proven = self.terminal_manager.shutdown_all(Duration::from_secs(2));
        if !self.preferences.overwrite_blocked() {
            self.preferences.preferences_mut().window_frame = window_frame;
            self.preferences.preferences_mut().clean_shutdown = terminal_cleanup_proven;
            let _ = self.preferences.save();
        }
    }
}

impl WorkbenchCommand {
    fn kind(&self) -> WorkbenchCommandKind {
        match self {
            Self::InstallCredential { .. } | Self::RemoveCredential => {
                WorkbenchCommandKind::Credential
            }
            Self::OpenWorkspace { .. } | Self::SelectWorkspace { .. } => {
                WorkbenchCommandKind::Workspace
            }
            Self::NewSession | Self::OpenSession { .. } => WorkbenchCommandKind::Session,
            Self::RefreshWorkspace
            | Self::ExpandDirectory { .. }
            | Self::OpenFile { .. }
            | Self::RefreshGit
            | Self::RefreshGitDiff
            | Self::SetPanePresentation { .. } => WorkbenchCommandKind::Workspace,
            Self::SendPrompt { .. } => WorkbenchCommandKind::Turn,
            Self::CreateTerminal { .. }
            | Self::ResizeTerminal { .. }
            | Self::RestartTerminal { .. }
            | Self::StartTerminal
            | Self::TerminalInput { .. }
            | Self::InterruptTerminal
            | Self::CloseTerminal => WorkbenchCommandKind::Terminal,
        }
    }
}

async fn local_placeholder(services: &HeadlessApplicationServices) -> ApplicationCoordinator {
    services
        .coordinator(
            Arc::new(crate::tools::NoToolRuntime),
            Arc::new(crate::tools::StaticApprovalPolicy::new(
                crate::tools::ApprovalDecision::Unavailable,
            )),
        )
        .await
}

fn display_name(path: &Path) -> Result<String, ControllerError> {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty() && name.len() <= 256)
        .ok_or(ControllerError::InvalidDisplayName)?;
    if name.chars().any(char::is_control) {
        return Err(ControllerError::InvalidDisplayName);
    }
    Ok(name.to_owned())
}

#[derive(Debug, thiserror::Error)]
enum ControllerError {
    #[error("the coordinator rejected the operation")]
    Coordinator(#[source] CoordinatorError),
    #[error("a workbench service is unavailable")]
    Service(#[source] WorkbenchServiceError),
    #[error("workbench preferences could not be persisted")]
    Preferences,
    #[error("the workspace registry is full")]
    RegistryLimit,
    #[error("no workspace is selected")]
    NoWorkspace,
    #[error("the workspace changed before the terminal request was applied")]
    StaleWorkspace,
    #[error("the terminal changed before the request was applied")]
    StaleTerminal,
    #[error("a turn is active")]
    TurnActive,
    #[error("workspace inspection failed")]
    Inspection,
    #[error("Git inspection failed")]
    Git,
    #[error("the workspace display name is invalid")]
    InvalidDisplayName,
    #[error("terminal operation failed")]
    Terminal(#[source] TerminalError),
    #[error("a terminal is already active")]
    TerminalActive,
    #[error("no terminal is active")]
    TerminalInactive,
    #[error("terminal process cleanup could not be proven")]
    TerminalCleanup,
}

impl ControllerError {
    fn code(&self) -> &'static str {
        match self {
            Self::Coordinator(CoordinatorError::Rejected) => "operation_rejected",
            Self::Coordinator(CoordinatorError::Credential) => "credential_operation_failed",
            Self::Coordinator(CoordinatorError::Cancelled) => "operation_cancelled",
            Self::Coordinator(CoordinatorError::Session) => "session_unavailable",
            Self::Coordinator(CoordinatorError::Persistence) => "session_persistence_failed",
            Self::Coordinator(CoordinatorError::Backend(_)) => "backend_failed",
            Self::Coordinator(CoordinatorError::Agent(_)) => "turn_failed",
            Self::Service(error) => error.code(),
            Self::Preferences => "preferences_write_failed",
            Self::RegistryLimit => "workspace_registry_full",
            Self::NoWorkspace => "workspace_unavailable",
            Self::StaleWorkspace => "stale_workspace",
            Self::StaleTerminal => "stale_terminal",
            Self::TurnActive => "turn_active",
            Self::Inspection => "workspace_inspection_failed",
            Self::Git => "git_inspection_failed",
            Self::InvalidDisplayName => "workspace_name_invalid",
            Self::Terminal(_) => "terminal_operation_failed",
            Self::TerminalActive => "terminal_active",
            Self::TerminalInactive => "terminal_inactive",
            Self::TerminalCleanup => "terminal_cleanup_uncertain",
        }
    }
}

pub async fn resolve_approval(
    policy: Option<Arc<InteractiveApprovalPolicy>>,
    response: ApprovalResponse,
) -> Result<(), &'static str> {
    let policy = policy.ok_or("approval_unavailable")?;
    policy.resolve(response).await.map_err(|_| "stale_approval")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_surface_dimensions_require_measured_nonzero_bounded_geometry() {
        assert!(TerminalSurfaceDimensions::new(80, 24, 800, 600).is_some());
        assert!(TerminalSurfaceDimensions::new(0, 24, 800, 600).is_none());
        assert!(TerminalSurfaceDimensions::new(80, 0, 800, 600).is_none());
        assert!(TerminalSurfaceDimensions::new(80, 24, 0, 600).is_none());
        assert!(TerminalSurfaceDimensions::new(80, 24, 800, 0).is_none());
        assert!(TerminalSurfaceDimensions::new(MAX_COLUMNS + 1, 24, 800, 600).is_none());
        assert!(TerminalSurfaceDimensions::new(80, MAX_ROWS + 1, 800, 600).is_none());
    }

    #[test]
    fn sensitive_command_debug_is_redacted() {
        let command = WorkbenchCommand::OpenWorkspace {
            path: PathBuf::from("/Users/example/private-workspace"),
        };
        let debug = format!("{command:?}");
        assert!(!debug.contains("private-workspace"));
        assert!(
            !format!(
                "{:?}",
                WorkbenchCommand::SendPrompt {
                    text: "private prompt marker".into()
                }
            )
            .contains("private prompt marker")
        );
    }

    #[test]
    fn snapshot_debug_does_not_render_messages() {
        let snapshot = WorkbenchSnapshot {
            credentials: CredentialState::Missing,
            workspaces: Vec::new(),
            sessions: Vec::new(),
            selected_registration_id: None,
            workspace_generation: None,
            selected_session_id: None,
            messages: vec![BackendMessage::User(crate::backend::UserMessage {
                item_id: crate::agent::types::ItemId::new(),
                text: "private prompt marker".into(),
            })],
            directory: None,
            directories: Vec::new(),
            file: None,
            git: None,
            git_diff: None,
            terminal: None,
            terminal_identity: None,
            terminal_status: TerminalPanelStatus::Inactive,
            pane_visibility: PaneVisibilityPreferences::default(),
            pane_fractions: PaneFractionsV2::default(),
            session_read_only: false,
            workspace_available: true,
            turn_active: false,
        };
        assert!(!format!("{snapshot:?}").contains("private prompt marker"));
    }
}
