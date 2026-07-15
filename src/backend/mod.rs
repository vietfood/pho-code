pub mod deepseek;
pub mod profile;
pub mod scripted;
pub mod sse;
pub mod strict_json;

use std::future::Future;
use std::pin::Pin;

use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::agent::types::{BackendRequestId, ItemId, ToolCallId};

#[derive(Clone, Deserialize, Eq, PartialEq, Serialize)]
pub struct BackendRequest {
    pub request_id: BackendRequestId,
    pub model: String,
    pub system_instructions: String,
    pub messages: Vec<BackendMessage>,
    pub tools: Vec<ToolDefinition>,
}

impl std::fmt::Debug for BackendRequest {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("BackendRequest")
            .field("request_id", &self.request_id)
            .field("model", &self.model)
            .field("instructions_bytes", &self.system_instructions.len())
            .field("messages", &self.messages.len())
            .field("tools", &self.tools.len())
            .finish()
    }
}

#[derive(Clone, Deserialize, Eq, PartialEq, Serialize)]
pub enum BackendMessage {
    User(UserMessage),
    Assistant(AssistantPhase),
    Tool(ToolResult),
}

impl std::fmt::Debug for BackendMessage {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::User(value) => value.fmt(formatter),
            Self::Assistant(value) => value.fmt(formatter),
            Self::Tool(value) => value.fmt(formatter),
        }
    }
}

#[derive(Clone, Deserialize, Eq, PartialEq, Serialize)]
pub struct UserMessage {
    pub item_id: ItemId,
    pub text: String,
}

impl std::fmt::Debug for UserMessage {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("UserMessage")
            .field("item_id", &self.item_id)
            .field("text_bytes", &self.text.len())
            .finish()
    }
}

#[derive(Clone, Deserialize, Eq, PartialEq, Serialize)]
pub struct AssistantPhase {
    pub item_id: ItemId,
    pub provider_completion_id: String,
    pub text: Option<String>,
    pub reasoning: Option<String>,
    pub reasoning_required_for_replay: bool,
    pub tool_calls: Vec<CompletedToolCall>,
    pub compatibility: ProviderCompatibility,
}

impl std::fmt::Debug for AssistantPhase {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("AssistantPhase")
            .field("item_id", &self.item_id)
            .field("provider_completion_id", &self.provider_completion_id)
            .field("text_bytes", &self.text.as_ref().map(String::len))
            .field("reasoning", &self.reasoning.as_ref().map(|_| "[REDACTED]"))
            .field(
                "reasoning_required_for_replay",
                &self.reasoning_required_for_replay,
            )
            .field("tool_calls", &self.tool_calls.len())
            .field("compatibility", &self.compatibility)
            .finish()
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ProviderCompatibility {
    pub model: String,
    pub system_fingerprint: Option<String>,
}

#[derive(Clone, Deserialize, Eq, PartialEq, Serialize)]
pub struct CompletedToolCall {
    pub tool_call_id: ToolCallId,
    pub provider_call_id: String,
    pub name: String,
    pub arguments: String,
}

impl std::fmt::Debug for CompletedToolCall {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("CompletedToolCall")
            .field("tool_call_id", &self.tool_call_id)
            .field("provider_call_id", &self.provider_call_id)
            .field("name", &self.name)
            .field("argument_bytes", &self.arguments.len())
            .finish()
    }
}

#[derive(Clone, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolResult {
    pub tool_call_id: ToolCallId,
    pub provider_call_id: String,
    pub output: String,
}

impl std::fmt::Debug for ToolResult {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ToolResult")
            .field("tool_call_id", &self.tool_call_id)
            .field("provider_call_id", &self.provider_call_id)
            .field("output_bytes", &self.output.len())
            .finish()
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub schema: serde_json::Value,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Usage {
    pub prompt_tokens: Option<u64>,
    pub cache_hit_tokens: Option<u64>,
    pub cache_miss_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub reasoning_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
}

impl Usage {
    pub fn checked_add(&self, other: &Self) -> Option<Self> {
        fn add(left: Option<u64>, right: Option<u64>) -> Option<Option<u64>> {
            match (left, right) {
                (Some(left), Some(right)) => left.checked_add(right).map(Some),
                _ => Some(None),
            }
        }

        Some(Self {
            prompt_tokens: add(self.prompt_tokens, other.prompt_tokens)?,
            cache_hit_tokens: add(self.cache_hit_tokens, other.cache_hit_tokens)?,
            cache_miss_tokens: add(self.cache_miss_tokens, other.cache_miss_tokens)?,
            output_tokens: add(self.output_tokens, other.output_tokens)?,
            reasoning_tokens: add(self.reasoning_tokens, other.reasoning_tokens)?,
            total_tokens: add(self.total_tokens, other.total_tokens)?,
        })
    }
}

#[derive(Clone, Deserialize, Eq, PartialEq, Serialize)]
pub enum ModelEvent {
    ResponseStarted {
        request_id: BackendRequestId,
        provider_completion_id: Option<String>,
        model: String,
    },
    ReasoningDelta {
        text: String,
    },
    TextDelta {
        text: String,
    },
    ToolCallArgumentsDelta {
        tool_index: u32,
        provider_call_id: Option<String>,
        name: Option<String>,
        bytes: Vec<u8>,
    },
    AssistantPhaseCompleted {
        phase: AssistantPhase,
    },
    UsageUpdated {
        usage: Usage,
    },
    ResponseCompleted {
        request_id: BackendRequestId,
        provider_completion_id: String,
        model: String,
        finish: FinishClass,
    },
    ResponseIncomplete {
        reason: IncompleteReason,
    },
    ResponseFailed {
        code: String,
    },
    ResponseCancelled {
        stage: CancellationStage,
        transport_terminated: bool,
    },
    OptionalExtension {
        name: String,
    },
    RequiredExtension {
        name: String,
    },
}

impl std::fmt::Debug for ModelEvent {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            Self::ResponseStarted { .. } => "ResponseStarted",
            Self::ReasoningDelta { .. } => "ReasoningDelta([REDACTED])",
            Self::TextDelta { .. } => "TextDelta([REDACTED])",
            Self::ToolCallArgumentsDelta { .. } => "ToolCallArgumentsDelta([REDACTED])",
            Self::AssistantPhaseCompleted { .. } => "AssistantPhaseCompleted([REDACTED])",
            Self::UsageUpdated { .. } => "UsageUpdated",
            Self::ResponseCompleted { .. } => "ResponseCompleted",
            Self::ResponseIncomplete { .. } => "ResponseIncomplete",
            Self::ResponseFailed { .. } => "ResponseFailed",
            Self::ResponseCancelled { .. } => "ResponseCancelled",
            Self::OptionalExtension { .. } => "OptionalExtension",
            Self::RequiredExtension { .. } => "RequiredExtension",
        };
        formatter.write_str(name)
    }
}

impl ModelEvent {
    pub(crate) fn bind_request_identity(&mut self, request_id: BackendRequestId, model: &str) {
        match self {
            Self::ResponseStarted {
                request_id: event_request_id,
                model: event_model,
                ..
            }
            | Self::ResponseCompleted {
                request_id: event_request_id,
                model: event_model,
                ..
            } => {
                *event_request_id = request_id;
                *event_model = model.into();
            }
            _ => {}
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum FinishClass {
    Stop,
    ToolCalls,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum IncompleteReason {
    Length,
    ContentFiltered,
    InsufficientSystemResource,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum CancellationStage {
    BeforeHeaders,
    BeforeFirstEvent,
    AfterStreamStarted,
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum BackendError {
    #[error("backend request was cancelled")]
    Cancelled,
    #[error("backend event channel closed")]
    EventChannelClosed,
    #[error("backend script was exhausted")]
    ScriptExhausted,
    #[error("backend protocol failed: {0}")]
    Protocol(&'static str),
    #[error("backend transport failed: {0}")]
    Transport(&'static str),
    #[error("request delivery is unknown")]
    DeliveryUnknown,
    #[error("backend authorization was rejected")]
    AuthorizationRejected,
    #[error("backend account has insufficient balance")]
    InsufficientBalance,
    #[error("selected model is unavailable")]
    ModelUnavailable,
    #[error("backend rejected the request")]
    RequestRejected,
    #[error("backend request is invalid")]
    RequestInvalid,
    #[error("backend rate limit was reached")]
    RateLimited,
    #[error("backend service is unavailable")]
    ServiceUnavailable,
    #[error("backend stream timed out")]
    StreamTimedOut,
    #[error("backend stream ended ambiguously")]
    InterruptedAmbiguous,
    #[error("backend output stopped at the configured length")]
    OutputLimit,
    #[error("backend filtered the response")]
    ContentFiltered,
    #[error("backend generation was interrupted by insufficient system resources")]
    ResourceInterrupted,
    #[error("backend cancellation was not acknowledged by transport termination")]
    CancellationUnacknowledged,
    #[error("backend SSE was malformed: {0}")]
    SseMalformed(&'static str),
    #[error("backend SSE exceeded a bound: {0}")]
    SseOversized(&'static str),
    #[error("backend stream ended before authoritative completion")]
    StreamEndedEarly,
    #[error("backend response choice is incompatible")]
    ChoiceIncompatible,
    #[error("backend finish reason is missing or incompatible")]
    FinishReasonMissing,
    #[error("backend event is incompatible: {0}")]
    EventIncompatible(&'static str),
    #[error("backend replay state is missing or inconsistent")]
    ReplayStateMissing,
    #[error("backend internal invariant failed")]
    InternalInvariantViolation,
}

pub trait ModelBackend: Send + Sync {
    fn stream<'a>(
        &'a self,
        request: BackendRequest,
        events: mpsc::Sender<ModelEvent>,
        cancellation: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<(), BackendError>> + Send + 'a>>;
}
