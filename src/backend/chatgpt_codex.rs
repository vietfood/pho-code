use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt as _;
use reqwest::header::{
    ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderName, HeaderValue, USER_AGENT,
};
use serde::Serialize;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;
use zeroize::Zeroize as _;

use crate::auth::actor::AuthenticationActor;

use super::profile::CompatibilityProfile;
use super::sse::{SseDecoder, SseLimits};
use super::{BackendError, BackendInput, BackendRequest, ModelBackend, ModelEvent, ToolDefinition};

const HEADER_TIMEOUT: Duration = Duration::from_secs(30);
const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(45);
const STREAM_TOTAL_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const MAXIMUM_REQUEST_BYTES: usize = 8 * 1024 * 1024;

pub struct ChatGptCodexBackend {
    client: reqwest::Client,
    auth: Arc<AuthenticationActor>,
    profile: CompatibilityProfile,
    sse_limits: SseLimits,
}

impl ChatGptCodexBackend {
    pub fn new(
        auth: Arc<AuthenticationActor>,
        profile: CompatibilityProfile,
        sse_limits: SseLimits,
    ) -> Result<Self, BackendError> {
        profile
            .validate()
            .map_err(|_| BackendError::Protocol("backend profile is invalid"))?;
        let client = reqwest::Client::builder()
            .redirect_policy(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .build()
            .map_err(|_| BackendError::Transport("HTTP client initialization failed"))?;
        Ok(Self {
            client,
            auth,
            profile,
            sse_limits,
        })
    }

    async fn run(
        &self,
        request: BackendRequest,
        events: mpsc::Sender<ModelEvent>,
        cancellation: CancellationToken,
    ) -> Result<(), BackendError> {
        validate_request(&request)?;
        let mut lease = self
            .auth
            .lease()
            .await
            .map_err(|_| BackendError::AuthorizationRejected)?;
        if lease.profile_revision != self.profile.revision {
            return Err(BackendError::AuthorizationRejected);
        }
        let body = WireRequest::from_domain(&request);
        let encoded = serde_json::to_vec(&body)
            .map_err(|_| BackendError::Protocol("request serialization failed"))?;
        if encoded.len() > MAXIMUM_REQUEST_BYTES {
            return Err(BackendError::Protocol("request byte limit exceeded"));
        }
        let headers = request_headers(&request, &lease, &self.profile)?;
        let pending = self
            .client
            .post(self.profile.responses_endpoint.clone())
            .headers(headers)
            .body(encoded.clone())
            .send();
        let response = tokio::select! {
            _ = cancellation.cancelled() => {
                send_event(&events, ModelEvent::ResponseCancelled {
                    stage: super::CancellationStage::BeforeHeaders,
                    transport_terminated: true,
                }).await?;
                return Ok(());
            }
            result = tokio::time::timeout(HEADER_TIMEOUT, pending) => {
                match result {
                    Ok(Ok(response)) => response,
                    Ok(Err(_)) | Err(_) => return Err(BackendError::DeliveryUnknown),
                }
            }
        };

        let response = if response.status().as_u16() == 401 {
            lease = self
                .auth
                .refresh_after_rejection()
                .await
                .map_err(|_| BackendError::AuthorizationRejected)?;
            let retry_headers = request_headers(&request, &lease, &self.profile)?;
            let retry = self
                .client
                .post(self.profile.responses_endpoint.clone())
                .headers(retry_headers)
                .body(encoded)
                .send();
            tokio::select! {
                _ = cancellation.cancelled() => {
                    send_event(&events, ModelEvent::ResponseCancelled {
                        stage: super::CancellationStage::BeforeHeaders,
                        transport_terminated: true,
                    }).await?;
                    return Ok(());
                }
                result = tokio::time::timeout(HEADER_TIMEOUT, retry) => {
                    match result {
                        Ok(Ok(response)) => response,
                        Ok(Err(_)) | Err(_) => return Err(BackendError::DeliveryUnknown),
                    }
                }
            }
        } else {
            response
        };

        if !response.status().is_success() {
            return Err(classify_status(response.status().as_u16()));
        }
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("");
        if !content_type.starts_with("text/event-stream") {
            return Err(BackendError::Protocol(
                "response content type is incompatible",
            ));
        }

        let deadline = tokio::time::Instant::now() + STREAM_TOTAL_TIMEOUT;
        let mut stream = response.bytes_stream();
        let mut decoder = SseDecoder::new(self.sse_limits.clone());
        let mut accepted_event = false;
        loop {
            let next =
                match bounded_wait(stream.next(), &cancellation, STREAM_IDLE_TIMEOUT, deadline)
                    .await?
                {
                    WaitOutcome::Cancelled => {
                        send_event(
                            &events,
                            ModelEvent::ResponseCancelled {
                                stage: cancellation_stage(accepted_event),
                                transport_terminated: true,
                            },
                        )
                        .await?;
                        return Ok(());
                    }
                    WaitOutcome::Value(next) => next,
                };
            let Some(chunk) = next else { break };
            let chunk = chunk.map_err(|_| {
                if accepted_event {
                    BackendError::InterruptedAmbiguous
                } else {
                    BackendError::DeliveryUnknown
                }
            })?;
            for event in decoder.feed(&chunk)? {
                accepted_event = true;
                send_event(&events, event).await?;
            }
        }
        for event in decoder.finish()? {
            send_event(&events, event).await?;
        }
        Ok(())
    }
}

#[derive(Debug, PartialEq)]
enum WaitOutcome<T> {
    Value(T),
    Cancelled,
}

async fn bounded_wait<T>(
    future: impl std::future::Future<Output = T>,
    cancellation: &CancellationToken,
    idle_timeout: Duration,
    total_deadline: tokio::time::Instant,
) -> Result<WaitOutcome<T>, BackendError> {
    tokio::select! {
        _ = cancellation.cancelled() => Ok(WaitOutcome::Cancelled),
        _ = tokio::time::sleep_until(total_deadline) => Err(BackendError::StreamTimedOut),
        result = tokio::time::timeout(idle_timeout, future) => {
            result.map(WaitOutcome::Value).map_err(|_| BackendError::StreamTimedOut)
        }
    }
}

fn cancellation_stage(accepted_event: bool) -> super::CancellationStage {
    if accepted_event {
        super::CancellationStage::AfterStreamStarted
    } else {
        super::CancellationStage::BeforeFirstEvent
    }
}

impl ModelBackend for ChatGptCodexBackend {
    fn stream<'a>(
        &'a self,
        request: BackendRequest,
        events: mpsc::Sender<ModelEvent>,
        cancellation: CancellationToken,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), BackendError>> + Send + 'a>>
    {
        Box::pin(self.run(request, events, cancellation))
    }
}

async fn send_event(
    events: &mpsc::Sender<ModelEvent>,
    event: ModelEvent,
) -> Result<(), BackendError> {
    events
        .send(event)
        .await
        .map_err(|_| BackendError::EventChannelClosed)
}

fn request_headers(
    request: &BackendRequest,
    lease: &crate::auth::actor::CredentialLease,
    profile: &CompatibilityProfile,
) -> Result<HeaderMap, BackendError> {
    if request.session_key.is_empty() || request.session_key.len() > 256 {
        return Err(BackendError::Protocol("session key is invalid"));
    }
    let mut headers = HeaderMap::new();
    let mut authorization = format!("Bearer {}", lease.access_token.expose());
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&authorization)
            .map_err(|_| BackendError::Protocol("authorization header is invalid"))?,
    );
    authorization.zeroize();
    headers.insert(
        HeaderName::from_static("chatgpt-account-id"),
        HeaderValue::from_str(lease.account_id.expose())
            .map_err(|_| BackendError::Protocol("account header is invalid"))?,
    );
    headers.insert(
        HeaderName::from_static("originator"),
        HeaderValue::from_str(&profile.originator)
            .map_err(|_| BackendError::Protocol("originator is invalid"))?,
    );
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(concat!("pho-code/", env!("CARGO_PKG_VERSION"))),
    );
    headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        HeaderName::from_static("x-request-id"),
        HeaderValue::from_str(&Uuid::new_v4().to_string())
            .map_err(|_| BackendError::Protocol("request ID is invalid"))?,
    );
    headers.insert(
        HeaderName::from_static("session_id"),
        HeaderValue::from_str(&request.session_key)
            .map_err(|_| BackendError::Protocol("session header is invalid"))?,
    );
    Ok(headers)
}

fn classify_status(status: u16) -> BackendError {
    match status {
        400 | 422 => BackendError::RequestRejected,
        401 => BackendError::AuthorizationRejected,
        403 => BackendError::ClientIdentityRejected,
        404 => BackendError::RequestRejected,
        429 => BackendError::RateLimited,
        500..=599 => BackendError::ServiceUnavailable,
        _ => BackendError::RequestRejected,
    }
}

fn validate_request(request: &BackendRequest) -> Result<(), BackendError> {
    if request.model.is_empty()
        || request.model.len() > 256
        || request.instructions.len() > 256 * 1024
        || request.tools.len() > 16
        || request.input.len() > 10_000
    {
        return Err(BackendError::Protocol(
            "backend request exceeds a structural limit",
        ));
    }
    for tool in &request.tools {
        let schema_bytes = serde_json::to_vec(&tool.schema)
            .map_err(|_| BackendError::Protocol("tool schema is invalid"))?;
        if tool.name.is_empty()
            || tool.name.len() > 64
            || tool.description.len() > 4 * 1024
            || schema_bytes.len() > 64 * 1024
        {
            return Err(BackendError::Protocol("tool definition exceeds a limit"));
        }
    }
    Ok(())
}

#[derive(Serialize)]
struct WireRequest<'a> {
    model: &'a str,
    store: bool,
    stream: bool,
    instructions: &'a str,
    input: Vec<serde_json::Value>,
    include: [&'static str; 1],
    reasoning: ReasoningControl,
    tool_choice: &'static str,
    parallel_tool_calls: bool,
    tools: Vec<WireTool<'a>>,
}

#[derive(Serialize)]
struct ReasoningControl {
    effort: &'static str,
    summary: &'static str,
}

#[derive(Serialize)]
struct WireTool<'a> {
    r#type: &'static str,
    name: &'a str,
    description: &'a str,
    parameters: &'a serde_json::Value,
    strict: bool,
}

impl<'a> WireRequest<'a> {
    fn from_domain(request: &'a BackendRequest) -> Self {
        Self {
            model: &request.model,
            store: false,
            stream: true,
            instructions: &request.instructions,
            input: request.input.iter().map(wire_input).collect(),
            include: ["reasoning.encrypted_content"],
            reasoning: ReasoningControl {
                effort: "medium",
                summary: "auto",
            },
            tool_choice: "auto",
            parallel_tool_calls: false,
            tools: request.tools.iter().map(wire_tool).collect(),
        }
    }
}

fn wire_tool(tool: &ToolDefinition) -> WireTool<'_> {
    WireTool {
        r#type: "function",
        name: &tool.name,
        description: &tool.description,
        parameters: &tool.schema,
        strict: true,
    }
}

fn wire_input(input: &BackendInput) -> serde_json::Value {
    match input {
        BackendInput::UserText(text) => {
            serde_json::json!({"role":"user","content":[{"type":"input_text","text":text}]})
        }
        BackendInput::AssistantText {
            provider_item_id,
            text,
        } => {
            serde_json::json!({"id":provider_item_id,"type":"message","role":"assistant","content":[{"type":"output_text","text":text}]})
        }
        BackendInput::ToolCall {
            provider_item_id,
            call_id,
            name,
            arguments,
        } => {
            serde_json::json!({"id":provider_item_id,"type":"function_call","call_id":call_id,"name":name,"arguments":arguments})
        }
        BackendInput::ToolResult { call_id, output } => {
            serde_json::json!({"type":"function_call_output","call_id":call_id,"output":output})
        }
        BackendInput::OpaqueReasoning(replay) => serde_json::json!({
            "id":replay.provider_item_id,
            "type":"reasoning",
            "encrypted_content":replay.encrypted_content
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wire_request_is_stateless_and_sequential() {
        let request = BackendRequest {
            request_id: crate::agent::types::BackendRequestId::new(),
            session_key: "fixture-session".into(),
            model: "fixture-model".into(),
            instructions: "fixture instructions".into(),
            input: vec![BackendInput::UserText("hello".into())],
            tools: vec![],
        };
        let value = serde_json::to_value(WireRequest::from_domain(&request)).unwrap();
        assert_eq!(value["store"], false);
        assert_eq!(value["stream"], true);
        assert_eq!(value["parallel_tool_calls"], false);
        assert!(!value.to_string().contains("originator"));
    }

    #[test]
    fn status_classification_does_not_retain_body() {
        assert_eq!(classify_status(403), BackendError::ClientIdentityRejected);
        assert_eq!(classify_status(429), BackendError::RateLimited);
    }

    #[test]
    fn request_and_events_redact_content_from_debug() {
        let marker = "seeded-live-secret-marker";
        let request = BackendRequest {
            request_id: crate::agent::types::BackendRequestId::new(),
            session_key: "fixture-session".into(),
            model: "fixture-model".into(),
            instructions: marker.into(),
            input: vec![BackendInput::UserText(marker.into())],
            tools: vec![],
        };
        let event = ModelEvent::ToolCallCompleted {
            output_index: 0,
            provider_item_id: "item".into(),
            call_id: "call".into(),
            name: "tool".into(),
            arguments: marker.into(),
        };
        assert!(!format!("{request:?} {event:?}").contains(marker));
    }

    #[tokio::test]
    async fn idle_total_and_cancellation_waits_are_classified() {
        let cancellation = CancellationToken::new();
        let idle = bounded_wait(
            std::future::pending::<()>(),
            &cancellation,
            Duration::from_millis(1),
            tokio::time::Instant::now() + Duration::from_secs(1),
        )
        .await;
        assert_eq!(idle, Err(BackendError::StreamTimedOut));

        let total = bounded_wait(
            std::future::pending::<()>(),
            &cancellation,
            Duration::from_secs(1),
            tokio::time::Instant::now(),
        )
        .await;
        assert_eq!(total, Err(BackendError::StreamTimedOut));

        cancellation.cancel();
        let cancelled = bounded_wait(
            std::future::pending::<()>(),
            &cancellation,
            Duration::from_secs(1),
            tokio::time::Instant::now() + Duration::from_secs(1),
        )
        .await
        .unwrap();
        assert!(matches!(cancelled, WaitOutcome::Cancelled));
        assert_eq!(
            cancellation_stage(false),
            crate::backend::CancellationStage::BeforeFirstEvent
        );
        assert_eq!(
            cancellation_stage(true),
            crate::backend::CancellationStage::AfterStreamStarted
        );
    }
}
