use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt as _;
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue, USER_AGENT};
use serde::Serialize;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use zeroize::Zeroizing;

use crate::auth::SecretText;
use crate::auth::api_key::CredentialActor;

use super::profile::{CHAT_ENDPOINT, MAXIMUM_OUTPUT_TOKENS, MODEL, PROFILE_REVISION};
use super::sse::{SseDecoder, SseLimits};
use super::strict_json::parse_strict_object;
use super::{
    AssistantPhase, BackendError, BackendMessage, BackendRequest, ModelBackend, ModelEvent,
};

const MAXIMUM_REQUEST_BYTES: usize = 8 * 1024 * 1024;
const MAXIMUM_MESSAGES: usize = 4096;
const MAXIMUM_MESSAGE_BYTES: usize = 2 * 1024 * 1024;
const MAXIMUM_TOOL_ARGUMENT_BYTES: usize = 64 * 1024;
const MAXIMUM_TOOL_SCHEMA_BYTES: usize = 64 * 1024;
const MAXIMUM_TOOL_DESCRIPTION_BYTES: usize = 4096;
const MAXIMUM_IDENTITY_BYTES: usize = 256;
const HEADER_TIMEOUT: Duration = Duration::from_secs(30);
const BYTE_IDLE_TIMEOUT: Duration = Duration::from_secs(90);
const SEMANTIC_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const TOTAL_TIMEOUT: Duration = Duration::from_secs(15 * 60);

pub struct DeepSeekBackend {
    client: reqwest::Client,
    credential_source: CredentialSource,
    sse_limits: SseLimits,
    chat_endpoint: String,
}

enum CredentialSource {
    Production(Arc<CredentialActor>),
    #[cfg(debug_assertions)]
    LoopbackFixture(SecretText),
}

impl DeepSeekBackend {
    pub fn new(
        credentials: Arc<CredentialActor>,
        sse_limits: SseLimits,
    ) -> Result<Self, BackendError> {
        let client = reqwest::Client::builder()
            .redirect_policy(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .build()
            .map_err(|_| BackendError::Transport("HTTP client initialization failed"))?;
        Ok(Self {
            client,
            credential_source: CredentialSource::Production(credentials),
            sse_limits,
            chat_endpoint: CHAT_ENDPOINT.into(),
        })
    }

    #[cfg(debug_assertions)]
    pub fn new_loopback_fixture(
        sse_limits: SseLimits,
        endpoint: &str,
    ) -> Result<Self, BackendError> {
        let endpoint = url::Url::parse(endpoint).map_err(|_| BackendError::RequestInvalid)?;
        let loopback = match endpoint.host() {
            Some(url::Host::Ipv4(address)) => address.is_loopback(),
            Some(url::Host::Ipv6(address)) => address.is_loopback(),
            Some(url::Host::Domain(_)) => false,
            None => false,
        };
        if endpoint.scheme() != "http"
            || !loopback
            || endpoint.path() != "/chat/completions"
            || endpoint.query().is_some()
            || endpoint.fragment().is_some()
            || !endpoint.username().is_empty()
            || endpoint.password().is_some()
        {
            return Err(BackendError::RequestInvalid);
        }
        let client = reqwest::Client::builder()
            .redirect_policy(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .build()
            .map_err(|_| BackendError::Transport("HTTP client initialization failed"))?;
        Ok(Self {
            client,
            credential_source: CredentialSource::LoopbackFixture(SecretText::new(
                "loopback-fixture-key".into(),
            )),
            sse_limits,
            chat_endpoint: endpoint.into(),
        })
    }

    async fn run(
        &self,
        request: BackendRequest,
        events: mpsc::Sender<ModelEvent>,
        cancellation: CancellationToken,
    ) -> Result<(), BackendError> {
        let encoded = encode_request(&request)?;
        let api_key = match &self.credential_source {
            CredentialSource::Production(credentials) => {
                let lease = credentials
                    .lease()
                    .await
                    .map_err(|_| BackendError::AuthorizationRejected)?;
                if lease.profile_revision != PROFILE_REVISION {
                    return Err(BackendError::AuthorizationRejected);
                }
                lease.api_key
            }
            #[cfg(debug_assertions)]
            CredentialSource::LoopbackFixture(api_key) => api_key.clone(),
        };
        let pending = self
            .client
            .post(&self.chat_endpoint)
            .headers(request_headers(&api_key)?)
            .body(encoded)
            .send();
        let response = tokio::select! {
            _ = cancellation.cancelled() => {
                send(&events, ModelEvent::ResponseCancelled { stage: super::CancellationStage::BeforeHeaders, transport_terminated: true }).await?;
                return Ok(());
            }
            result = tokio::time::timeout(HEADER_TIMEOUT, pending) => match result {
                Ok(Ok(response)) => response,
                Ok(Err(_)) | Err(_) => return Err(BackendError::DeliveryUnknown),
            }
        };
        if response.status().as_u16() == 401
            && let CredentialSource::Production(credentials) = &self.credential_source
        {
            credentials.invalidate().await;
        }
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

        let total_deadline = tokio::time::Instant::now() + TOTAL_TIMEOUT;
        let mut semantic_deadline = tokio::time::Instant::now() + SEMANTIC_TIMEOUT;
        let mut stream = response.bytes_stream();
        let mut decoder = Some(SseDecoder::new(self.sse_limits.clone(), request.request_id));
        let mut semantic_event_seen = false;
        loop {
            let now = tokio::time::Instant::now();
            if now >= total_deadline || now >= semantic_deadline {
                return Err(BackendError::StreamTimedOut);
            }
            let wait = BYTE_IDLE_TIMEOUT
                .min(total_deadline - now)
                .min(semantic_deadline - now);
            let next = tokio::select! {
                _ = cancellation.cancelled() => {
                    send(&events, ModelEvent::ResponseCancelled {
                        stage: if semantic_event_seen { super::CancellationStage::AfterStreamStarted } else { super::CancellationStage::BeforeFirstEvent },
                        transport_terminated: true,
                    }).await?;
                    return Ok(());
                }
                result = tokio::time::timeout(wait, stream.next()) => result.map_err(|_| BackendError::StreamTimedOut)?,
            };
            let Some(chunk) = next else { break };
            let chunk = chunk.map_err(|_| {
                if semantic_event_seen {
                    BackendError::InterruptedAmbiguous
                } else {
                    BackendError::DeliveryUnknown
                }
            })?;
            let current = decoder
                .as_mut()
                .ok_or(BackendError::InternalInvariantViolation)?;
            let decoded = current.feed(&chunk)?;
            if !decoded.is_empty() {
                semantic_event_seen = true;
                semantic_deadline = tokio::time::Instant::now() + SEMANTIC_TIMEOUT;
            }
            for event in decoded {
                send(&events, event).await?;
            }
        }
        let trailing = decoder
            .take()
            .ok_or(BackendError::InternalInvariantViolation)?
            .finish()?;
        for event in trailing {
            send(&events, event).await?;
        }
        Ok(())
    }
}

impl ModelBackend for DeepSeekBackend {
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

#[derive(Serialize)]
struct WireRequest<'a> {
    model: &'a str,
    messages: Vec<WireMessage<'a>>,
    thinking: Thinking,
    reasoning_effort: &'static str,
    stream: bool,
    stream_options: StreamOptions,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<WireTool<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<&'static str>,
}

#[derive(Serialize)]
struct Thinking {
    r#type: &'static str,
}
#[derive(Serialize)]
struct StreamOptions {
    include_usage: bool,
}

#[derive(Serialize)]
#[serde(tag = "role")]
enum WireMessage<'a> {
    #[serde(rename = "system")]
    System { content: &'a str },
    #[serde(rename = "user")]
    User { content: &'a str },
    #[serde(rename = "assistant")]
    Assistant {
        content: Option<&'a str>,
        #[serde(skip_serializing_if = "Option::is_none")]
        reasoning_content: Option<&'a str>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        tool_calls: Vec<WireCall<'a>>,
    },
    #[serde(rename = "tool")]
    Tool {
        content: &'a str,
        tool_call_id: &'a str,
    },
}

#[derive(Serialize)]
struct WireCall<'a> {
    id: &'a str,
    r#type: &'static str,
    function: WireCallFunction<'a>,
}
#[derive(Serialize)]
struct WireCallFunction<'a> {
    name: &'a str,
    arguments: &'a str,
}
#[derive(Serialize)]
struct WireTool<'a> {
    r#type: &'static str,
    function: WireToolFunction<'a>,
}
#[derive(Serialize)]
struct WireToolFunction<'a> {
    name: &'a str,
    description: &'a str,
    parameters: &'a serde_json::Value,
}

fn encode_request(request: &BackendRequest) -> Result<Vec<u8>, BackendError> {
    validate_request(request)?;
    let body = to_wire_request(request)?;
    let encoded = serde_json::to_vec(&body)
        .map_err(|_| BackendError::Protocol("request serialization failed"))?;
    if encoded.len() > MAXIMUM_REQUEST_BYTES {
        return Err(BackendError::Protocol("request byte limit exceeded"));
    }
    Ok(encoded)
}

fn to_wire_request(request: &BackendRequest) -> Result<WireRequest<'_>, BackendError> {
    let mut messages = Vec::with_capacity(request.messages.len() + 1);
    if !request.system_instructions.is_empty() {
        messages.push(WireMessage::System {
            content: &request.system_instructions,
        });
    }
    for message in &request.messages {
        match message {
            BackendMessage::User(user) => messages.push(WireMessage::User {
                content: &user.text,
            }),
            BackendMessage::Assistant(phase) => messages.push(assistant_message(phase)?),
            BackendMessage::Tool(result) => messages.push(WireMessage::Tool {
                content: &result.output,
                tool_call_id: &result.provider_call_id,
            }),
        }
    }
    let tools = request
        .tools
        .iter()
        .map(|tool| WireTool {
            r#type: "function",
            function: WireToolFunction {
                name: &tool.name,
                description: &tool.description,
                parameters: &tool.schema,
            },
        })
        .collect::<Vec<_>>();
    let tool_choice = (!tools.is_empty()).then_some("auto");
    Ok(WireRequest {
        model: MODEL,
        messages,
        thinking: Thinking { r#type: "enabled" },
        reasoning_effort: "high",
        stream: true,
        stream_options: StreamOptions {
            include_usage: true,
        },
        max_tokens: MAXIMUM_OUTPUT_TOKENS,
        tools,
        tool_choice,
    })
}

fn assistant_message(phase: &AssistantPhase) -> Result<WireMessage<'_>, BackendError> {
    if phase.reasoning_required_for_replay && phase.reasoning.is_none() {
        return Err(BackendError::ReplayStateMissing);
    }
    let tool_calls = phase
        .tool_calls
        .iter()
        .map(|call| WireCall {
            id: &call.provider_call_id,
            r#type: "function",
            function: WireCallFunction {
                name: &call.name,
                arguments: &call.arguments,
            },
        })
        .collect();
    Ok(WireMessage::Assistant {
        content: phase.text.as_deref(),
        reasoning_content: phase.reasoning.as_deref(),
        tool_calls,
    })
}

fn validate_request(request: &BackendRequest) -> Result<(), BackendError> {
    if request.model != MODEL {
        return Err(BackendError::ModelUnavailable);
    }
    if request.messages.is_empty() || request.messages.len() > MAXIMUM_MESSAGES {
        return Err(BackendError::RequestInvalid);
    }
    if request.system_instructions.len() > MAXIMUM_MESSAGE_BYTES {
        return Err(BackendError::RequestInvalid);
    }
    for message in &request.messages {
        let valid = match message {
            BackendMessage::User(user) => {
                !user.text.is_empty() && user.text.len() <= MAXIMUM_MESSAGE_BYTES
            }
            BackendMessage::Assistant(phase) => {
                !phase.provider_completion_id.is_empty()
                    && phase.provider_completion_id.len() <= MAXIMUM_IDENTITY_BYTES
                    && phase.compatibility.model == MODEL
                    && phase.tool_calls.len() <= 32
                    && phase
                        .text
                        .as_ref()
                        .is_none_or(|text| text.len() <= MAXIMUM_MESSAGE_BYTES)
                    && phase
                        .reasoning
                        .as_ref()
                        .is_none_or(|text| text.len() <= MAXIMUM_MESSAGE_BYTES)
            }
            BackendMessage::Tool(result) => {
                result.output.len() <= MAXIMUM_MESSAGE_BYTES && !result.provider_call_id.is_empty()
            }
        };
        if !valid {
            return Err(BackendError::RequestInvalid);
        }
    }
    if request.tools.len() > 32 {
        return Err(BackendError::RequestInvalid);
    }
    let mut tool_names = std::collections::HashSet::new();
    for tool in &request.tools {
        let schema_bytes = serde_json::to_vec(&tool.schema)
            .map_err(|_| BackendError::RequestInvalid)?
            .len();
        if !valid_tool_name(&tool.name)
            || !tool_names.insert(tool.name.as_str())
            || tool.description.len() > MAXIMUM_TOOL_DESCRIPTION_BYTES
            || schema_bytes > MAXIMUM_TOOL_SCHEMA_BYTES
            || !tool.schema.is_object()
        {
            return Err(BackendError::RequestInvalid);
        }
    }
    validate_replay(&request.messages)?;
    Ok(())
}

fn validate_replay(messages: &[BackendMessage]) -> Result<(), BackendError> {
    let mut expected: std::collections::VecDeque<(&crate::agent::types::ToolCallId, &str)> =
        std::collections::VecDeque::new();
    let mut seen = std::collections::HashSet::new();
    for message in messages {
        match message {
            BackendMessage::Assistant(phase) => {
                if !expected.is_empty() {
                    return Err(BackendError::ReplayStateMissing);
                }
                if phase.reasoning_required_for_replay && phase.reasoning.is_none() {
                    return Err(BackendError::ReplayStateMissing);
                }
                for call in &phase.tool_calls {
                    if call.provider_call_id.is_empty()
                        || call.provider_call_id.len() > MAXIMUM_IDENTITY_BYTES
                        || !valid_tool_name(&call.name)
                        || parse_strict_object(&call.arguments, MAXIMUM_TOOL_ARGUMENT_BYTES, 32)
                            .is_err()
                        || !seen.insert(call.provider_call_id.as_str())
                    {
                        return Err(BackendError::ReplayStateMissing);
                    }
                    expected.push_back((&call.tool_call_id, &call.provider_call_id));
                }
            }
            BackendMessage::Tool(result) => {
                let Some((local, provider)) = expected.pop_front() else {
                    return Err(BackendError::ReplayStateMissing);
                };
                if local != &result.tool_call_id || provider != result.provider_call_id {
                    return Err(BackendError::ReplayStateMissing);
                }
            }
            BackendMessage::User(_) if !expected.is_empty() => {
                return Err(BackendError::ReplayStateMissing);
            }
            BackendMessage::User(_) => {}
        }
    }
    if !expected.is_empty() {
        return Err(BackendError::ReplayStateMissing);
    }
    Ok(())
}

fn valid_tool_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn request_headers(api_key: &SecretText) -> Result<HeaderMap, BackendError> {
    let mut headers = HeaderMap::new();
    let authorization = Zeroizing::new(format!("Bearer {}", api_key.expose()));
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&authorization).map_err(|_| BackendError::AuthorizationRejected)?,
    );
    headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(USER_AGENT, HeaderValue::from_static("pho-code/0.1"));
    Ok(headers)
}

fn classify_status(status: u16) -> BackendError {
    match status {
        400 => BackendError::RequestInvalid,
        422 => BackendError::RequestRejected,
        401 => BackendError::AuthorizationRejected,
        402 => BackendError::InsufficientBalance,
        404 => BackendError::ModelUnavailable,
        429 => BackendError::RateLimited,
        500 | 503 => BackendError::ServiceUnavailable,
        _ => BackendError::RequestRejected,
    }
}

async fn send(events: &mpsc::Sender<ModelEvent>, event: ModelEvent) -> Result<(), BackendError> {
    events
        .send(event)
        .await
        .map_err(|_| BackendError::EventChannelClosed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::types::{BackendRequestId, ItemId, ToolCallId};
    use crate::backend::{
        BackendMessage, CompletedToolCall, ProviderCompatibility, ToolDefinition, ToolResult,
        UserMessage,
    };

    #[test]
    fn minimum_wire_shape_is_exact_and_tools_are_omitted() {
        let request = BackendRequest {
            request_id: BackendRequestId::new(),
            model: MODEL.into(),
            system_instructions: "system-marker".into(),
            messages: vec![BackendMessage::User(UserMessage {
                item_id: ItemId::new(),
                text: "prompt-marker".into(),
            })],
            tools: vec![],
        };
        let value: serde_json::Value =
            serde_json::from_slice(&encode_request(&request).unwrap()).unwrap();
        assert_eq!(value["model"], MODEL);
        assert_eq!(value["thinking"]["type"], "enabled");
        assert_eq!(value["reasoning_effort"], "high");
        assert_eq!(value["stream_options"]["include_usage"], true);
        assert!(value.get("tools").is_none());
        assert!(value.get("tool_choice").is_none());
    }

    #[test]
    fn replay_preserves_reasoning_call_and_result_identity() {
        let local_call = ToolCallId::new();
        let phase = AssistantPhase {
            item_id: ItemId::new(),
            provider_completion_id: "completion".into(),
            text: None,
            reasoning: Some("reasoning-marker".into()),
            reasoning_required_for_replay: true,
            tool_calls: vec![CompletedToolCall {
                tool_call_id: local_call,
                provider_call_id: "provider-call".into(),
                name: "phase1b_echo".into(),
                arguments: "{\"value\":\"argument-marker\"}".into(),
            }],
            compatibility: ProviderCompatibility {
                model: MODEL.into(),
                system_fingerprint: None,
            },
        };
        let request = BackendRequest {
            request_id: BackendRequestId::new(),
            model: MODEL.into(),
            system_instructions: String::new(),
            messages: vec![
                BackendMessage::Assistant(phase),
                BackendMessage::Tool(ToolResult {
                    tool_call_id: local_call,
                    provider_call_id: "provider-call".into(),
                    output: "result-marker".into(),
                }),
            ],
            tools: vec![ToolDefinition {
                name: "phase1b_echo".into(),
                description: "echo".into(),
                schema: serde_json::json!({"type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":false}),
            }],
        };
        let value: serde_json::Value =
            serde_json::from_slice(&encode_request(&request).unwrap()).unwrap();
        assert_eq!(
            value["messages"][0]["reasoning_content"],
            "reasoning-marker"
        );
        assert_eq!(value["messages"][0]["tool_calls"][0]["id"], "provider-call");
        assert_eq!(value["messages"][1]["tool_call_id"], "provider-call");
        assert_eq!(value["tool_choice"], "auto");
        assert!(!format!("{request:?}").contains("reasoning-marker"));
        assert!(!format!("{request:?}").contains("argument-marker"));
    }

    #[test]
    fn rejects_unqualified_model_and_missing_required_reasoning() {
        let mut request = BackendRequest {
            request_id: BackendRequestId::new(),
            model: "other".into(),
            system_instructions: String::new(),
            messages: vec![BackendMessage::User(UserMessage {
                item_id: ItemId::new(),
                text: "x".into(),
            })],
            tools: vec![],
        };
        assert_eq!(
            encode_request(&request),
            Err(BackendError::ModelUnavailable)
        );
        request.model = MODEL.into();
        request.messages = vec![BackendMessage::Assistant(AssistantPhase {
            item_id: ItemId::new(),
            provider_completion_id: "c".into(),
            text: None,
            reasoning: None,
            reasoning_required_for_replay: true,
            tool_calls: vec![],
            compatibility: ProviderCompatibility {
                model: MODEL.into(),
                system_fingerprint: None,
            },
        })];
        assert!(encode_request(&request).is_err());
    }

    #[test]
    fn documented_statuses_map_without_response_bodies() {
        assert_eq!(classify_status(401), BackendError::AuthorizationRejected);
        assert_eq!(classify_status(402), BackendError::InsufficientBalance);
        assert_eq!(classify_status(429), BackendError::RateLimited);
        assert_eq!(classify_status(500), BackendError::ServiceUnavailable);
        assert_eq!(classify_status(503), BackendError::ServiceUnavailable);
    }
}
