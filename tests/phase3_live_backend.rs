use std::io::{self, Read as _, Write};
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use pho_code::agent::instructions::AgentInstructionProfile;
use pho_code::agent::loop_runtime::{AgentError, AgentEvent, AgentLimits, run_agent_turn};
use pho_code::agent::types::{ToolStatus, TurnId, TurnStatus};
use pho_code::app::action::{Intent, RuntimeEvent};
use pho_code::app::instance_lock::InstanceGuard;
use pho_code::app::runtime::{ApplicationCoordinator, RuntimeConfig};
use pho_code::auth::api_key::{CredentialActor, CredentialValidator, ValidationResult};
use pho_code::auth::keychain::{CredentialStore, MemoryCredentialStore};
use pho_code::auth::{AuthError, CredentialRecord};
use pho_code::backend::deepseek::DeepSeekBackend;
use pho_code::backend::profile::PROFILE_REVISION;
use pho_code::backend::sse::SseLimits;
use pho_code::cli::renderer::Renderer;
use pho_code::tools::{
    ApprovalDecision, ApprovalPolicy, ApprovalRequest, ApprovalResponse, Phase3ToolRuntime,
    StaticApprovalPolicy,
};
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;

struct UnusedValidator;

static COMMAND_SERIAL: Mutex<()> = Mutex::new(());

impl CredentialValidator for UnusedValidator {
    fn validate<'a>(
        &'a self,
        _: &'a pho_code::auth::SecretText,
    ) -> Pin<Box<dyn std::future::Future<Output = Result<ValidationResult, AuthError>> + Send + 'a>>
    {
        Box::pin(async { Err(AuthError::ValidationFailed) })
    }
}

fn ready_credentials(directory: &tempfile::TempDir) -> Arc<CredentialActor> {
    let guard = Box::leak(Box::new(
        InstanceGuard::acquire(&directory.path().join("instance.lock")).unwrap(),
    ));
    let store = Arc::new(MemoryCredentialStore::empty());
    store
        .replace(
            &CredentialRecord::new(
                "fixture-key".into(),
                PROFILE_REVISION,
                0,
                "fixture-model-set".into(),
            )
            .unwrap(),
        )
        .unwrap();
    Arc::new(CredentialActor::new(guard, store, Arc::new(UnusedValidator)).unwrap())
}

struct HttpResponse {
    status: u16,
    body: String,
}

struct LoopbackChat {
    endpoint: String,
    requests: Arc<Mutex<Vec<serde_json::Value>>>,
    task: tokio::task::JoinHandle<()>,
}

impl LoopbackChat {
    async fn spawn(responses: Vec<HttpResponse>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let captured = requests.clone();
        let task = tokio::spawn(async move {
            for response in responses {
                let (mut stream, _) = listener.accept().await.unwrap();
                let body = read_request_body(&mut stream).await;
                captured
                    .lock()
                    .unwrap()
                    .push(serde_json::from_slice(&body).unwrap());
                let content_type = if response.status == 200 {
                    "text/event-stream"
                } else {
                    "application/json"
                };
                let headers = format!(
                    "HTTP/1.1 {} fixture\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    response.status,
                    content_type,
                    response.body.len()
                );
                stream.write_all(headers.as_bytes()).await.unwrap();
                stream.write_all(response.body.as_bytes()).await.unwrap();
                stream.shutdown().await.unwrap();
            }
        });
        Self {
            endpoint: format!("http://{address}/chat/completions"),
            requests,
            task,
        }
    }

    async fn finish(self) -> Vec<serde_json::Value> {
        self.task.await.unwrap();
        Arc::try_unwrap(self.requests)
            .unwrap()
            .into_inner()
            .unwrap()
    }
}

async fn read_request_body(stream: &mut tokio::net::TcpStream) -> Vec<u8> {
    let mut request = Vec::new();
    let header_end = loop {
        let mut byte = [0_u8; 1];
        stream.read_exact(&mut byte).await.unwrap();
        request.push(byte[0]);
        assert!(request.len() <= 64 * 1024);
        if request.ends_with(b"\r\n\r\n") {
            break request.len();
        }
    };
    let headers = std::str::from_utf8(&request[..header_end]).unwrap();
    let length = headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().unwrap())
        })
        .unwrap();
    let mut body = vec![0; length];
    stream.read_exact(&mut body).await.unwrap();
    body
}

fn read_request_body_sync(stream: &mut std::net::TcpStream) -> Vec<u8> {
    let mut request = Vec::new();
    loop {
        let mut byte = [0_u8; 1];
        stream.read_exact(&mut byte).unwrap();
        request.push(byte[0]);
        assert!(request.len() <= 64 * 1024);
        if request.ends_with(b"\r\n\r\n") {
            break;
        }
    }
    let headers = std::str::from_utf8(&request).unwrap();
    let length = headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().unwrap())
        })
        .unwrap();
    let mut body = vec![0; length];
    stream.read_exact(&mut body).unwrap();
    body
}

fn sse(frames: &[&str]) -> String {
    let mut body = String::new();
    for frame in frames {
        body.push_str("data: ");
        body.push_str(frame);
        body.push_str("\n\n");
    }
    body.push_str("data: [DONE]\n\n");
    body
}

fn agent_limits() -> AgentLimits {
    AgentLimits {
        maximum_context_bytes: 1024 * 1024,
        maximum_context_messages: 64,
        maximum_model_continuations: 4,
        maximum_tool_calls: 8,
        maximum_tool_argument_bytes: 4096,
        maximum_tool_result_bytes: 4096,
        maximum_pending_approvals: 1,
        turn_timeout: std::time::Duration::from_secs(5),
    }
}

async fn hanging_stream(
    frame: String,
) -> (
    String,
    tokio::sync::oneshot::Sender<()>,
    tokio::task::JoinHandle<()>,
) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let (release, released) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        read_request_body(&mut stream).await;
        stream
            .write_all(
                b"HTTP/1.1 200 fixture\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n",
            )
            .await
            .unwrap();
        stream.write_all(frame.as_bytes()).await.unwrap();
        let _ = released.await;
    });
    (format!("http://{address}/chat/completions"), release, task)
}

async fn hanging_continuation(
    first_body: String,
) -> (
    String,
    tokio::sync::oneshot::Receiver<()>,
    tokio::sync::oneshot::Sender<()>,
    tokio::task::JoinHandle<()>,
) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let (accepted, second_accepted) = tokio::sync::oneshot::channel();
    let (release, released) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move {
        let (mut first, _) = listener.accept().await.unwrap();
        read_request_body(&mut first).await;
        let headers = format!(
            "HTTP/1.1 200 fixture\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            first_body.len()
        );
        first.write_all(headers.as_bytes()).await.unwrap();
        first.write_all(first_body.as_bytes()).await.unwrap();
        first.shutdown().await.unwrap();

        let (mut second, _) = listener.accept().await.unwrap();
        read_request_body(&mut second).await;
        second
            .write_all(
                b"HTTP/1.1 200 fixture\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n",
            )
            .await
            .unwrap();
        let _ = accepted.send(());
        let _ = released.await;
    });
    (
        format!("http://{address}/chat/completions"),
        second_accepted,
        release,
        task,
    )
}

#[derive(Clone, Default)]
struct SharedWriter(Arc<Mutex<Vec<u8>>>);

impl SharedWriter {
    fn text(&self) -> String {
        String::from_utf8(self.0.lock().unwrap().clone()).unwrap()
    }
}

impl Write for SharedWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

struct TerminalLossWriter;

impl Write for TerminalLossWriter {
    fn write(&mut self, _: &[u8]) -> io::Result<usize> {
        Err(io::Error::new(
            io::ErrorKind::NotConnected,
            "fixture terminal detached",
        ))
    }

    fn flush(&mut self) -> io::Result<()> {
        Err(io::Error::new(
            io::ErrorKind::NotConnected,
            "fixture terminal detached",
        ))
    }
}

#[tokio::test]
async fn real_http_sse_adapter_runs_multiple_tools_through_coordinator_and_renderer() {
    let server = LoopbackChat::spawn(vec![
        HttpResponse {
            status: 200,
            body: sse(&[
                r#"{"id":"completion-1","model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"reasoning_content":"required-reasoning","tool_calls":[{"index":0,"id":"provider-call-1","type":"function","function":{"name":"phase1b_echo","arguments":"{\"value\":\"one\"}"}},{"index":1,"id":"provider-call-2","type":"function","function":{"name":"phase1b_echo","arguments":"{\"value\":\"two\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":2,"prompt_cache_hit_tokens":1,"prompt_cache_miss_tokens":1,"completion_tokens":2,"total_tokens":4,"completion_tokens_details":{"reasoning_tokens":1}}}"#,
            ]),
        },
        HttpResponse {
            status: 200,
            body: sse(&[
                r#"{"id":"completion-2","model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"reasoning_content":"final-reasoning","content":"final-answer"},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"prompt_cache_hit_tokens":2,"prompt_cache_miss_tokens":2,"completion_tokens":1,"total_tokens":5,"completion_tokens_details":{"reasoning_tokens":1}}}"#,
            ]),
        },
    ])
    .await;
    let directory = tempfile::tempdir().unwrap();
    let credentials = ready_credentials(&directory);
    let backend = Arc::new(
        DeepSeekBackend::new_loopback_fixture(SseLimits::default(), &server.endpoint).unwrap(),
    );
    let mut application = ApplicationCoordinator::new_with_services(
        credentials,
        backend,
        Arc::new(Phase3ToolRuntime::default()),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
        Arc::new(RuntimeConfig::default()),
    )
    .await;
    let stdout = SharedWriter::default();
    let stderr = SharedWriter::default();
    let mut renderer = Renderer::new(Box::new(stdout.clone()), Box::new(stderr.clone()));
    application
        .dispatch_cancellable(
            Intent::SendEphemeralPrompt {
                text: "fixture prompt".into(),
            },
            CancellationToken::new(),
            |event| renderer.render(&event).unwrap(),
        )
        .await
        .unwrap();
    renderer.finish().unwrap();

    let requests = server.finish().await;
    assert_eq!(requests.len(), 2);
    let instructions = AgentInstructionProfile::built_in();
    assert!(requests.iter().all(|request| {
        request["messages"][0]["role"] == "system"
            && request["messages"][0]["content"] == instructions.system_instructions()
    }));
    assert_eq!(requests[0]["tools"].as_array().unwrap().len(), 2);
    assert_eq!(
        requests[1]["messages"][2]["reasoning_content"],
        "required-reasoning"
    );
    assert_eq!(
        requests[1]["messages"][2]["tool_calls"][0]["id"],
        "provider-call-1"
    );
    assert_eq!(
        requests[1]["messages"][2]["tool_calls"][1]["id"],
        "provider-call-2"
    );
    assert_eq!(
        requests[1]["messages"][3]["tool_call_id"],
        "provider-call-1"
    );
    assert_eq!(requests[1]["messages"][3]["content"], "one");
    assert_eq!(
        requests[1]["messages"][4]["tool_call_id"],
        "provider-call-2"
    );
    assert_eq!(requests[1]["messages"][4]["content"], "two");

    let turn = application.state.active_turn.as_ref().unwrap();
    assert_eq!(turn.status, TurnStatus::Completed);
    assert_eq!(turn.completed_phases.len(), 2);
    assert_eq!(turn.tools.len(), 2);
    assert!(
        turn.tools
            .iter()
            .all(|tool| tool.status == ToolStatus::Completed)
    );
    assert_eq!(turn.usage.as_ref().unwrap().total_tokens, Some(9));
    assert!(stdout.text().contains("final-answer"));
    let diagnostics = stderr.text();
    assert!(diagnostics.contains("cache_hit=Some(3)"));
    assert!(diagnostics.contains("cache_miss=Some(3)"));
    assert!(diagnostics.contains("reasoning=Some(2)"));
    assert!(diagnostics.contains("provider ledger is authoritative"));
}

#[tokio::test]
async fn renderer_capacity_exhaustion_cancels_an_active_http_stream() {
    use pho_code::app::runtime::CoordinatorError;

    let (endpoint, release, server) = hanging_stream(
        "data: {\"id\":\"overload\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"active\"},\"finish_reason\":null}]}\n\n".into(),
    )
    .await;
    let directory = tempfile::tempdir().unwrap();
    let mut application = ApplicationCoordinator::new_with_services(
        ready_credentials(&directory),
        Arc::new(DeepSeekBackend::new_loopback_fixture(SseLimits::default(), &endpoint).unwrap()),
        Arc::new(Phase3ToolRuntime::default()),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
        Arc::new(RuntimeConfig::default()),
    )
    .await;
    let cancellation = CancellationToken::new();
    let cancel_from_renderer = cancellation.clone();
    let mut renderer = Renderer::new_bounded(
        Box::new(Vec::<u8>::new()),
        Box::new(Vec::<u8>::new()),
        1024,
        1,
    );
    let mut failure_kinds = Vec::new();
    let result = application
        .dispatch_cancellable(
            Intent::SendEphemeralPrompt {
                text: "fixture prompt".into(),
            },
            cancellation,
            |event| {
                if let Err(error) = renderer.render(&event) {
                    failure_kinds.push(error.kind());
                    cancel_from_renderer.cancel();
                }
            },
        )
        .await;
    assert!(matches!(result, Err(CoordinatorError::Cancelled)));
    assert!(failure_kinds.contains(&io::ErrorKind::OutOfMemory));
    let _ = release.send(());
    server.await.unwrap();
}

#[tokio::test]
async fn terminal_loss_cancels_an_active_http_stream() {
    use pho_code::app::runtime::CoordinatorError;

    let (endpoint, release, server) = hanging_stream(
        "data: {\"id\":\"terminal-loss\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"active\"},\"finish_reason\":null}]}\n\n".into(),
    )
    .await;
    let directory = tempfile::tempdir().unwrap();
    let mut application = ApplicationCoordinator::new_with_services(
        ready_credentials(&directory),
        Arc::new(DeepSeekBackend::new_loopback_fixture(SseLimits::default(), &endpoint).unwrap()),
        Arc::new(Phase3ToolRuntime::default()),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
        Arc::new(RuntimeConfig::default()),
    )
    .await;
    let cancellation = CancellationToken::new();
    let cancel_from_renderer = cancellation.clone();
    let mut renderer = Renderer::new(Box::new(Vec::<u8>::new()), Box::new(TerminalLossWriter));
    let mut failure_kinds = Vec::new();
    let result = application
        .dispatch_cancellable(
            Intent::SendEphemeralPrompt {
                text: "fixture prompt".into(),
            },
            cancellation,
            |event| {
                if let Err(error) = renderer.render(&event) {
                    failure_kinds.push(error.kind());
                    cancel_from_renderer.cancel();
                }
            },
        )
        .await;
    assert!(matches!(result, Err(CoordinatorError::Cancelled)));
    assert!(failure_kinds.contains(&io::ErrorKind::NotConnected));
    let _ = release.send(());
    server.await.unwrap();
}

#[tokio::test]
async fn real_http_mutation_probe_is_denied_and_continuation_is_exactly_paired() {
    let server = LoopbackChat::spawn(vec![
        HttpResponse {
            status: 200,
            body: sse(&[
                r#"{"id":"mutation-1","model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"reasoning_content":"required","tool_calls":[{"index":0,"id":"mutation-call","type":"function","function":{"name":"phase3_mutation_probe","arguments":"{\"value\":\"no effect\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":1,"prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":1,"completion_tokens":1,"total_tokens":2}}"#,
            ]),
        },
        HttpResponse {
            status: 200,
            body: sse(&[
                r#"{"id":"mutation-2","model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"content":"denial-observed"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":2,"completion_tokens":1,"total_tokens":3}}"#,
            ]),
        },
    ])
    .await;
    let directory = tempfile::tempdir().unwrap();
    let credentials = ready_credentials(&directory);
    let backend = Arc::new(
        DeepSeekBackend::new_loopback_fixture(SseLimits::default(), &server.endpoint).unwrap(),
    );
    let mut application = ApplicationCoordinator::new_with_services(
        credentials,
        backend,
        Arc::new(Phase3ToolRuntime::default()),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
        Arc::new(RuntimeConfig::default()),
    )
    .await;
    let mut events = Vec::new();
    application
        .dispatch(
            Intent::SendEphemeralPrompt {
                text: "fixture mutation prompt".into(),
            },
            |event| events.push(event),
        )
        .await
        .unwrap();
    let requests = server.finish().await;
    assert_eq!(requests[1]["messages"][3]["tool_call_id"], "mutation-call");
    assert_eq!(
        requests[1]["messages"][3]["content"],
        r#"{"status":"denied","code":"approval_denied"}"#
    );
    assert!(events.iter().any(|event| matches!(
        event,
        RuntimeEvent::ApprovalResolved {
            decision: ApprovalDecision::Denied,
            ..
        }
    )));
    assert!(events.iter().any(|event| matches!(
        event,
        RuntimeEvent::ToolCompleted {
            executed: false,
            ..
        }
    )));
    assert_eq!(
        application.state.active_turn.as_ref().unwrap().tools[0].status,
        ToolStatus::Denied
    );
}

#[tokio::test]
async fn loopback_http_statuses_are_typed_and_never_retried() {
    use pho_code::agent::loop_runtime::run_no_tool_turn;
    use pho_code::backend::BackendError;

    for (status, expected) in [
        (400, BackendError::RequestInvalid),
        (401, BackendError::AuthorizationRejected),
        (402, BackendError::InsufficientBalance),
        (404, BackendError::ModelUnavailable),
        (422, BackendError::RequestRejected),
        (429, BackendError::RateLimited),
        (503, BackendError::ServiceUnavailable),
    ] {
        let server = LoopbackChat::spawn(vec![HttpResponse {
            status,
            body: "{}".into(),
        }])
        .await;
        let backend = Arc::new(
            DeepSeekBackend::new_loopback_fixture(SseLimits::default(), &server.endpoint).unwrap(),
        );
        let result = run_no_tool_turn(
            backend,
            "fixture prompt".into(),
            CancellationToken::new(),
            8,
            |_| {},
        )
        .await;
        assert!(matches!(result, Err(error) if error == expected));
        assert_eq!(server.finish().await.len(), 1);
    }
}

#[tokio::test]
async fn debug_transport_rejects_non_loopback_or_non_chat_endpoints() {
    for endpoint in [
        "https://127.0.0.1/chat/completions",
        "http://example.com/chat/completions",
        "http://127.0.0.1/other",
        "http://user@127.0.0.1/chat/completions",
        "http://127.0.0.1/chat/completions?query=1",
    ] {
        assert!(DeepSeekBackend::new_loopback_fixture(SseLimits::default(), endpoint).is_err());
    }
}

#[tokio::test]
async fn live_unauthorized_response_refreshes_projected_credential_state() {
    use pho_code::backend::BackendError;
    use pho_code::backend::scripted::{ScriptedBackend, ScriptedResponse, ScriptedStep};

    let directory = tempfile::tempdir().unwrap();
    let credentials = ready_credentials(&directory);
    let backend = Arc::new(ScriptedBackend::from_responses([ScriptedResponse::new([
        ScriptedStep::Fail(BackendError::AuthorizationRejected),
    ])]));
    let mut application = ApplicationCoordinator::new_with_services(
        credentials.clone(),
        backend,
        Arc::new(Phase3ToolRuntime::default()),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
        Arc::new(RuntimeConfig::default()),
    )
    .await;
    credentials.invalidate().await;
    let mut events = Vec::new();
    assert!(
        application
            .dispatch(
                Intent::SendEphemeralPrompt {
                    text: "fixture prompt".into(),
                },
                |event| events.push(event),
            )
            .await
            .is_err()
    );
    assert_eq!(
        application.state.credentials,
        pho_code::auth::CredentialState::Invalid
    );
    assert!(events.iter().any(|event| matches!(
        event,
        RuntimeEvent::CredentialChanged {
            state: pho_code::auth::CredentialState::Invalid
        }
    )));
}

#[tokio::test]
async fn real_http_cancellation_is_acknowledged_during_each_stream_content_kind() {
    use pho_code::backend::{BackendError, ModelEvent};

    for (frame, target) in [
        (
            "data: {\"id\":\"cancel-reasoning\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"partial\"},\"finish_reason\":null}]}\n\n",
            "reasoning",
        ),
        (
            "data: {\"id\":\"cancel-text\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"partial\"},\"finish_reason\":null}]}\n\n",
            "text",
        ),
        (
            "data: {\"id\":\"cancel-tool\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"partial-call\",\"type\":\"function\",\"function\":{\"name\":\"phase1b_echo\",\"arguments\":\"{\\\"value\\\":\"}}]},\"finish_reason\":null}]}\n\n",
            "tool",
        ),
    ] {
        let (endpoint, release, server) = hanging_stream(frame.into()).await;
        let backend = Arc::new(
            DeepSeekBackend::new_loopback_fixture(SseLimits::default(), &endpoint).unwrap(),
        );
        let cancellation = CancellationToken::new();
        let cancel_from_event = cancellation.clone();
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(3),
            run_agent_turn(
                backend,
                Arc::new(Phase3ToolRuntime::default()),
                Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
                TurnId::new(),
                "fixture prompt".into(),
                cancellation,
                8,
                agent_limits(),
                |event| {
                    let matched = matches!(
                        (target, event),
                        (
                            "reasoning",
                            AgentEvent::Model(ModelEvent::ReasoningDelta { .. })
                        ) | ("text", AgentEvent::Model(ModelEvent::TextDelta { .. }))
                            | (
                                "tool",
                                AgentEvent::Model(ModelEvent::ToolCallArgumentsDelta { .. })
                            )
                    );
                    if matched {
                        cancel_from_event.cancel();
                    }
                },
            ),
        )
        .await
        .unwrap();
        assert!(matches!(
            result,
            Err(AgentError::Backend(BackendError::Cancelled))
        ));
        let _ = release.send(());
        server.await.unwrap();
    }
}

#[tokio::test]
async fn real_http_continuation_request_cancels_without_retry() {
    use pho_code::backend::BackendError;

    let first = sse(&[
        r#"{"id":"continuation-1","model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"reasoning_content":"required","tool_calls":[{"index":0,"id":"continuation-call","type":"function","function":{"name":"phase1b_echo","arguments":"{\"value\":\"continued\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":1,"prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":1,"completion_tokens":1,"total_tokens":2}}"#,
    ]);
    let (endpoint, second_accepted, release, server) = hanging_continuation(first).await;
    let backend =
        Arc::new(DeepSeekBackend::new_loopback_fixture(SseLimits::default(), &endpoint).unwrap());
    let cancellation = CancellationToken::new();
    let cancel_request = cancellation.clone();
    let turn = tokio::spawn(run_agent_turn(
        backend,
        Arc::new(Phase3ToolRuntime::default()),
        Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
        TurnId::new(),
        "fixture prompt".into(),
        cancellation,
        8,
        agent_limits(),
        |_| {},
    ));
    tokio::time::timeout(std::time::Duration::from_secs(3), second_accepted)
        .await
        .unwrap()
        .unwrap();
    cancel_request.cancel();
    let result = tokio::time::timeout(std::time::Duration::from_secs(3), turn)
        .await
        .unwrap()
        .unwrap();
    assert!(matches!(
        result,
        Err(AgentError::Backend(BackendError::Cancelled))
    ));
    let _ = release.send(());
    server.await.unwrap();
}

struct PendingApproval;

impl ApprovalPolicy for PendingApproval {
    fn decide<'a>(
        &'a self,
        _: &'a ApprovalRequest,
        _: CancellationToken,
    ) -> Pin<Box<dyn std::future::Future<Output = ApprovalResponse> + Send + 'a>> {
        Box::pin(std::future::pending())
    }
}

#[tokio::test]
async fn real_http_tool_phase_can_cancel_while_approval_is_pending() {
    use pho_code::backend::BackendError;

    let server = LoopbackChat::spawn(vec![HttpResponse {
        status: 200,
        body: sse(&[
            r#"{"id":"approval-cancel","model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"reasoning_content":"required","tool_calls":[{"index":0,"id":"approval-call","type":"function","function":{"name":"phase3_mutation_probe","arguments":"{\"value\":\"no effect\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":1,"prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":1,"completion_tokens":1,"total_tokens":2}}"#,
        ]),
    }])
    .await;
    let backend = Arc::new(
        DeepSeekBackend::new_loopback_fixture(SseLimits::default(), &server.endpoint).unwrap(),
    );
    let cancellation = CancellationToken::new();
    let cancel_from_event = cancellation.clone();
    let result = run_agent_turn(
        backend,
        Arc::new(Phase3ToolRuntime::default()),
        Arc::new(PendingApproval),
        TurnId::new(),
        "fixture prompt".into(),
        cancellation,
        8,
        agent_limits(),
        |event| {
            if matches!(event, AgentEvent::ApprovalRequested(_)) {
                cancel_from_event.cancel();
            }
        },
    )
    .await;
    assert!(matches!(
        result,
        Err(AgentError::Backend(BackendError::Cancelled))
    ));
    assert_eq!(server.finish().await.len(), 1);
}

#[test]
fn pho_command_uses_live_adapter_general_loop_and_canonical_renderer() {
    use std::process::{Command, Stdio};

    let _serial = COMMAND_SERIAL
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);

    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let responses = [
        sse(&[
            r#"{"id":"command-1","model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"reasoning_content":"command-required","tool_calls":[{"index":0,"id":"command-call","type":"function","function":{"name":"phase1b_echo","arguments":"{\"value\":\"command-value\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":1,"prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":1,"completion_tokens":1,"total_tokens":2}}"#,
        ]),
        sse(&[
            r#"{"id":"command-2","model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"content":"command-final"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":2,"completion_tokens":1,"total_tokens":3}}"#,
        ]),
    ];
    let server = std::thread::spawn(move || {
        let mut requests = Vec::new();
        for body in responses {
            let (mut stream, _) = listener.accept().unwrap();
            requests.push(
                serde_json::from_slice::<serde_json::Value>(&read_request_body_sync(&mut stream))
                    .unwrap(),
            );
            let headers = format!(
                "HTTP/1.1 200 fixture\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            stream.write_all(headers.as_bytes()).unwrap();
            stream.write_all(body.as_bytes()).unwrap();
        }
        requests
    });

    let mut child = Command::new(env!("CARGO_BIN_EXE_pho"))
        .args(["chat", "--stdin"])
        .env("PHO_CODE_TEST_MEMORY_CREDENTIALS", "ready")
        .env(
            "PHO_CODE_TEST_CHAT_ENDPOINT",
            format!("http://{address}/chat/completions"),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"command fixture prompt\n")
        .unwrap();
    let output = child.wait_with_output().unwrap();
    let requests = server.join().unwrap();
    assert!(output.status.success(), "{:?}", output.status);
    assert!(String::from_utf8_lossy(&output.stdout).contains("command-final"));
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("tool result: phase1b_echo executed=true command-value"));
    assert!(stderr.contains("usage (turn total)"));
    assert_eq!(requests.len(), 2);
    assert_eq!(
        requests[1]["messages"][2]["reasoning_content"],
        "command-required"
    );
    assert_eq!(requests[1]["messages"][3]["tool_call_id"], "command-call");
    assert_eq!(requests[1]["messages"][3]["content"], "command-value");
}

#[test]
fn pho_command_broken_stdout_cancels_active_live_stream() {
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    let _serial = COMMAND_SERIAL
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);

    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (sent, stream_sent) = std::sync::mpsc::channel();
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        read_request_body_sync(&mut stream);
        stream
            .write_all(
                b"HTTP/1.1 200 fixture\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {\"id\":\"broken-pipe\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"partial-output\\n\"},\"finish_reason\":null}]}\n\n",
            )
            .unwrap();
        sent.send(()).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut byte = [0_u8; 1];
        matches!(stream.read(&mut byte), Ok(0) | Err(_))
    });

    let mut child = Command::new(env!("CARGO_BIN_EXE_pho"))
        .args(["chat", "--stdin"])
        .env("PHO_CODE_TEST_MEMORY_CREDENTIALS", "ready")
        .env(
            "PHO_CODE_TEST_CHAT_ENDPOINT",
            format!("http://{address}/chat/completions"),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    drop(child.stdout.take().unwrap());
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"broken pipe fixture prompt\n")
        .unwrap();
    stream_sent.recv_timeout(Duration::from_secs(3)).unwrap();
    let deadline = Instant::now() + Duration::from_secs(3);
    let status = loop {
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if Instant::now() >= deadline {
            child.kill().unwrap();
            panic!("pho did not cancel after stdout broke");
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    assert_eq!(status.code(), Some(130));
    assert!(server.join().unwrap());
}

#[test]
fn pho_command_non_draining_stdout_cancels_active_live_stream() {
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    let _serial = COMMAND_SERIAL
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);

    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        read_request_body_sync(&mut stream);
        let content = "x".repeat(240 * 1024);
        let chunk = serde_json::json!({
            "id": "non-draining-pipe",
            "model": "deepseek-v4-flash",
            "choices": [{
                "index": 0,
                "delta": { "content": content },
                "finish_reason": null
            }]
        });
        let response = format!(
            "HTTP/1.1 200 fixture\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {chunk}\n\n"
        );
        let _ = stream.write_all(response.as_bytes());
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut byte = [0_u8; 1];
        matches!(stream.read(&mut byte), Ok(0) | Err(_))
    });

    let mut child = Command::new(env!("CARGO_BIN_EXE_pho"))
        .args(["chat", "--stdin"])
        .env("PHO_CODE_TEST_MEMORY_CREDENTIALS", "ready")
        .env(
            "PHO_CODE_TEST_CHAT_ENDPOINT",
            format!("http://{address}/chat/completions"),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let unread_stdout = child.stdout.take().unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"non-draining pipe fixture prompt\n")
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(3);
    let status = loop {
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if Instant::now() >= deadline {
            child.kill().unwrap();
            panic!("pho blocked on a non-draining stdout pipe");
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    drop(unread_stdout);
    assert_eq!(status.code(), Some(130));
    assert!(server.join().unwrap());
}

#[test]
fn pho_command_sigint_cancels_active_live_stream() {
    use std::io::{BufRead as _, BufReader};
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    let _serial = COMMAND_SERIAL
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);

    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        read_request_body_sync(&mut stream);
        stream
            .write_all(
                b"HTTP/1.1 200 fixture\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {\"id\":\"signal\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"active-stream\\n\"},\"finish_reason\":null}]}\n\n",
            )
            .unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut byte = [0_u8; 1];
        matches!(stream.read(&mut byte), Ok(0) | Err(_))
    });

    let mut child = Command::new(env!("CARGO_BIN_EXE_pho"))
        .args(["chat", "--stdin"])
        .env("PHO_CODE_TEST_MEMORY_CREDENTIALS", "ready")
        .env(
            "PHO_CODE_TEST_CHAT_ENDPOINT",
            format!("http://{address}/chat/completions"),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"signal fixture prompt\n")
        .unwrap();
    let mut stderr = BufReader::new(child.stderr.take().unwrap());
    let mut active = String::new();
    stderr.read_line(&mut active).unwrap();
    assert!(active.starts_with("reasoning: active-stream"));
    // SAFETY: the child PID names the live process owned by this test.
    assert_eq!(unsafe { libc::kill(child.id() as i32, libc::SIGINT) }, 0);
    let deadline = Instant::now() + Duration::from_secs(3);
    let status = loop {
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if Instant::now() >= deadline {
            child.kill().unwrap();
            panic!("pho did not cancel after active-stream SIGINT");
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    assert_eq!(status.code(), Some(130));
    assert!(server.join().unwrap());
}
