use std::collections::VecDeque;

use crate::agent::types::{TurnId, TurnStatus};
use crate::auth::CredentialState;
use crate::backend::{AssistantPhase, Usage};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StartupState {
    Starting,
    Ready,
    Failed,
}

#[derive(Clone, Debug)]
pub struct ActiveTurn {
    pub id: TurnId,
    pub status: TurnStatus,
    pub streamed_reasoning: String,
    pub streamed_text: String,
    pub completed_phase: Option<AssistantPhase>,
    pub usage: Option<Usage>,
}

#[derive(Clone, Debug)]
pub struct AppState {
    pub startup: StartupState,
    pub credentials: CredentialState,
    pub active_turn: Option<ActiveTurn>,
    pub diagnostics: VecDeque<&'static str>,
    maximum_diagnostics: usize,
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
