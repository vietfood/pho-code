use std::collections::VecDeque;

use crate::agent::types::{ApprovalId, ApprovalStatus, ToolCallId, ToolStatus, TurnId, TurnStatus};
use crate::auth::CredentialState;
use crate::backend::{AssistantPhase, Usage};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StartupState {
    Starting,
    Ready,
    Failed,
}

#[derive(Clone)]
pub struct ActiveTurn {
    pub id: TurnId,
    pub status: TurnStatus,
    pub streamed_reasoning: String,
    pub streamed_text: String,
    pub completed_phases: Vec<AssistantPhase>,
    pub usage: Option<Usage>,
    pub tools: Vec<ToolProjection>,
    pub pending_approval: Option<ApprovalProjection>,
    pub continuations: usize,
}

impl std::fmt::Debug for ActiveTurn {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ActiveTurn")
            .field("id", &self.id)
            .field("status", &self.status)
            .field("streamed_reasoning", &"[REDACTED]")
            .field("streamed_text_bytes", &self.streamed_text.len())
            .field("completed_phases", &self.completed_phases.len())
            .field("usage_present", &self.usage.is_some())
            .field("tools", &self.tools.len())
            .field("pending_approval", &self.pending_approval.is_some())
            .field("continuations", &self.continuations)
            .finish()
    }
}

#[derive(Clone, Debug)]
pub struct ToolProjection {
    pub tool_call_id: ToolCallId,
    pub name: String,
    pub status: ToolStatus,
    pub mutating: bool,
}

#[derive(Clone, Debug)]
pub struct ApprovalProjection {
    pub approval_id: ApprovalId,
    pub tool_call_id: ToolCallId,
    pub effect_digest: String,
    pub status: ApprovalStatus,
}

#[derive(Clone)]
pub struct AppState {
    pub startup: StartupState,
    pub credentials: CredentialState,
    pub active_turn: Option<ActiveTurn>,
    pub diagnostics: VecDeque<&'static str>,
    maximum_diagnostics: usize,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("AppState")
            .field("startup", &self.startup)
            .field("credentials", &self.credentials)
            .field("active_turn", &self.active_turn)
            .field("diagnostics", &self.diagnostics)
            .finish()
    }
}

impl AppState {
    pub fn new(maximum_diagnostics: usize) -> Self {
        Self {
            startup: StartupState::Starting,
            credentials: CredentialState::Missing,
            active_turn: None,
            diagnostics: VecDeque::new(),
            maximum_diagnostics,
        }
    }

    pub(crate) fn diagnose(&mut self, code: &'static str) {
        if self.diagnostics.len() == self.maximum_diagnostics {
            self.diagnostics.pop_front();
        }
        self.diagnostics.push_back(code);
    }
}
