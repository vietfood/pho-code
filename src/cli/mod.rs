pub mod command;
pub mod renderer;
pub mod terminal;
pub mod tui;

use std::sync::Arc;

use crate::app::action::Intent;
use crate::app::instance_lock::{InstanceGuard, default_lock_path};
use crate::app::runtime::{ApplicationCoordinator, CoordinatorError, RuntimeConfig};
use crate::auth::SecretText;
use crate::auth::api_key::{CredentialActor, DeepSeekCredentialValidator};
use crate::backend::deepseek::DeepSeekBackend;
use crate::backend::sse::SseLimits;
use crate::tools::{
    ApprovalDecision, ApprovalPolicy, ApprovalRequest, ApprovalResponse, Phase3ToolRuntime,
    Phase4ToolRuntime, StaticApprovalPolicy, ToolRuntime,
};

use command::{ChatPresentation, Command, PromptSource};
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
        let memory = cfg!(debug_assertions)
            .then(|| std::env::var("PHO_CODE_TEST_MEMORY_CREDENTIALS").ok())
            .flatten();
        let use_memory = memory.is_some();
        let development = (!use_memory && cfg!(debug_assertions))
            .then(|| std::env::var("PHO_CODE_TEST_KEYCHAIN_SUFFIX").ok())
            .flatten();
        if let Some(state) = memory {
            let store = Arc::new(crate::auth::keychain::MemoryCredentialStore::empty());
            if state == "ready" {
                use crate::auth::keychain::CredentialStore as _;
                store
                    .replace(
                        &crate::auth::CredentialRecord::new(
                            "process-test-key".into(),
                            crate::backend::profile::PROFILE_REVISION,
                            0,
                            "process-test-model-set".into(),
                        )
                        .map_err(|_| CliError::Runtime)?,
                    )
                    .map_err(|_| CliError::Runtime)?;
            } else if state != "missing" {
                return Err(CliError::Runtime);
            }
            store
        } else {
            match development {
                Some(suffix) => Arc::new(
                    crate::auth::keychain::MacKeychainStore::development(&suffix)
                        .map_err(|_| CliError::Runtime)?,
                ),
                None => Arc::new(crate::auth::keychain::MacKeychainStore::production()),
            }
        }
    };
    #[cfg(not(target_os = "macos"))]
    let store = Arc::new(crate::auth::keychain::MemoryCredentialStore::empty());
    let validator = Arc::new(DeepSeekCredentialValidator::new().map_err(|_| CliError::Runtime)?);
    let credentials =
        Arc::new(CredentialActor::new(&guard, store, validator).map_err(|_| CliError::Runtime)?);
    let backend = Arc::new(deepseek_backend(credentials.clone())?);
    let config = Arc::new(RuntimeConfig::default());
    let phase4_workspace = (cfg!(debug_assertions)
        && matches!(
            command,
            Command::Chat {
                presentation: ChatPresentation::Raw,
                ..
            }
        ))
    .then(|| std::env::var_os("PHO_CODE_PHASE4_WORKSPACE"))
    .flatten();
    let (tools, approvals): (Arc<dyn ToolRuntime>, Arc<dyn ApprovalPolicy>) =
        if let Some(workspace) = phase4_workspace {
            (
                Arc::new(
                    Phase4ToolRuntime::new_disposable_in_memory(workspace)
                        .map_err(|_| CliError::Runtime)?,
                ),
                Arc::new(ControllingTerminalApproval),
            )
        } else {
            (
                Arc::new(Phase3ToolRuntime::default()),
                Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
            )
        };
    let mut application =
        ApplicationCoordinator::new_with_services(credentials, backend, tools, approvals, config)
            .await;
    if matches!(
        command,
        Command::Chat {
            presentation: ChatPresentation::Interactive,
            ..
        }
    ) {
        if application.state.credentials != crate::auth::CredentialState::Ready {
            return Err(CliError::MissingCredential);
        }
        return tui::run(application).await.map_err(|error| match error {
            tui::TuiError::TerminalUnavailable => CliError::Usage(
                "an interactive controlling terminal of at least 40x8 is required; use `pho chat --stdin` for explicit stdin input",
            ),
            tui::TuiError::MissingCredential => CliError::MissingCredential,
            tui::TuiError::Cancelled => CliError::Cancelled,
            tui::TuiError::Runtime => CliError::Runtime,
        });
    }
    let mut renderer = Renderer::stdio().map_err(|_| CliError::Runtime)?;
    let cancellation = CancellationToken::new();
    let signal_cancellation = cancellation.clone();
    #[cfg(unix)]
    let signal_task = {
        let mut interrupts =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())
                .map_err(|_| CliError::Runtime)?;
        tokio::spawn(async move {
            if interrupts.recv().await.is_some() {
                signal_cancellation.cancel();
            }
        })
    };
    #[cfg(not(unix))]
    let signal_task = tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            signal_cancellation.cancel();
        }
    });
    if cfg!(debug_assertions) && std::env::var_os("PHO_CODE_TEST_INPUT_READY").is_some() {
        eprintln!("pho-test-input-ready");
    }

    let intent = match command {
        Command::Login => {
            let value = terminal::read_secret("DeepSeek API key: ", 4096, &cancellation).map_err(
                |error| input_error(error, "a controlling terminal is required for login"),
            )?;
            Intent::InstallCredential {
                candidate: SecretText::new(value),
            }
        }
        Command::Status => Intent::InspectCredentialStatus,
        Command::Logout => Intent::RemoveCredential,
        Command::Chat {
            source,
            presentation: ChatPresentation::Raw,
        } => {
            if application.state.credentials != crate::auth::CredentialState::Ready {
                return Err(CliError::MissingCredential);
            }
            let text = match source {
                PromptSource::ControllingTerminal => terminal::read_prompt(256 * 1024, &cancellation).map_err(|error| input_error(error, "a controlling terminal is required; use `pho chat --stdin` for explicit stdin input"))?,
                PromptSource::Stdin => terminal::read_stdin_prompt(256 * 1024, &cancellation).map_err(|error| input_error(error, "stdin prompt is empty, invalid UTF-8, or too large"))?,
            };
            Intent::SendEphemeralPrompt { text }
        }
        Command::Chat {
            presentation: ChatPresentation::Interactive,
            ..
        }
        | Command::Help
        | Command::Version => return Ok(()),
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

struct ControllingTerminalApproval;

impl ApprovalPolicy for ControllingTerminalApproval {
    fn decide<'a>(
        &'a self,
        request: &'a ApprovalRequest,
        cancellation: CancellationToken,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ApprovalResponse> + Send + 'a>> {
        Box::pin(async move {
            let summary = request.summary.clone();
            let decision = tokio::task::spawn_blocking(move || {
                terminal::read_approval(&summary, &cancellation)
                    .map(|approved| {
                        if approved {
                            ApprovalDecision::Approved
                        } else {
                            ApprovalDecision::Denied
                        }
                    })
                    .unwrap_or(ApprovalDecision::Unavailable)
            })
            .await
            .unwrap_or(ApprovalDecision::Unavailable);
            ApprovalResponse {
                turn_id: request.turn_id,
                approval_id: request.approval_id,
                tool_call_id: request.tool_call_id,
                effect_digest: request.effect_digest.clone(),
                decision,
            }
        })
    }
}

fn deepseek_backend(credentials: Arc<CredentialActor>) -> Result<DeepSeekBackend, CliError> {
    #[cfg(debug_assertions)]
    if let Some(endpoint) = std::env::var_os("PHO_CODE_TEST_CHAT_ENDPOINT") {
        if std::env::var_os("PHO_CODE_TEST_MEMORY_CREDENTIALS").is_none() {
            return Err(CliError::Runtime);
        }
        let endpoint = endpoint.into_string().map_err(|_| CliError::Runtime)?;
        return DeepSeekBackend::new_loopback_fixture(SseLimits::default(), &endpoint)
            .map_err(|_| CliError::Runtime);
    }
    DeepSeekBackend::new(credentials, SseLimits::default()).map_err(|_| CliError::Runtime)
}

fn input_error(error: std::io::Error, usage: &'static str) -> CliError {
    if error.kind() == std::io::ErrorKind::Interrupted {
        CliError::Cancelled
    } else {
        CliError::Usage(usage)
    }
}

#[derive(Debug)]
enum CliError {
    Usage(&'static str),
    MissingCredential,
    Cancelled,
    Runtime,
}
