use std::collections::VecDeque;

use crate::auth::CredentialState;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StartupGeneration(u64);

impl StartupGeneration {
    pub fn initial() -> Self {
        Self(1)
    }

    fn next(self) -> Self {
        Self(self.0.saturating_add(1))
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NativeStartupState {
    Booting,
    LockUnavailable,
    LoadingPreferences,
    ScanningSessions,
    InspectingCredentials,
    RestoringSelection,
    ReadyOffline,
    NeedsCredential,
    CredentialUnavailable,
    Ready,
    ShuttingDown,
    Terminated,
    Failed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StartupFailure {
    ApplicationRoot,
    Preferences,
    Sessions,
    Credentials,
    Selection,
    Services,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StartupEvent {
    Begin,
    LockAcquired {
        generation: StartupGeneration,
    },
    LockContended {
        generation: StartupGeneration,
    },
    PreferencesLoaded {
        generation: StartupGeneration,
        recovery_diagnostic: bool,
    },
    SessionsScanned {
        generation: StartupGeneration,
    },
    CredentialsInspected {
        generation: StartupGeneration,
        state: CredentialState,
    },
    SelectionRestored {
        generation: StartupGeneration,
        local_inspection_ready: bool,
        agent_context_ready: bool,
    },
    CredentialChanged {
        generation: StartupGeneration,
        state: CredentialState,
    },
    RetryLock,
    ShutdownRequested,
    ShutdownCompleted {
        generation: StartupGeneration,
    },
    Failed {
        generation: StartupGeneration,
        failure: StartupFailure,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StartupEffect {
    AcquireLock { generation: StartupGeneration },
    LoadPreferences { generation: StartupGeneration },
    ScanSessions { generation: StartupGeneration },
    InspectCredentials { generation: StartupGeneration },
    RestoreSelection { generation: StartupGeneration },
    BeginShutdown { generation: StartupGeneration },
    Quit,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkbenchStartupProjection {
    pub state: NativeStartupState,
    pub generation: StartupGeneration,
    pub credentials: Option<CredentialState>,
    pub local_inspection_ready: bool,
    pub agent_context_ready: bool,
    pub failure: Option<StartupFailure>,
    pub diagnostics: VecDeque<&'static str>,
    maximum_diagnostics: usize,
}

impl WorkbenchStartupProjection {
    pub fn new(maximum_diagnostics: usize) -> Self {
        Self {
            state: NativeStartupState::Booting,
            generation: StartupGeneration::initial(),
            credentials: None,
            local_inspection_ready: false,
            agent_context_ready: false,
            failure: None,
            diagnostics: VecDeque::new(),
            maximum_diagnostics,
        }
    }

    pub fn send_enabled(&self) -> bool {
        self.state == NativeStartupState::Ready
            && self.credentials == Some(CredentialState::Ready)
            && self.agent_context_ready
    }

    fn diagnose(&mut self, code: &'static str) {
        if self.maximum_diagnostics == 0 {
            return;
        }
        if self.diagnostics.len() == self.maximum_diagnostics {
            self.diagnostics.pop_front();
        }
        self.diagnostics.push_back(code);
    }

    fn accepts(&mut self, generation: StartupGeneration) -> bool {
        if self.generation != generation {
            self.diagnose("stale_startup_generation");
            false
        } else {
            true
        }
    }
}

pub fn reduce_startup(
    projection: &mut WorkbenchStartupProjection,
    event: StartupEvent,
) -> Option<StartupEffect> {
    match event {
        StartupEvent::Begin if projection.state == NativeStartupState::Booting => {
            Some(StartupEffect::AcquireLock {
                generation: projection.generation,
            })
        }
        StartupEvent::LockAcquired { generation }
            if projection.accepts(generation)
                && matches!(
                    projection.state,
                    NativeStartupState::Booting | NativeStartupState::LockUnavailable
                ) =>
        {
            projection.state = NativeStartupState::LoadingPreferences;
            Some(StartupEffect::LoadPreferences { generation })
        }
        StartupEvent::LockContended { generation }
            if projection.accepts(generation)
                && matches!(
                    projection.state,
                    NativeStartupState::Booting | NativeStartupState::LockUnavailable
                ) =>
        {
            projection.state = NativeStartupState::LockUnavailable;
            None
        }
        StartupEvent::PreferencesLoaded {
            generation,
            recovery_diagnostic,
        } if projection.accepts(generation)
            && projection.state == NativeStartupState::LoadingPreferences =>
        {
            if recovery_diagnostic {
                projection.diagnose("workbench_preferences_recovered");
            }
            projection.state = NativeStartupState::ScanningSessions;
            Some(StartupEffect::ScanSessions { generation })
        }
        StartupEvent::SessionsScanned { generation }
            if projection.accepts(generation)
                && projection.state == NativeStartupState::ScanningSessions =>
        {
            projection.state = NativeStartupState::InspectingCredentials;
            Some(StartupEffect::InspectCredentials { generation })
        }
        StartupEvent::CredentialsInspected { generation, state }
            if projection.accepts(generation)
                && projection.state == NativeStartupState::InspectingCredentials =>
        {
            projection.credentials = Some(state);
            projection.state = NativeStartupState::RestoringSelection;
            Some(StartupEffect::RestoreSelection { generation })
        }
        StartupEvent::SelectionRestored {
            generation,
            local_inspection_ready,
            agent_context_ready,
        } if projection.accepts(generation)
            && projection.state == NativeStartupState::RestoringSelection =>
        {
            projection.local_inspection_ready = local_inspection_ready;
            projection.agent_context_ready = agent_context_ready;
            projection.state = terminal_ready_state(
                projection.credentials,
                local_inspection_ready,
                agent_context_ready,
            );
            None
        }
        StartupEvent::CredentialChanged { generation, state }
            if projection.accepts(generation)
                && matches!(
                    projection.state,
                    NativeStartupState::ReadyOffline
                        | NativeStartupState::NeedsCredential
                        | NativeStartupState::CredentialUnavailable
                        | NativeStartupState::Ready
                ) =>
        {
            projection.credentials = Some(state);
            projection.state = terminal_ready_state(
                projection.credentials,
                projection.local_inspection_ready,
                projection.agent_context_ready,
            );
            None
        }
        StartupEvent::RetryLock if projection.state == NativeStartupState::LockUnavailable => {
            projection.generation = projection.generation.next();
            Some(StartupEffect::AcquireLock {
                generation: projection.generation,
            })
        }
        StartupEvent::ShutdownRequested
            if !matches!(
                projection.state,
                NativeStartupState::ShuttingDown | NativeStartupState::Terminated
            ) =>
        {
            projection.generation = projection.generation.next();
            projection.state = NativeStartupState::ShuttingDown;
            Some(StartupEffect::BeginShutdown {
                generation: projection.generation,
            })
        }
        StartupEvent::ShutdownCompleted { generation }
            if projection.accepts(generation)
                && projection.state == NativeStartupState::ShuttingDown =>
        {
            projection.state = NativeStartupState::Terminated;
            Some(StartupEffect::Quit)
        }
        StartupEvent::Failed {
            generation,
            failure,
        } if projection.accepts(generation)
            && !matches!(
                projection.state,
                NativeStartupState::ShuttingDown | NativeStartupState::Terminated
            ) =>
        {
            projection.state = NativeStartupState::Failed;
            projection.failure = Some(failure);
            None
        }
        _ => {
            projection.diagnose("invalid_startup_transition");
            None
        }
    }
}

fn terminal_ready_state(
    credentials: Option<CredentialState>,
    local_inspection_ready: bool,
    agent_context_ready: bool,
) -> NativeStartupState {
    match credentials {
        Some(CredentialState::Ready) if agent_context_ready => NativeStartupState::Ready,
        Some(CredentialState::Ready) if local_inspection_ready => NativeStartupState::ReadyOffline,
        Some(CredentialState::Missing | CredentialState::Invalid | CredentialState::Malformed) => {
            NativeStartupState::NeedsCredential
        }
        Some(
            CredentialState::Installing
            | CredentialState::Validating
            | CredentialState::TemporarilyUnavailable
            | CredentialState::RemovalFailed,
        ) => NativeStartupState::CredentialUnavailable,
        _ => NativeStartupState::ReadyOffline,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn advance_to_selection(
        projection: &mut WorkbenchStartupProjection,
        credential: CredentialState,
    ) -> StartupGeneration {
        let generation = projection.generation;
        assert_eq!(
            reduce_startup(projection, StartupEvent::Begin),
            Some(StartupEffect::AcquireLock { generation })
        );
        reduce_startup(projection, StartupEvent::LockAcquired { generation });
        reduce_startup(
            projection,
            StartupEvent::PreferencesLoaded {
                generation,
                recovery_diagnostic: false,
            },
        );
        reduce_startup(projection, StartupEvent::SessionsScanned { generation });
        reduce_startup(
            projection,
            StartupEvent::CredentialsInspected {
                generation,
                state: credential,
            },
        );
        generation
    }

    #[test]
    fn ready_requires_both_credential_and_agent_context() {
        let mut projection = WorkbenchStartupProjection::new(8);
        let generation = advance_to_selection(&mut projection, CredentialState::Ready);
        reduce_startup(
            &mut projection,
            StartupEvent::SelectionRestored {
                generation,
                local_inspection_ready: true,
                agent_context_ready: true,
            },
        );
        assert_eq!(projection.state, NativeStartupState::Ready);
        assert!(projection.send_enabled());
    }

    #[test]
    fn missing_credential_keeps_local_inspection_but_disables_send() {
        let mut projection = WorkbenchStartupProjection::new(8);
        let generation = advance_to_selection(&mut projection, CredentialState::Missing);
        reduce_startup(
            &mut projection,
            StartupEvent::SelectionRestored {
                generation,
                local_inspection_ready: true,
                agent_context_ready: false,
            },
        );
        assert_eq!(projection.state, NativeStartupState::NeedsCredential);
        assert!(projection.local_inspection_ready);
        assert!(!projection.send_enabled());
    }

    #[test]
    fn late_generation_cannot_overwrite_shutdown() {
        let mut projection = WorkbenchStartupProjection::new(8);
        let old = projection.generation;
        reduce_startup(&mut projection, StartupEvent::Begin);
        let effect = reduce_startup(&mut projection, StartupEvent::ShutdownRequested);
        let shutdown = projection.generation;
        assert_eq!(
            effect,
            Some(StartupEffect::BeginShutdown {
                generation: shutdown
            })
        );
        reduce_startup(
            &mut projection,
            StartupEvent::LockAcquired { generation: old },
        );
        assert_eq!(projection.state, NativeStartupState::ShuttingDown);
        assert!(projection.diagnostics.contains(&"stale_startup_generation"));
    }

    #[test]
    fn lock_retry_uses_a_new_generation() {
        let mut projection = WorkbenchStartupProjection::new(8);
        let first = projection.generation;
        reduce_startup(&mut projection, StartupEvent::Begin);
        reduce_startup(
            &mut projection,
            StartupEvent::LockContended { generation: first },
        );
        let effect = reduce_startup(&mut projection, StartupEvent::RetryLock).unwrap();
        assert_ne!(projection.generation, first);
        assert_eq!(
            effect,
            StartupEffect::AcquireLock {
                generation: projection.generation
            }
        );
    }

    #[test]
    fn credential_changes_reproject_ready_states_without_changing_local_ownership() {
        let mut projection = WorkbenchStartupProjection::new(8);
        let generation = advance_to_selection(&mut projection, CredentialState::Missing);
        reduce_startup(
            &mut projection,
            StartupEvent::SelectionRestored {
                generation,
                local_inspection_ready: true,
                agent_context_ready: false,
            },
        );
        reduce_startup(
            &mut projection,
            StartupEvent::CredentialChanged {
                generation,
                state: CredentialState::Validating,
            },
        );
        assert_eq!(projection.state, NativeStartupState::CredentialUnavailable);
        assert!(projection.local_inspection_ready);
        reduce_startup(
            &mut projection,
            StartupEvent::CredentialChanged {
                generation,
                state: CredentialState::Ready,
            },
        );
        assert_eq!(projection.state, NativeStartupState::ReadyOffline);
        assert!(projection.local_inspection_ready);
    }

    #[test]
    fn diagnostics_are_bounded() {
        let mut projection = WorkbenchStartupProjection::new(2);
        reduce_startup(&mut projection, StartupEvent::RetryLock);
        reduce_startup(&mut projection, StartupEvent::RetryLock);
        reduce_startup(&mut projection, StartupEvent::RetryLock);
        assert_eq!(projection.diagnostics.len(), 2);
    }
}
