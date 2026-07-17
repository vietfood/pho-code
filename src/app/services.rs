use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::auth::api_key::{CredentialActor, CredentialValidator, DeepSeekCredentialValidator};
use crate::auth::keychain::CredentialStore;
use crate::backend::ModelBackend;
use crate::backend::deepseek::DeepSeekBackend;
use crate::backend::sse::SseLimits;
use crate::session::OpenedSession;
use crate::session::journal::SessionEffectRecorder;
use crate::tools::{ApprovalPolicy, ToolRuntime};

use super::instance_lock::InstanceGuard;
use super::runtime::{ApplicationCoordinator, CoordinatorError, RuntimeConfig};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApplicationPaths {
    root: PathBuf,
}

impl ApplicationPaths {
    pub fn from_home() -> Result<Self, ServiceFactoryError> {
        let home = std::env::var_os("HOME").ok_or(ServiceFactoryError::ApplicationRoot)?;
        Self::for_home_path(Path::new(&home))
    }

    fn for_home_path(home: &Path) -> Result<Self, ServiceFactoryError> {
        if !home.is_absolute() {
            return Err(ServiceFactoryError::ApplicationRoot);
        }
        Self::for_root(home.join("Library/Application Support/Pho Code"))
    }

    pub fn for_root(root: impl AsRef<Path>) -> Result<Self, ServiceFactoryError> {
        let root = root.as_ref();
        if !root.is_absolute() {
            return Err(ServiceFactoryError::ApplicationRoot);
        }
        Ok(Self {
            root: root.to_path_buf(),
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn lock_path(&self) -> PathBuf {
        self.root.join("instance.lock")
    }

    pub fn workbench_preferences_path(&self) -> PathBuf {
        self.root.join("preferences/workbench-v1.json")
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BackendSelection {
    Production,
    #[cfg(debug_assertions)]
    LoopbackFixture(String),
}

pub struct ApplicationServicesFactory {
    paths: ApplicationPaths,
    store: Arc<dyn CredentialStore>,
    validator: Arc<dyn CredentialValidator>,
    backend: BackendSelection,
    config: Arc<RuntimeConfig>,
}

impl ApplicationServicesFactory {
    pub fn production(paths: ApplicationPaths) -> Result<Self, ServiceFactoryError> {
        Ok(Self::with_components(
            paths,
            production_credential_store()?,
            Arc::new(
                DeepSeekCredentialValidator::new()
                    .map_err(|_| ServiceFactoryError::CredentialValidator)?,
            ),
            BackendSelection::Production,
            Arc::new(RuntimeConfig::default()),
        ))
    }

    pub fn with_components(
        paths: ApplicationPaths,
        store: Arc<dyn CredentialStore>,
        validator: Arc<dyn CredentialValidator>,
        backend: BackendSelection,
        config: Arc<RuntimeConfig>,
    ) -> Self {
        Self {
            paths,
            store,
            validator,
            backend,
            config,
        }
    }

    pub fn open(self) -> Result<HeadlessApplicationServices, ServiceFactoryError> {
        self.acquire()?.open_local()?.activate()
    }

    pub fn acquire(self) -> Result<LockedApplicationServicesFactory, ServiceFactoryError> {
        let guard = InstanceGuard::acquire(&self.paths.lock_path())
            .map_err(|_| ServiceFactoryError::LockUnavailable)?;
        Ok(LockedApplicationServicesFactory {
            paths: self.paths,
            store: self.store,
            validator: self.validator,
            backend: self.backend,
            config: self.config,
            guard,
        })
    }
}

pub struct LockedApplicationServicesFactory {
    paths: ApplicationPaths,
    store: Arc<dyn CredentialStore>,
    validator: Arc<dyn CredentialValidator>,
    backend: BackendSelection,
    config: Arc<RuntimeConfig>,
    guard: InstanceGuard,
}

impl LockedApplicationServicesFactory {
    pub fn paths(&self) -> &ApplicationPaths {
        &self.paths
    }

    pub fn open_local(self) -> Result<GuardedLocalApplicationServices, ServiceFactoryError> {
        let sessions = Arc::new(
            crate::session::SessionManager::new(self.paths.root())
                .map_err(|_| ServiceFactoryError::Sessions)?,
        );
        Ok(GuardedLocalApplicationServices {
            paths: self.paths,
            sessions,
            store: self.store,
            validator: self.validator,
            backend: self.backend,
            config: self.config,
            guard: self.guard,
        })
    }
}

pub struct GuardedLocalApplicationServices {
    paths: ApplicationPaths,
    sessions: Arc<crate::session::SessionManager>,
    store: Arc<dyn CredentialStore>,
    validator: Arc<dyn CredentialValidator>,
    backend: BackendSelection,
    config: Arc<RuntimeConfig>,
    guard: InstanceGuard,
}

impl GuardedLocalApplicationServices {
    pub fn paths(&self) -> &ApplicationPaths {
        &self.paths
    }

    pub fn sessions(&self) -> Arc<crate::session::SessionManager> {
        self.sessions.clone()
    }

    pub fn activate(self) -> Result<HeadlessApplicationServices, ServiceFactoryError> {
        let credentials = Arc::new(
            CredentialActor::new(&self.guard, self.store, self.validator)
                .map_err(|_| ServiceFactoryError::Credentials)?,
        );
        let backend: Arc<dyn ModelBackend> = match self.backend {
            BackendSelection::Production => Arc::new(
                DeepSeekBackend::new(credentials.clone(), SseLimits::default())
                    .map_err(|_| ServiceFactoryError::Backend)?,
            ),
            #[cfg(debug_assertions)]
            BackendSelection::LoopbackFixture(endpoint) => Arc::new(
                DeepSeekBackend::new_loopback_fixture(SseLimits::default(), &endpoint)
                    .map_err(|_| ServiceFactoryError::Backend)?,
            ),
        };
        Ok(HeadlessApplicationServices {
            paths: self.paths,
            sessions: self.sessions,
            credentials,
            backend,
            config: self.config,
            // The guard is intentionally declared last in the service owner so every actor and
            // writable store is dropped before the process-wide lock is released.
            guard: self.guard,
        })
    }
}

pub struct HeadlessApplicationServices {
    paths: ApplicationPaths,
    sessions: Arc<crate::session::SessionManager>,
    credentials: Arc<CredentialActor>,
    backend: Arc<dyn ModelBackend>,
    config: Arc<RuntimeConfig>,
    guard: InstanceGuard,
}

impl HeadlessApplicationServices {
    pub fn paths(&self) -> &ApplicationPaths {
        &self.paths
    }

    pub fn sessions(&self) -> Arc<crate::session::SessionManager> {
        self.sessions.clone()
    }

    pub fn credentials(&self) -> Arc<CredentialActor> {
        self.credentials.clone()
    }

    pub fn backend(&self) -> Arc<dyn ModelBackend> {
        self.backend.clone()
    }

    pub fn config(&self) -> Arc<RuntimeConfig> {
        self.config.clone()
    }

    pub fn guard_is_held(&self) -> bool {
        let _ = &self.guard;
        true
    }

    pub async fn coordinator(
        &self,
        tools: Arc<dyn ToolRuntime>,
        approvals: Arc<dyn ApprovalPolicy>,
    ) -> ApplicationCoordinator {
        ApplicationCoordinator::new_with_services(
            self.credentials(),
            self.backend(),
            tools,
            approvals,
            self.config(),
        )
        .await
    }

    pub async fn durable_coordinator(
        &self,
        tools: Arc<dyn ToolRuntime>,
        approvals: Arc<dyn ApprovalPolicy>,
        opened: OpenedSession,
        effects: Option<Arc<SessionEffectRecorder>>,
    ) -> Result<ApplicationCoordinator, CoordinatorError> {
        ApplicationCoordinator::new_with_durable_session(
            self.credentials(),
            self.backend(),
            tools,
            approvals,
            self.config(),
            opened,
            effects,
        )
        .await
    }
}

#[cfg(target_os = "macos")]
fn production_credential_store() -> Result<Arc<dyn CredentialStore>, ServiceFactoryError> {
    Ok(Arc::new(
        crate::auth::keychain::MacKeychainStore::production(),
    ))
}

#[cfg(not(target_os = "macos"))]
fn production_credential_store() -> Result<Arc<dyn CredentialStore>, ServiceFactoryError> {
    Err(ServiceFactoryError::UnsupportedPlatform)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum ServiceFactoryError {
    #[error("application support root is unavailable")]
    ApplicationRoot,
    #[error("another Pho Code process owns the application state")]
    LockUnavailable,
    #[error("session services are unavailable")]
    Sessions,
    #[error("credential services are unavailable")]
    Credentials,
    #[error("credential validator initialization failed")]
    CredentialValidator,
    #[error("backend initialization failed")]
    Backend,
    #[error("the native application is supported only on macOS")]
    UnsupportedPlatform,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::future::Future;
    use std::pin::Pin;

    use crate::auth::api_key::ValidationResult;
    use crate::auth::keychain::MemoryCredentialStore;
    use crate::auth::{AuthError, SecretText};

    struct AcceptingValidator;

    impl CredentialValidator for AcceptingValidator {
        fn validate<'a>(
            &'a self,
            _: &'a SecretText,
        ) -> Pin<Box<dyn Future<Output = Result<ValidationResult, AuthError>> + Send + 'a>>
        {
            Box::pin(async {
                Ok(ValidationResult {
                    model_set_digest: "fixture-model-set".into(),
                })
            })
        }
    }

    #[test]
    fn paths_are_fixed_below_an_absolute_application_root() {
        let directory = tempfile::tempdir().unwrap();
        let paths = ApplicationPaths::for_root(directory.path()).unwrap();
        assert_eq!(paths.lock_path(), directory.path().join("instance.lock"));
        assert_eq!(
            paths.workbench_preferences_path(),
            directory.path().join("preferences/workbench-v1.json")
        );
        assert!(ApplicationPaths::for_root("relative").is_err());
        assert!(ApplicationPaths::for_home_path(Path::new("relative")).is_err());
    }

    #[test]
    fn factory_acquires_the_guard_before_constructing_shared_services() {
        let directory = tempfile::tempdir().unwrap();
        let paths = ApplicationPaths::for_root(directory.path()).unwrap();
        let factory = ApplicationServicesFactory::with_components(
            paths.clone(),
            Arc::new(MemoryCredentialStore::empty()),
            Arc::new(AcceptingValidator),
            BackendSelection::Production,
            Arc::new(RuntimeConfig::default()),
        );
        let services = factory.open().unwrap();
        assert!(services.guard_is_held());
        assert!(InstanceGuard::acquire(&paths.lock_path()).is_err());
        drop(services);
        assert!(InstanceGuard::acquire(&paths.lock_path()).is_ok());
    }
}
