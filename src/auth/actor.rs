use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::sync::Mutex;

use crate::app::instance_lock::InstanceGuard;

use super::keychain::CredentialStore;
use super::{AuthError, AuthenticationState, CredentialBundle, SecretText};

pub trait Clock: Send + Sync {
    fn unix_seconds(&self) -> u64;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn unix_seconds(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0)
    }
}

pub struct RefreshedCredential {
    pub access_token: SecretText,
    pub refresh_token: SecretText,
    pub expires_at_unix_seconds: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RefreshError {
    Transient,
    InvalidGrant,
    Malformed,
}

pub trait TokenRefresher: Send + Sync {
    fn refresh<'a>(
        &'a self,
        refresh_token: &'a SecretText,
    ) -> Pin<Box<dyn Future<Output = Result<RefreshedCredential, RefreshError>> + Send + 'a>>;
}

#[derive(Clone)]
pub struct CredentialLease {
    pub(crate) access_token: SecretText,
    pub(crate) account_id: SecretText,
    pub expires_at_unix_seconds: u64,
    pub profile_revision: u32,
}

impl std::fmt::Debug for CredentialLease {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("CredentialLease")
            .field("access_token", &"[REDACTED]")
            .field("account_id", &"[REDACTED]")
            .field("expires_at_unix_seconds", &self.expires_at_unix_seconds)
            .field("profile_revision", &self.profile_revision)
            .finish()
    }
}

struct ActorState {
    status: AuthenticationState,
    credential: Option<CredentialBundle>,
}

pub struct AuthenticationActor {
    state: Mutex<ActorState>,
    store: Arc<dyn CredentialStore>,
    refresher: Arc<dyn TokenRefresher>,
    clock: Arc<dyn Clock>,
    refresh_skew_seconds: u64,
}

impl AuthenticationActor {
    pub fn new(
        _process_guard: &InstanceGuard,
        store: Arc<dyn CredentialStore>,
        refresher: Arc<dyn TokenRefresher>,
        clock: Arc<dyn Clock>,
        refresh_skew_seconds: u64,
    ) -> Result<Self, AuthError> {
        let credential = store.load()?;
        let status = if credential.is_some() {
            AuthenticationState::SignedIn
        } else {
            AuthenticationState::SignedOut
        };
        Ok(Self {
            state: Mutex::new(ActorState { status, credential }),
            store,
            refresher,
            clock,
            refresh_skew_seconds,
        })
    }

    pub async fn status(&self) -> AuthenticationState {
        self.state.lock().await.status
    }

    pub async fn install(&self, credential: CredentialBundle) -> Result<(), AuthError> {
        let mut state = self.state.lock().await;
        self.store.replace(&credential)?;
        state.credential = Some(credential);
        state.status = AuthenticationState::SignedIn;
        Ok(())
    }

    pub async fn lease(&self) -> Result<CredentialLease, AuthError> {
        self.lease_inner(false).await
    }

    pub async fn refresh_after_rejection(&self) -> Result<CredentialLease, AuthError> {
        self.lease_inner(true).await
    }

    async fn lease_inner(&self, force_refresh: bool) -> Result<CredentialLease, AuthError> {
        let mut state = self.state.lock().await;
        let now = self.clock.unix_seconds();
        let credential = state
            .credential
            .as_ref()
            .ok_or(AuthError::CredentialsMissing)?;
        if !force_refresh
            && credential.expires_at_unix_seconds > now.saturating_add(self.refresh_skew_seconds)
        {
            return Ok(lease_from(credential));
        }

        state.status = AuthenticationState::Refreshing;
        let prior = state
            .credential
            .clone()
            .ok_or(AuthError::CredentialsMissing)?;
        match self.refresher.refresh(&prior.refresh_token).await {
            Ok(refreshed) => {
                let replacement = CredentialBundle::new(
                    refreshed.access_token.expose().to_owned(),
                    refreshed.refresh_token.expose().to_owned(),
                    refreshed.expires_at_unix_seconds,
                    prior.account_id.expose().to_owned(),
                    prior.profile_revision,
                )?;
                if self.store.replace(&replacement).is_err() {
                    state.credential = None;
                    state.status = AuthenticationState::ReauthenticationRequired;
                    let _ = self.store.delete();
                    return Err(AuthError::CredentialStore);
                }
                let lease = lease_from(&replacement);
                state.credential = Some(replacement);
                state.status = AuthenticationState::SignedIn;
                Ok(lease)
            }
            Err(RefreshError::Transient) => {
                state.status = AuthenticationState::TemporarilyUnavailable;
                Err(AuthError::RefreshTransient)
            }
            Err(RefreshError::InvalidGrant | RefreshError::Malformed) => {
                state.credential = None;
                state.status = AuthenticationState::ReauthenticationRequired;
                let _ = self.store.delete();
                Err(AuthError::ReauthenticationRequired)
            }
        }
    }

    pub async fn logout(&self) -> Result<(), AuthError> {
        let mut state = self.state.lock().await;
        state.credential = None;
        state.status = AuthenticationState::SignedOut;
        self.store.delete()
    }
}

fn lease_from(credential: &CredentialBundle) -> CredentialLease {
    CredentialLease {
        access_token: credential.access_token.clone(),
        account_id: credential.account_id.clone(),
        expires_at_unix_seconds: credential.expires_at_unix_seconds,
        profile_revision: credential.profile_revision,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use tempfile::tempdir;

    use crate::app::instance_lock::InstanceGuard;
    use crate::auth::keychain::MemoryCredentialStore;

    use super::*;

    struct FixedClock(u64);
    impl Clock for FixedClock {
        fn unix_seconds(&self) -> u64 {
            self.0
        }
    }

    struct FakeRefresher {
        calls: AtomicUsize,
        result: RefreshError,
    }

    impl TokenRefresher for FakeRefresher {
        fn refresh<'a>(
            &'a self,
            _: &'a SecretText,
        ) -> Pin<Box<dyn Future<Output = Result<RefreshedCredential, RefreshError>> + Send + 'a>>
        {
            self.calls.fetch_add(1, Ordering::SeqCst);
            let result = self.result;
            Box::pin(async move {
                if result == RefreshError::Malformed {
                    Ok(RefreshedCredential {
                        access_token: SecretText::new("new-access".into()),
                        refresh_token: SecretText::new("new-refresh".into()),
                        expires_at_unix_seconds: 200,
                    })
                } else {
                    Err(result)
                }
            })
        }
    }

    fn guard(directory: &tempfile::TempDir) -> InstanceGuard {
        InstanceGuard::acquire(&directory.path().join("instance.lock")).unwrap()
    }

    #[tokio::test]
    async fn concurrent_expired_leases_share_one_refresh() {
        let directory = tempdir().unwrap();
        let guard = guard(&directory);
        let store = Arc::new(MemoryCredentialStore::empty());
        store
            .replace(
                &CredentialBundle::new(
                    "old-access".into(),
                    "old-refresh".into(),
                    50,
                    "account".into(),
                    1,
                )
                .unwrap(),
            )
            .unwrap();
        let refresher = Arc::new(FakeRefresher {
            calls: AtomicUsize::new(0),
            result: RefreshError::Malformed,
        });
        let actor = Arc::new(
            AuthenticationActor::new(
                &guard,
                store,
                refresher.clone(),
                Arc::new(FixedClock(100)),
                10,
            )
            .unwrap(),
        );
        let (first, second) = tokio::join!(actor.lease(), actor.lease());
        assert!(first.is_ok() && second.is_ok());
        assert_eq!(refresher.calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn transient_failure_retains_record_but_leases_no_expired_token() {
        let directory = tempdir().unwrap();
        let guard = guard(&directory);
        let store = Arc::new(MemoryCredentialStore::empty());
        store
            .replace(
                &CredentialBundle::new(
                    "old-access".into(),
                    "old-refresh".into(),
                    50,
                    "account".into(),
                    1,
                )
                .unwrap(),
            )
            .unwrap();
        let actor = AuthenticationActor::new(
            &guard,
            store.clone(),
            Arc::new(FakeRefresher {
                calls: AtomicUsize::new(0),
                result: RefreshError::Transient,
            }),
            Arc::new(FixedClock(100)),
            10,
        )
        .unwrap();
        assert!(actor.lease().await.is_err());
        assert_eq!(
            actor.status().await,
            AuthenticationState::TemporarilyUnavailable
        );
        assert!(store.load().unwrap().is_some());
    }

    #[tokio::test]
    async fn invalid_grant_quarantines_and_deletes() {
        let directory = tempdir().unwrap();
        let guard = guard(&directory);
        let store = Arc::new(MemoryCredentialStore::empty());
        store
            .replace(
                &CredentialBundle::new(
                    "old-access".into(),
                    "old-refresh".into(),
                    50,
                    "account".into(),
                    1,
                )
                .unwrap(),
            )
            .unwrap();
        let actor = AuthenticationActor::new(
            &guard,
            store.clone(),
            Arc::new(FakeRefresher {
                calls: AtomicUsize::new(0),
                result: RefreshError::InvalidGrant,
            }),
            Arc::new(FixedClock(100)),
            10,
        )
        .unwrap();
        assert!(actor.lease().await.is_err());
        assert_eq!(
            actor.status().await,
            AuthenticationState::ReauthenticationRequired
        );
        assert!(store.load().unwrap().is_none());
    }

    #[tokio::test]
    async fn terminal_pre_stream_rejection_forces_one_refresh() {
        let directory = tempdir().unwrap();
        let guard = guard(&directory);
        let store = Arc::new(MemoryCredentialStore::empty());
        store
            .replace(
                &CredentialBundle::new(
                    "old-access".into(),
                    "old-refresh".into(),
                    500,
                    "account".into(),
                    1,
                )
                .unwrap(),
            )
            .unwrap();
        let refresher = Arc::new(FakeRefresher {
            calls: AtomicUsize::new(0),
            result: RefreshError::Malformed,
        });
        let actor = AuthenticationActor::new(
            &guard,
            store,
            refresher.clone(),
            Arc::new(FixedClock(100)),
            10,
        )
        .unwrap();
        actor.lease().await.unwrap();
        assert_eq!(refresher.calls.load(Ordering::SeqCst), 0);
        actor.refresh_after_rejection().await.unwrap();
        assert_eq!(refresher.calls.load(Ordering::SeqCst), 1);
    }
}
