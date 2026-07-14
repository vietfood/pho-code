use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::header::{ACCEPT, AUTHORIZATION, HeaderValue, USER_AGENT};
use serde::Deserialize;
use sha2::{Digest as _, Sha256};
use tokio::sync::Mutex;

use crate::app::instance_lock::InstanceGuard;
use crate::backend::profile::{MODEL, MODELS_ENDPOINT, PROFILE_REVISION};

use super::keychain::CredentialStore;
use super::{AuthError, CredentialRecord, CredentialState, SecretText, validate_candidate};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidationResult {
    pub model_set_digest: String,
}

pub trait CredentialValidator: Send + Sync {
    fn validate<'a>(
        &'a self,
        candidate: &'a SecretText,
    ) -> Pin<Box<dyn Future<Output = Result<ValidationResult, AuthError>> + Send + 'a>>;
}

pub struct DeepSeekCredentialValidator {
    client: reqwest::Client,
}

impl DeepSeekCredentialValidator {
    pub fn new() -> Result<Self, AuthError> {
        let client = reqwest::Client::builder()
            .redirect_policy(reqwest::redirect::Policy::none())
            .connect_timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|_| AuthError::ValidationFailed)?;
        Ok(Self { client })
    }
}

#[derive(Deserialize)]
struct ModelsResponse {
    data: Vec<ModelEntry>,
}
#[derive(Deserialize)]
struct ModelEntry {
    id: String,
}

impl CredentialValidator for DeepSeekCredentialValidator {
    fn validate<'a>(
        &'a self,
        candidate: &'a SecretText,
    ) -> Pin<Box<dyn Future<Output = Result<ValidationResult, AuthError>> + Send + 'a>> {
        Box::pin(async move {
            let authorization = HeaderValue::from_str(&format!("Bearer {}", candidate.expose()))
                .map_err(|_| AuthError::CredentialsMalformed)?;
            let response = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                self.client
                    .get(MODELS_ENDPOINT)
                    .header(AUTHORIZATION, authorization)
                    .header(ACCEPT, "application/json")
                    .header(USER_AGENT, "pho-code/0.1")
                    .send(),
            )
            .await
            .map_err(|_| AuthError::ValidationFailed)?
            .map_err(|_| AuthError::ValidationFailed)?;
            match response.status().as_u16() {
                200 => {}
                401 => return Err(AuthError::Invalid),
                _ => return Err(AuthError::ValidationFailed),
            }
            let bytes = response
                .bytes()
                .await
                .map_err(|_| AuthError::ValidationFailed)?;
            validate_models_response(&bytes)
        })
    }
}

fn validate_models_response(bytes: &[u8]) -> Result<ValidationResult, AuthError> {
    if bytes.len() > 256 * 1024 {
        return Err(AuthError::ValidationFailed);
    }
    let models: ModelsResponse =
        serde_json::from_slice(bytes).map_err(|_| AuthError::ValidationFailed)?;
    if models.data.len() > 1024 {
        return Err(AuthError::ValidationFailed);
    }
    if !models.data.iter().any(|entry| entry.id == MODEL) {
        return Err(AuthError::ModelUnavailable);
    }
    let mut ids: Vec<_> = models.data.into_iter().map(|entry| entry.id).collect();
    if ids.iter().any(|id| id.is_empty() || id.len() > 256) {
        return Err(AuthError::ValidationFailed);
    }
    ids.sort();
    let digest = Sha256::digest(ids.join("\n").as_bytes());
    Ok(ValidationResult {
        model_set_digest: format!("{digest:x}"),
    })
}

#[derive(Clone)]
pub struct CredentialLease {
    pub(crate) api_key: SecretText,
    pub profile_revision: u32,
}

impl std::fmt::Debug for CredentialLease {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("CredentialLease")
            .field("api_key", &"[REDACTED]")
            .field("profile_revision", &self.profile_revision)
            .finish()
    }
}

struct ActorState {
    status: CredentialState,
    record: Option<CredentialRecord>,
    leases_allowed: bool,
}

pub struct CredentialActor {
    state: Mutex<ActorState>,
    store: Arc<dyn CredentialStore>,
    validator: Arc<dyn CredentialValidator>,
}

impl CredentialActor {
    pub fn new(
        _guard: &InstanceGuard,
        store: Arc<dyn CredentialStore>,
        validator: Arc<dyn CredentialValidator>,
    ) -> Result<Self, AuthError> {
        let (status, record, leases_allowed) = match store.load() {
            Ok(Some(record))
                if record.profile_revision == PROFILE_REVISION && record.invalidated =>
            {
                (CredentialState::Invalid, Some(record), false)
            }
            Ok(Some(record)) if record.profile_revision == PROFILE_REVISION => {
                (CredentialState::Ready, Some(record), true)
            }
            Ok(Some(_)) | Err(AuthError::CredentialsMalformed) => {
                (CredentialState::Malformed, None, false)
            }
            Ok(None) => (CredentialState::Missing, None, true),
            Err(error) => return Err(error),
        };
        Ok(Self {
            state: Mutex::new(ActorState {
                status,
                record,
                leases_allowed,
            }),
            store,
            validator,
        })
    }

    pub async fn status(&self) -> CredentialState {
        self.state.lock().await.status
    }

    pub async fn install(&self, candidate: SecretText) -> Result<(), AuthError> {
        validate_candidate(candidate.expose())?;
        {
            let mut state = self.state.lock().await;
            state.status = CredentialState::Validating;
        }
        let validation = self.validator.validate(&candidate).await;
        let mut state = self.state.lock().await;
        let validation = match validation {
            Ok(value) => value,
            Err(error) => {
                state.status = if state.record.is_some() {
                    CredentialState::Ready
                } else {
                    map_error_state(&error)
                };
                return Err(error);
            }
        };
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_secs())
            .unwrap_or(0);
        let replacement = CredentialRecord::new(
            candidate.expose().into(),
            PROFILE_REVISION,
            now,
            validation.model_set_digest,
        )?;
        if self.store.replace(&replacement).is_err() {
            state.status = if state.record.is_some() {
                CredentialState::Ready
            } else {
                CredentialState::TemporarilyUnavailable
            };
            return Err(AuthError::CredentialStore);
        }
        state.record = Some(replacement);
        state.status = CredentialState::Ready;
        state.leases_allowed = true;
        Ok(())
    }

    pub async fn lease(&self) -> Result<CredentialLease, AuthError> {
        let state = self.state.lock().await;
        if !state.leases_allowed {
            return Err(AuthError::CredentialsMissing);
        }
        let record = state.record.as_ref().ok_or(AuthError::CredentialsMissing)?;
        Ok(CredentialLease {
            api_key: record.api_key.clone(),
            profile_revision: record.profile_revision,
        })
    }

    pub async fn invalidate(&self) {
        let mut state = self.state.lock().await;
        state.status = CredentialState::Invalid;
        state.leases_allowed = false;
        if let Some(record) = state.record.as_mut() {
            record.invalidated = true;
            if self.store.replace(record).is_err() {
                let _ = self.store.delete();
            }
        }
    }

    pub async fn logout(&self) -> Result<(), AuthError> {
        let mut state = self.state.lock().await;
        state.leases_allowed = false;
        if self.store.delete().is_err() {
            state.status = CredentialState::RemovalFailed;
            return Err(AuthError::CredentialStore);
        }
        state.record = None;
        state.status = CredentialState::Missing;
        Ok(())
    }
}

fn map_error_state(error: &AuthError) -> CredentialState {
    match error {
        AuthError::Invalid => CredentialState::Invalid,
        AuthError::CredentialsMalformed => CredentialState::Malformed,
        _ => CredentialState::TemporarilyUnavailable,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::keychain::MemoryCredentialStore;
    use tempfile::tempdir;

    struct FakeValidator(Result<ValidationResult, AuthError>);
    impl CredentialValidator for FakeValidator {
        fn validate<'a>(
            &'a self,
            _: &'a SecretText,
        ) -> Pin<Box<dyn Future<Output = Result<ValidationResult, AuthError>> + Send + 'a>>
        {
            let result = self.0.clone();
            Box::pin(async move { result })
        }
    }
    fn guard(dir: &tempfile::TempDir) -> InstanceGuard {
        InstanceGuard::acquire(&dir.path().join("lock")).unwrap()
    }

    #[tokio::test]
    async fn invalid_replacement_preserves_prior_record() {
        let dir = tempdir().unwrap();
        let guard = guard(&dir);
        let store = Arc::new(MemoryCredentialStore::empty());
        store
            .replace(&CredentialRecord::new("prior-key".into(), 1, 0, "digest".into()).unwrap())
            .unwrap();
        let actor = CredentialActor::new(
            &guard,
            store,
            Arc::new(FakeValidator(Err(AuthError::Invalid))),
        )
        .unwrap();
        assert_eq!(
            actor.install(SecretText::new("candidate".into())).await,
            Err(AuthError::Invalid)
        );
        assert_eq!(actor.status().await, CredentialState::Ready);
        assert!(actor.lease().await.is_ok());
    }

    #[tokio::test]
    async fn successful_install_and_logout_control_leases() {
        let dir = tempdir().unwrap();
        let guard = guard(&dir);
        let store = Arc::new(MemoryCredentialStore::empty());
        let actor = CredentialActor::new(
            &guard,
            store,
            Arc::new(FakeValidator(Ok(ValidationResult {
                model_set_digest: "digest".into(),
            }))),
        )
        .unwrap();
        actor
            .install(SecretText::new("candidate".into()))
            .await
            .unwrap();
        assert!(actor.lease().await.is_ok());
        actor.logout().await.unwrap();
        assert!(actor.lease().await.is_err());
    }

    #[tokio::test]
    async fn invalidation_survives_actor_restart_without_leasing() {
        let dir = tempdir().unwrap();
        let guard = guard(&dir);
        let store = Arc::new(MemoryCredentialStore::empty());
        store
            .replace(&CredentialRecord::new("key".into(), 1, 0, "digest".into()).unwrap())
            .unwrap();
        let validator = Arc::new(FakeValidator(Err(AuthError::Invalid)));
        let actor = CredentialActor::new(&guard, store.clone(), validator.clone()).unwrap();
        actor.invalidate().await;
        drop(actor);
        let restarted = CredentialActor::new(&guard, store, validator).unwrap();
        assert_eq!(restarted.status().await, CredentialState::Invalid);
        assert!(restarted.lease().await.is_err());
    }

    #[test]
    fn model_list_is_bounded_and_requires_the_qualified_model() {
        assert!(
            validate_models_response(br#"{"data":[{"id":"deepseek-v4-flash"},{"id":"future"}]}"#)
                .is_ok()
        );
        assert_eq!(
            validate_models_response(br#"{"data":[{"id":"other"}]}"#),
            Err(AuthError::ModelUnavailable)
        );
        assert_eq!(
            validate_models_response(b"not-json"),
            Err(AuthError::ValidationFailed)
        );
        assert_eq!(
            validate_models_response(&vec![b'x'; 256 * 1024 + 1]),
            Err(AuthError::ValidationFailed)
        );
    }
}
