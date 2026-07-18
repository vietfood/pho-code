//! GPUI-neutral presentation state for the lazily revealed terminal surface.
//!
//! Visibility is intentionally separate from terminal actor lifecycle.  This reducer never
//! starts, writes to, signals, closes, or restarts a process; its effects are typed requests for
//! the native controller adapter to dispatch after layout has supplied valid dimensions.

use crate::app::workbench_controller::{TerminalPanelStatus, TerminalSurfaceDimensions};
use crate::app::workbench_state::WorkspaceGeneration;
use crate::terminal::TerminalIdentity;

/// A non-terminal focus target that can be restored after hiding the terminal surface.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TerminalRestoreFocus {
    Navigation,
    Chat,
    Inspection,
    Files,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum CreationState {
    NotRequested,
    Requested,
    Failed,
    Existing(TerminalIdentity),
}

/// Typed requests for the native-controller adapter. Hiding emits no actor/process request;
/// resizing an already-running hidden terminal remains allowed to preserve its geometry.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TerminalSurfaceEffect {
    FocusTerminal,
    RestoreFocus(TerminalRestoreFocus),
    CreateTerminal {
        workspace_generation: WorkspaceGeneration,
        dimensions: TerminalSurfaceDimensions,
    },
    RestartTerminal {
        workspace_generation: WorkspaceGeneration,
        identity: TerminalIdentity,
        dimensions: TerminalSurfaceDimensions,
    },
    ResizeTerminal {
        workspace_generation: WorkspaceGeneration,
        identity: TerminalIdentity,
        dimensions: TerminalSurfaceDimensions,
    },
}

/// Bounded presentation state for one selected terminal surface.
///
/// The selected terminal identity and its snapshot remain controller-owned.  The presentation
/// records only enough identity to suppress duplicate create/restart requests and stale
/// workspace responses.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TerminalSurfacePresentation {
    visible: bool,
    workspace_generation: Option<WorkspaceGeneration>,
    dimensions: Option<TerminalSurfaceDimensions>,
    creation: CreationState,
    terminal_status: TerminalPanelStatus,
    last_non_terminal_focus: Option<TerminalRestoreFocus>,
}

impl Default for TerminalSurfacePresentation {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalSurfacePresentation {
    pub fn new() -> Self {
        Self {
            visible: false,
            workspace_generation: None,
            dimensions: None,
            creation: CreationState::NotRequested,
            terminal_status: TerminalPanelStatus::Inactive,
            last_non_terminal_focus: None,
        }
    }

    pub fn visible(&self) -> bool {
        self.visible
    }

    pub fn last_non_terminal_focus(&self) -> Option<TerminalRestoreFocus> {
        self.last_non_terminal_focus
    }

    pub fn terminal_status(&self) -> TerminalPanelStatus {
        self.terminal_status
    }

    pub fn can_retry(&self) -> bool {
        matches!(self.creation, CreationState::Failed)
            || matches!(
                (self.creation, self.terminal_status),
                (CreationState::Existing(_), TerminalPanelStatus::Closed)
            )
    }

    /// Accept the selected workspace generation.  A response for any prior generation is
    /// rejected by [`Self::observe_terminal`], so an old create cannot become visible under a
    /// new workspace.
    pub fn set_workspace_generation(
        &mut self,
        workspace_generation: Option<WorkspaceGeneration>,
    ) -> Option<TerminalSurfaceEffect> {
        if self.workspace_generation == workspace_generation {
            return None;
        }
        self.workspace_generation = workspace_generation;
        self.creation = CreationState::NotRequested;
        self.terminal_status = TerminalPanelStatus::Inactive;
        self.request_create_if_ready()
    }

    /// Store dimensions only after the layout has measured a real terminal content area.  A
    /// first visible surface requests one create exactly once once both a workspace and valid
    /// dimensions exist.  Existing opening/running entries resize even while hidden.
    pub fn set_dimensions(
        &mut self,
        dimensions: Option<TerminalSurfaceDimensions>,
    ) -> Option<TerminalSurfaceEffect> {
        if self.dimensions == dimensions {
            return None;
        }
        self.dimensions = dimensions;
        if let (Some(workspace_generation), Some(dimensions), CreationState::Existing(identity)) =
            (self.workspace_generation, self.dimensions, self.creation)
            && matches!(
                self.terminal_status,
                TerminalPanelStatus::Starting | TerminalPanelStatus::Running
            )
        {
            return Some(TerminalSurfaceEffect::ResizeTerminal {
                workspace_generation,
                identity,
                dimensions,
            });
        }
        self.request_create_if_ready()
    }

    /// Toggle visibility without sending any actor/process operation when hiding.
    pub fn toggle(
        &mut self,
        current_non_terminal_focus: Option<TerminalRestoreFocus>,
    ) -> Vec<TerminalSurfaceEffect> {
        if self.visible {
            self.visible = false;
            return self
                .last_non_terminal_focus
                .map(TerminalSurfaceEffect::RestoreFocus)
                .into_iter()
                .collect();
        }

        if let Some(focus) = current_non_terminal_focus {
            self.last_non_terminal_focus = Some(focus);
        }
        self.visible = true;
        let mut effects = vec![TerminalSurfaceEffect::FocusTerminal];
        if let Some(effect) = self.request_create_if_ready() {
            effects.push(effect);
        }
        effects
    }

    /// Retry only from a recoverable failure.  Restart remains distinct from first creation.
    pub fn retry(&mut self) -> Option<TerminalSurfaceEffect> {
        let workspace_generation = self.workspace_generation?;
        let dimensions = self.dimensions?;
        match self.creation {
            CreationState::Failed => {
                self.creation = CreationState::Requested;
                self.terminal_status = TerminalPanelStatus::Starting;
                Some(TerminalSurfaceEffect::CreateTerminal {
                    workspace_generation,
                    dimensions,
                })
            }
            CreationState::Existing(identity)
                if self.terminal_status == TerminalPanelStatus::Closed =>
            {
                self.terminal_status = TerminalPanelStatus::Starting;
                Some(TerminalSurfaceEffect::RestartTerminal {
                    workspace_generation,
                    identity,
                    dimensions,
                })
            }
            _ => None,
        }
    }

    /// Incorporate a controller snapshot only when it belongs to the currently selected
    /// workspace generation.  This method has no process side effects.
    pub fn observe_terminal(
        &mut self,
        workspace_generation: Option<WorkspaceGeneration>,
        identity: Option<TerminalIdentity>,
        status: TerminalPanelStatus,
    ) -> bool {
        if self.workspace_generation != workspace_generation {
            return false;
        }
        self.terminal_status = status;
        self.creation = match (identity, status) {
            (Some(identity), _) => CreationState::Existing(identity),
            (None, TerminalPanelStatus::Failed) => CreationState::Failed,
            (None, TerminalPanelStatus::Inactive) => self.creation,
            (None, _) => self.creation,
        };
        true
    }

    fn request_create_if_ready(&mut self) -> Option<TerminalSurfaceEffect> {
        if !self.visible || !matches!(self.creation, CreationState::NotRequested) {
            return None;
        }
        let workspace_generation = self.workspace_generation?;
        let dimensions = self.dimensions?;
        self.creation = CreationState::Requested;
        self.terminal_status = TerminalPanelStatus::Starting;
        Some(TerminalSurfaceEffect::CreateTerminal {
            workspace_generation,
            dimensions,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generation() -> WorkspaceGeneration {
        WorkspaceGeneration::new()
    }

    fn dimensions() -> TerminalSurfaceDimensions {
        TerminalSurfaceDimensions::new(100, 30, 800, 600).expect("valid dimensions")
    }

    #[test]
    fn first_reveal_waits_for_dimensions_then_requests_one_terminal() {
        let workspace_generation = generation();
        let mut surface = TerminalSurfacePresentation::new();
        surface.set_workspace_generation(Some(workspace_generation));

        assert_eq!(
            surface.toggle(Some(TerminalRestoreFocus::Chat)),
            vec![TerminalSurfaceEffect::FocusTerminal]
        );
        assert_eq!(
            surface.set_dimensions(Some(dimensions())),
            Some(TerminalSurfaceEffect::CreateTerminal {
                workspace_generation,
                dimensions: dimensions(),
            })
        );
        assert_eq!(surface.set_dimensions(Some(dimensions())), None);
    }

    #[test]
    fn opening_toggle_race_creates_once_and_hiding_has_no_actor_effect() {
        let workspace_generation = generation();
        let mut surface = TerminalSurfacePresentation::new();
        surface.set_workspace_generation(Some(workspace_generation));
        surface.set_dimensions(Some(dimensions()));

        assert!(matches!(
            surface.toggle(Some(TerminalRestoreFocus::Files)).as_slice(),
            [
                TerminalSurfaceEffect::FocusTerminal,
                TerminalSurfaceEffect::CreateTerminal { .. }
            ]
        ));
        assert_eq!(
            surface.toggle(None),
            vec![TerminalSurfaceEffect::RestoreFocus(
                TerminalRestoreFocus::Files
            )]
        );
        assert_eq!(
            surface.toggle(Some(TerminalRestoreFocus::Chat)),
            vec![TerminalSurfaceEffect::FocusTerminal]
        );
    }

    #[test]
    fn hiding_and_revealing_existing_terminal_preserves_identity_and_resizes_hidden_entry() {
        let workspace_generation = generation();
        let identity = TerminalIdentity {
            terminal_id: crate::terminal::TerminalId::new(),
            generation: crate::terminal::TerminalGeneration::new(),
        };
        let mut surface = TerminalSurfacePresentation::new();
        surface.set_workspace_generation(Some(workspace_generation));
        surface.set_dimensions(Some(dimensions()));
        surface.observe_terminal(
            Some(workspace_generation),
            Some(identity),
            TerminalPanelStatus::Running,
        );
        surface.toggle(Some(TerminalRestoreFocus::Chat));
        surface.toggle(None);

        let resized = TerminalSurfaceDimensions::new(120, 40, 960, 800).expect("valid");
        assert_eq!(
            surface.set_dimensions(Some(resized)),
            Some(TerminalSurfaceEffect::ResizeTerminal {
                workspace_generation,
                identity,
                dimensions: resized,
            })
        );
        assert_eq!(
            surface.toggle(Some(TerminalRestoreFocus::Inspection)),
            vec![TerminalSurfaceEffect::FocusTerminal]
        );
    }

    #[test]
    fn failed_creation_stays_visible_and_retries_only_after_valid_context() {
        let workspace_generation = generation();
        let mut surface = TerminalSurfacePresentation::new();
        surface.set_workspace_generation(Some(workspace_generation));
        surface.set_dimensions(Some(dimensions()));
        surface.toggle(Some(TerminalRestoreFocus::Chat));
        assert!(surface.observe_terminal(
            Some(workspace_generation),
            None,
            TerminalPanelStatus::Failed
        ));
        assert!(surface.visible());
        assert!(surface.can_retry());
        assert_eq!(
            surface.retry(),
            Some(TerminalSurfaceEffect::CreateTerminal {
                workspace_generation,
                dimensions: dimensions(),
            })
        );
    }

    #[test]
    fn stale_workspace_snapshot_cannot_replace_current_terminal_state() {
        let old_generation = generation();
        let current_generation = generation();
        let mut surface = TerminalSurfacePresentation::new();
        surface.set_workspace_generation(Some(current_generation));
        assert!(!surface.observe_terminal(Some(old_generation), None, TerminalPanelStatus::Failed));
        assert_eq!(surface.terminal_status(), TerminalPanelStatus::Inactive);
    }
}
