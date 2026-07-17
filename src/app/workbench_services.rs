//! Native workbench service composition for one durable workspace/session context.
//!
//! Views exchange typed commands with the native controller. They never receive these retained
//! filesystem capabilities, journal writers, provider actors, or approval resolvers.

use std::path::Path;
use std::sync::Arc;

use crate::agent::types::SessionId;
use crate::session::artifacts::{ArtifactLimits, PersistentArtifactStore};
use crate::session::journal::SessionEffectRecorder;
use crate::session::{OpenedSession, SessionManager};
use crate::tools::approval::InteractiveApprovalPolicy;
use crate::tools::patch::MacTrash;
use crate::tools::workspace::Workspace;
use crate::tools::{Phase5ToolRuntime, ToolRuntime};

use super::runtime::{ApplicationCoordinator, CoordinatorError};
use super::services::HeadlessApplicationServices;

pub struct DurableSessionMaterial {
    pub session_id: SessionId,
    pub workspace: Workspace,
    pub tools: Arc<dyn ToolRuntime>,
    pub approvals: Arc<InteractiveApprovalPolicy>,
    opened: OpenedSession,
    effects: Option<Arc<SessionEffectRecorder>>,
}

impl std::fmt::Debug for DurableSessionMaterial {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("DurableSessionMaterial")
            .field("session_id", &self.session_id)
            .field("workspace_retained", &true)
            .field("read_only", &self.opened.recovery.read_only)
            .finish()
    }
}

pub struct DurableSessionContext {
    pub session_id: SessionId,
    pub workspace: Workspace,
    pub approvals: Arc<InteractiveApprovalPolicy>,
    pub coordinator: ApplicationCoordinator,
}

impl std::fmt::Debug for DurableSessionContext {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("DurableSessionContext")
            .field("session_id", &self.session_id)
            .field("workspace_retained", &true)
            .finish_non_exhaustive()
    }
}

impl DurableSessionMaterial {
    pub async fn activate(
        self,
        services: &HeadlessApplicationServices,
    ) -> Result<DurableSessionContext, WorkbenchServiceError> {
        let coordinator = services
            .durable_coordinator(
                self.tools,
                self.approvals.clone(),
                self.opened,
                self.effects,
            )
            .await
            .map_err(WorkbenchServiceError::Coordinator)?;
        Ok(DurableSessionContext {
            session_id: self.session_id,
            workspace: self.workspace,
            approvals: self.approvals,
            coordinator,
        })
    }
}

pub fn create_durable_session(
    sessions: &SessionManager,
    application_root: &Path,
    workspace_path: &Path,
) -> Result<DurableSessionMaterial, WorkbenchServiceError> {
    let workspace =
        Workspace::open(workspace_path).map_err(|_| WorkbenchServiceError::WorkspaceUnavailable)?;
    let workspace_text = workspace_path_text(workspace.root())?;
    let opened = sessions
        .create_default(workspace_text)
        .map_err(|_| WorkbenchServiceError::SessionUnavailable)?;
    compose_material(application_root, workspace, opened)
}

pub fn open_durable_session(
    sessions: &SessionManager,
    application_root: &Path,
    workspace_path: &Path,
    session_id: SessionId,
) -> Result<DurableSessionMaterial, WorkbenchServiceError> {
    let workspace =
        Workspace::open(workspace_path).map_err(|_| WorkbenchServiceError::WorkspaceUnavailable)?;
    let opened = sessions
        .open(session_id)
        .map_err(|_| WorkbenchServiceError::SessionUnavailable)?;
    let recorded_workspace = opened
        .projection
        .workspace
        .as_deref()
        .ok_or(WorkbenchServiceError::SessionWorkspaceMismatch)?;
    let recorded_canonical = std::fs::canonicalize(recorded_workspace)
        .map_err(|_| WorkbenchServiceError::SessionWorkspaceMismatch)?;
    if recorded_canonical != workspace.root() {
        return Err(WorkbenchServiceError::SessionWorkspaceMismatch);
    }
    compose_material(application_root, workspace, opened)
}

fn compose_material(
    application_root: &Path,
    workspace: Workspace,
    opened: OpenedSession,
) -> Result<DurableSessionMaterial, WorkbenchServiceError> {
    if !application_root.is_absolute() {
        return Err(WorkbenchServiceError::ApplicationRoot);
    }
    let session_id = opened.session_id;
    let approvals = Arc::new(InteractiveApprovalPolicy::new());
    let (tools, effects) = if let Some(writer) = opened.writer.clone() {
        let effects = Arc::new(SessionEffectRecorder::new(writer));
        let artifacts = Arc::new(
            PersistentArtifactStore::new_for_session(
                application_root.join("artifacts"),
                Some(session_id),
                ArtifactLimits::default(),
            )
            .map_err(|_| WorkbenchServiceError::ArtifactUnavailable)?,
        );
        let tools = Arc::new(
            Phase5ToolRuntime::new_persistent_workspace(
                workspace.clone(),
                artifacts,
                effects.clone(),
                Arc::new(MacTrash),
            )
            .map_err(|_| WorkbenchServiceError::ToolUnavailable)?,
        );
        (tools as Arc<dyn ToolRuntime>, Some(effects))
    } else {
        (
            Arc::new(crate::tools::NoToolRuntime) as Arc<dyn ToolRuntime>,
            None,
        )
    };
    Ok(DurableSessionMaterial {
        session_id,
        workspace,
        tools,
        approvals,
        opened,
        effects,
    })
}

fn workspace_path_text(path: &Path) -> Result<String, WorkbenchServiceError> {
    let text = path
        .to_str()
        .ok_or(WorkbenchServiceError::WorkspaceUnavailable)?;
    if text.is_empty() || text.len() > 4 * 1024 || text.contains('\0') {
        return Err(WorkbenchServiceError::WorkspaceUnavailable);
    }
    Ok(text.to_owned())
}

#[derive(Debug, thiserror::Error)]
pub enum WorkbenchServiceError {
    #[error("the application root is invalid")]
    ApplicationRoot,
    #[error("the retained workspace is unavailable")]
    WorkspaceUnavailable,
    #[error("the session is unavailable")]
    SessionUnavailable,
    #[error("the session belongs to a different workspace")]
    SessionWorkspaceMismatch,
    #[error("the artifact store is unavailable")]
    ArtifactUnavailable,
    #[error("the workspace tool runtime is unavailable")]
    ToolUnavailable,
    #[error("the durable coordinator could not be activated")]
    Coordinator(#[source] CoordinatorError),
}

impl WorkbenchServiceError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::ApplicationRoot => "application_root_invalid",
            Self::WorkspaceUnavailable => "workspace_unavailable",
            Self::SessionUnavailable => "session_unavailable",
            Self::SessionWorkspaceMismatch => "session_workspace_mismatch",
            Self::ArtifactUnavailable => "artifact_unavailable",
            Self::ToolUnavailable => "tool_runtime_unavailable",
            Self::Coordinator(_) => "coordinator_unavailable",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_session_reuses_one_retained_workspace_for_tools() {
        let application = tempfile::tempdir().unwrap();
        let workspace = tempfile::tempdir().unwrap();
        let sessions = SessionManager::new(application.path()).unwrap();
        let material =
            create_durable_session(&sessions, application.path(), workspace.path()).unwrap();
        assert_eq!(
            material.workspace.root(),
            std::fs::canonicalize(workspace.path()).unwrap()
        );
        assert_eq!(material.tools.definitions().len(), 5);
        assert!(material.opened.writer.is_some());
        assert!(material.effects.is_some());
    }

    #[test]
    fn opening_under_a_different_workspace_is_rejected() {
        let application = tempfile::tempdir().unwrap();
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let sessions = SessionManager::new(application.path()).unwrap();
        let created = sessions
            .create_default(first.path().to_string_lossy().into_owned())
            .unwrap();
        let error = open_durable_session(
            &sessions,
            application.path(),
            second.path(),
            created.session_id,
        )
        .unwrap_err();
        assert!(matches!(
            error,
            WorkbenchServiceError::SessionWorkspaceMismatch
        ));
    }

    #[test]
    fn application_root_must_be_absolute() {
        let application = tempfile::tempdir().unwrap();
        let workspace = tempfile::tempdir().unwrap();
        let sessions = SessionManager::new(application.path()).unwrap();
        let opened = sessions
            .create_default(workspace.path().to_string_lossy().into_owned())
            .unwrap();
        let retained = Workspace::open(workspace.path()).unwrap();
        assert!(matches!(
            compose_material(Path::new("relative"), retained, opened),
            Err(WorkbenchServiceError::ApplicationRoot)
        ));
    }
}
