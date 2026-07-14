pub mod command;
pub mod renderer;
pub mod terminal;

use std::sync::Arc;

use crate::app::action::Intent;
use crate::app::instance_lock::{InstanceGuard, default_lock_path};
use crate::app::runtime::{ApplicationCoordinator, CoordinatorError, RuntimeConfig};
use crate::auth::SecretText;
use crate::auth::api_key::{CredentialActor, DeepSeekCredentialValidator};
use crate::backend::deepseek::DeepSeekBackend;
use crate::backend::sse::SseLimits;

use command::{Command, PromptSource};
use renderer::Renderer;
use tokio_util::sync::CancellationToken;

pub async fn run(command: Command) -> i32 {
    match command {
        Command::Help => {
            print!("{}", command::HELP);
            return 0;
        }
        Command::Version => {
            println!("pho {}", env!("CARGO_PKG_VERSION"));
            return 0;
        }
        _ => {}
    }
    match run_operational(command).await {
        Ok(()) => 0,
        Err(CliError::Usage(message)) => {
            eprintln!("pho: {message}");
            2
        }
        Err(CliError::MissingCredential) => {
            eprintln!(
                "pho: no DeepSeek credential is installed; run `pho login` from a controlling terminal"
            );
            3
        }
        Err(CliError::Cancelled) => {
            eprintln!("pho: cancelled");
            130
        }
        Err(CliError::Runtime) => {
            eprintln!("pho: operation failed");
            1
        }
    }
}

async fn run_operational(command: Command) -> Result<(), CliError> {
    let guard = InstanceGuard::acquire(&default_lock_path().map_err(|_| CliError::Runtime)?)
        .map_err(|_| CliError::Runtime)?;
    #[cfg(target_os = "macos")]
    let store: Arc<dyn crate::auth::keychain::CredentialStore> = {
        let development = cfg!(debug_assertions)
            .then(|| std::env::var("PHO_CODE_TEST_KEYCHAIN_SUFFIX").ok())
            .flatten();
        match development {
            Some(suffix) => Arc::new(
                crate::auth::keychain::MacKeychainStore::development(&suffix)
                    .map_err(|_| CliError::Runtime)?,
            ),
            None => Arc::new(crate::auth::keychain::MacKeychainStore::production()),
        }
    };
    #[cfg(not(target_os = "macos"))]
    let store = Arc::new(crate::auth::keychain::MemoryCredentialStore::empty());
    let validator = Arc::new(DeepSeekCredentialValidator::new().map_err(|_| CliError::Runtime)?);
    let credentials =
        Arc::new(CredentialActor::new(&guard, store, validator).map_err(|_| CliError::Runtime)?);
    let backend = Arc::new(
        DeepSeekBackend::new(credentials.clone(), SseLimits::default())
            .map_err(|_| CliError::Runtime)?,
    );
    let config = Arc::new(RuntimeConfig::default());
    let mut application = ApplicationCoordinator::new(credentials, backend, config).await;
    let mut renderer = Renderer::stdio();
    let cancellation = CancellationToken::new();
    let signal_cancellation = cancellation.clone();
    let signal_task = tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            signal_cancellation.cancel();
        }
    });

    let intent = match command {
        Command::Login => {
            let value = terminal::read_secret("DeepSeek API key: ", 4096)
                .map_err(|_| CliError::Usage("a controlling terminal is required for login"))?;
            Intent::InstallCredential {
                candidate: SecretText::new(value),
            }
        }
        Command::Status => Intent::InspectCredentialStatus,
        Command::Logout => Intent::RemoveCredential,
        Command::Chat { source } => {
            if application.state.credentials != crate::auth::CredentialState::Ready {
                return Err(CliError::MissingCredential);
            }
            let text = match source {
                PromptSource::ControllingTerminal => terminal::read_prompt(256 * 1024).map_err(|_| CliError::Usage("a controlling terminal is required; use `pho chat --stdin` for explicit stdin input"))?,
                PromptSource::Stdin => terminal::read_stdin_prompt(256 * 1024).map_err(|_| CliError::Usage("stdin prompt is empty, invalid UTF-8, or too large"))?,
            };
            Intent::SendEphemeralPrompt { text }
        }
        Command::Help | Command::Version => return Ok(()),
    };
    let render_cancellation = cancellation.clone();
    let mut renderer_failed = false;
    let result = application
        .dispatch_cancellable(intent, cancellation, |event| {
            if renderer.render(&event).is_err() {
                renderer_failed = true;
                render_cancellation.cancel();
            }
        })
        .await;
    signal_task.abort();
    if renderer_failed {
        return Err(CliError::Cancelled);
    }
    result.map_err(|error| match error {
        CoordinatorError::Cancelled => CliError::Cancelled,
        CoordinatorError::Rejected
            if application.state.credentials != crate::auth::CredentialState::Ready =>
        {
            CliError::MissingCredential
        }
        _ => CliError::Runtime,
    })?;
    renderer.finish().map_err(|_| CliError::Cancelled)
}

#[derive(Debug)]
enum CliError {
    Usage(&'static str),
    MissingCredential,
    Cancelled,
    Runtime,
}
