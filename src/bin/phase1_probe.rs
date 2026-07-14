#![cfg(target_os = "macos")]

use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use pho_code::agent::types::BackendRequestId;
use pho_code::app::instance_lock::InstanceGuard;
use pho_code::auth::actor::{AuthenticationActor, SystemClock};
use pho_code::auth::keychain::{CredentialStore, MacKeychainStore};
use pho_code::auth::oauth::{
    LoopbackCallback, OAuthHttpClient, PkceMaterial, SystemRandom, parse_authorization_input,
};
use pho_code::backend::chatgpt_codex::ChatGptCodexBackend;
use pho_code::backend::profile::CompatibilityProfile;
use pho_code::backend::sse::SseLimits;
use pho_code::backend::strict_json::parse_strict_object;
use pho_code::backend::{
    BackendInput, BackendRequest, ModelBackend, ModelEvent, OpaqueReplayState, ToolDefinition,
};
use tokio::io::{AsyncBufReadExt as _, BufReader};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;
use zeroize::Zeroize as _;

const SAFE_USAGE: &str =
    "usage: cargo run --bin phase1_probe -- <run|logout> <candidate-profile.json>";

#[tokio::main(flavor = "multi_thread", worker_threads = 2)]
async fn main() {
    if let Err(code) = run().await {
        eprintln!("Phase 1 probe stopped: {code}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), &'static str> {
    let mut arguments = std::env::args_os().skip(1);
    let operation = arguments
        .next()
        .and_then(|value| value.into_string().ok())
        .ok_or(SAFE_USAGE)?;
    let profile_path = arguments.next().map(PathBuf::from).ok_or(SAFE_USAGE)?;
    if arguments.next().is_some() {
        return Err(SAFE_USAGE);
    }
    let profile = load_profile(&profile_path)?;
    let support = application_support()?;
    std::fs::create_dir_all(&support).map_err(|_| "application support is unavailable")?;
    let guard = InstanceGuard::acquire(&support.join("instance.lock"))
        .map_err(|_| "another instance may already own the application state")?;
    let store: Arc<dyn CredentialStore> = Arc::new(MacKeychainStore::production());
    if operation == "logout" {
        store.delete().map_err(|_| "Keychain logout failed")?;
        println!("Phase 1 probe credential removed from the Pho Code Keychain namespace.");
        return Ok(());
    }
    if operation != "run" {
        return Err(SAFE_USAGE);
    }

    let oauth = Arc::new(
        OAuthHttpClient::new(profile.clone()).map_err(|_| "candidate OAuth profile is invalid")?,
    );
    let actor = Arc::new(
        AuthenticationActor::new(
            &guard,
            Arc::clone(&store),
            oauth.clone(),
            Arc::new(SystemClock),
            5 * 60,
        )
        .map_err(|_| "authentication actor initialization failed")?,
    );
    if store.load().map_err(|_| "Keychain read failed")?.is_none() {
        login(&actor, &oauth, &profile).await?;
        println!("Login completed and the versioned credential bundle was committed to Keychain.");
    } else {
        println!("Reused the existing Pho Code Keychain credential bundle.");
    }

    let backend = ChatGptCodexBackend::new(actor, profile.clone(), SseLimits::default())
        .map_err(|_| "backend initialization failed")?;
    let session_key = Uuid::new_v4().to_string();
    run_text_scenario(&backend, &profile, &session_key).await?;
    run_tool_scenario(&backend, &profile, &session_key).await?;
    println!(
        "Probe scenarios completed. No prompt, response, token, account ID, tool arguments, or replay value was printed."
    );
    Ok(())
}

async fn login(
    actor: &AuthenticationActor,
    oauth: &OAuthHttpClient,
    profile: &CompatibilityProfile,
) -> Result<(), &'static str> {
    let pkce = PkceMaterial::generate(&SystemRandom).map_err(|_| "PKCE generation failed")?;
    let callback = LoopbackCallback::bind(profile.redirect_uri.clone())
        .await
        .map_err(|_| "the fixed loopback callback could not bind")?;
    let authorization_url = pkce
        .authorization_url(profile)
        .map_err(|_| "authorization URL construction failed")?;
    println!("Open this one-time URL in your browser:\n{authorization_url}");
    println!(
        "Waiting for the loopback callback. You may instead paste the full redirect URL or exact code and press Return."
    );
    std::io::stdout().flush().map_err(|_| "stdout failed")?;
    let cancellation = CancellationToken::new();
    let callback_future = callback.receive(
        pkce.expected_state(),
        Duration::from_secs(5 * 60),
        cancellation.clone(),
    );
    let mut manual = String::new();
    let mut standard_input = BufReader::new(tokio::io::stdin());
    let manual_future = standard_input.read_line(&mut manual);
    tokio::pin!(callback_future);
    tokio::pin!(manual_future);
    let parsed = tokio::select! {
        result = &mut callback_future => result.map_err(|_| "loopback callback failed")?,
        result = &mut manual_future => {
            result.map_err(|_| "manual input failed")?;
            cancellation.cancel();
            let value = manual.trim();
            let parsed = parse_authorization_input(value, &profile.redirect_uri, pkce.expected_state()).map_err(|_| "manual authorization input was rejected")?;
            if !parsed.state_was_validated { println!("Warning: a bare code cannot prove copied OAuth state."); }
            parsed
        }
    };
    manual.zeroize();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let credential = oauth
        .exchange_code(&parsed.code, &pkce, now)
        .await
        .map_err(|_| "authorization-code exchange failed")?;
    actor
        .install(credential)
        .await
        .map_err(|_| "Keychain commit failed")
}

async fn run_text_scenario(
    backend: &ChatGptCodexBackend,
    profile: &CompatibilityProfile,
    session_key: &str,
) -> Result<(), &'static str> {
    let request = BackendRequest {
        request_id: BackendRequestId::new(),
        session_key: session_key.to_owned(),
        model: profile.model.clone(),
        instructions: "Respond briefly. Do not call tools.".into(),
        input: vec![BackendInput::UserText(
            "Reply with a brief greeting for a transport qualification.".into(),
        )],
        tools: vec![],
    };
    let events = execute(backend, request).await?;
    require_completed(&events)?;
    print_summary("text", &events);
    Ok(())
}

async fn run_tool_scenario(
    backend: &ChatGptCodexBackend,
    profile: &CompatibilityProfile,
    session_key: &str,
) -> Result<(), &'static str> {
    let user_text =
        "Call phase1_echo once with value set to fixture, then wait for its result.".to_owned();
    let tool = ToolDefinition {
        name: "phase1_echo".into(),
        description: "Returns a deterministic in-memory qualification result.".into(),
        schema: serde_json::json!({
            "type": "object",
            "properties": {"value": {"type": "string", "const": "fixture"}},
            "required": ["value"],
            "additionalProperties": false
        }),
    };
    let request = BackendRequest {
        request_id: BackendRequestId::new(),
        session_key: session_key.to_owned(),
        model: profile.model.clone(),
        instructions: "Use only the supplied in-memory qualification tool when asked.".into(),
        input: vec![BackendInput::UserText(user_text.clone())],
        tools: vec![tool.clone()],
    };
    let events = execute(backend, request).await?;
    require_completed(&events)?;
    let (provider_item_id, call_id, name, arguments) = events
        .iter()
        .find_map(|event| {
            if let ModelEvent::ToolCallCompleted {
                provider_item_id,
                call_id,
                name,
                arguments,
                ..
            } = event
            {
                Some((
                    provider_item_id.clone(),
                    call_id.clone(),
                    name.clone(),
                    arguments.clone(),
                ))
            } else {
                None
            }
        })
        .ok_or("the model did not complete the qualification tool call")?;
    if name != "phase1_echo" || arguments.len() > 4096 {
        return Err("the completed tool call did not match the fixed schema");
    }
    let parsed = parse_strict_object(&arguments, 4096, 16)
        .map_err(|_| "the completed tool arguments were invalid strict JSON")?;
    if parsed != serde_json::json!({"value":"fixture"}) {
        return Err("the completed tool arguments failed local validation");
    }

    let mut input = vec![BackendInput::UserText(user_text)];
    for event in &events {
        match event {
            ModelEvent::ReasoningCompleted {
                replay:
                    Some(OpaqueReplayState {
                        provider_item_id,
                        encrypted_content,
                    }),
                ..
            } => input.push(BackendInput::OpaqueReasoning(OpaqueReplayState {
                provider_item_id: provider_item_id.clone(),
                encrypted_content: encrypted_content.clone(),
            })),
            ModelEvent::TextCompleted {
                provider_item_id,
                text,
                ..
            } => input.push(BackendInput::AssistantText {
                provider_item_id: provider_item_id.clone(),
                text: text.clone(),
            }),
            ModelEvent::ToolCallCompleted {
                provider_item_id,
                call_id,
                name,
                arguments,
                ..
            } => input.push(BackendInput::ToolCall {
                provider_item_id: provider_item_id.clone(),
                call_id: call_id.clone(),
                name: name.clone(),
                arguments: arguments.clone(),
            }),
            _ => {}
        }
    }
    input.push(BackendInput::ToolResult {
        call_id,
        output: "qualification-result: fixture".into(),
    });
    let continuation = BackendRequest {
        request_id: BackendRequestId::new(),
        session_key: session_key.to_owned(),
        model: profile.model.clone(),
        instructions: "Use only the supplied in-memory qualification tool when asked.".into(),
        input,
        tools: vec![tool],
    };
    let continuation_events = execute(backend, continuation).await?;
    require_completed(&continuation_events)?;
    print_summary("tool-call", &events);
    print_summary("tool-continuation", &continuation_events);
    let _ = provider_item_id;
    Ok(())
}

async fn execute(
    backend: &ChatGptCodexBackend,
    request: BackendRequest,
) -> Result<Vec<ModelEvent>, &'static str> {
    let (sender, mut receiver) = mpsc::channel(128);
    let future = backend.stream(request, sender, CancellationToken::new());
    tokio::pin!(future);
    let mut collected = Vec::new();
    loop {
        tokio::select! {
            result = &mut future => {
                result.map_err(|_| "backend request failed; inspect redacted diagnostics")?;
                while let Some(event) = receiver.recv().await { collected.push(event); }
                break;
            }
            event = receiver.recv() => {
                if let Some(event) = event { collected.push(event); }
            }
        }
    }
    Ok(collected)
}

fn require_completed(events: &[ModelEvent]) -> Result<(), &'static str> {
    if events
        .iter()
        .any(|event| matches!(event, ModelEvent::ResponseCompleted { .. }))
    {
        Ok(())
    } else {
        Err("scenario did not reach a terminal completed response")
    }
}

fn print_summary(name: &str, events: &[ModelEvent]) {
    let text_bytes: usize = events
        .iter()
        .map(|event| match event {
            ModelEvent::TextCompleted { text, .. } => text.len(),
            _ => 0,
        })
        .sum();
    let reasoning_bytes: usize = events
        .iter()
        .map(|event| match event {
            ModelEvent::ReasoningCompleted { text, .. } => text.len(),
            _ => 0,
        })
        .sum();
    let tool_calls = events
        .iter()
        .filter(|event| matches!(event, ModelEvent::ToolCallCompleted { .. }))
        .count();
    println!(
        "Scenario {name}: events={}, text_bytes={text_bytes}, reasoning_bytes={reasoning_bytes}, completed_tool_calls={tool_calls}",
        events.len()
    );
}

fn load_profile(path: &Path) -> Result<CompatibilityProfile, &'static str> {
    let metadata = std::fs::metadata(path).map_err(|_| "candidate profile is unavailable")?;
    if metadata.len() > 64 * 1024 {
        return Err("candidate profile is oversized");
    }
    let bytes = std::fs::read(path).map_err(|_| "candidate profile could not be read")?;
    let profile: CompatibilityProfile =
        serde_json::from_slice(&bytes).map_err(|_| "candidate profile JSON is invalid")?;
    profile
        .validate_candidate()
        .map_err(|_| "candidate profile failed validation")?;
    Ok(profile)
}

fn application_support() -> Result<PathBuf, &'static str> {
    let home = std::env::var_os("HOME").ok_or("home directory is unavailable")?;
    Ok(PathBuf::from(home).join("Library/Application Support/Pho Code"))
}
