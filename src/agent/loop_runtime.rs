use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::agent::context::{ContextBuild, ContextError, ContextLimits, build_context};
use crate::agent::instructions::AgentInstructionProfile;
use crate::agent::types::{ApprovalId, BackendRequestId, ItemId, ToolCallId, ToolStatus, TurnId};
use crate::backend::profile::MODEL;
use crate::backend::strict_json::parse_strict_object;
use crate::backend::{
    AssistantPhase, BackendError, BackendMessage, BackendRequest, FinishClass, IncompleteReason,
    ModelBackend, ModelEvent, ToolDefinition, ToolResult, Usage, UserMessage,
};
use crate::tools::{
    ApprovalDecision, ApprovalPolicy, ApprovalRequest, ApprovalResponse, PreparedTool, ToolError,
    ToolRuntime,
};

#[derive(Clone, Debug)]
pub struct TurnOutcome {
    pub phase: AssistantPhase,
    pub usage: Usage,
    pub continuations: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LimitKind {
    BackendEventQueue,
    CanonicalEventQueue,
    PresentationEventQueue,
    ContextBytes,
    ModelContinuations,
    ToolCalls,
    ToolArgumentBytes,
    ToolResultBytes,
    PendingApprovals,
    TurnDuration,
}

#[derive(Clone, Copy, Debug)]
pub struct AgentLimits {
    pub maximum_context_bytes: usize,
    pub maximum_context_messages: usize,
    pub maximum_model_continuations: usize,
    pub maximum_tool_calls: usize,
    pub maximum_tool_argument_bytes: usize,
    pub maximum_tool_result_bytes: usize,
    pub maximum_pending_approvals: usize,
    pub turn_timeout: Duration,
}

#[derive(Clone)]
pub enum AgentEvent {
    Model(ModelEvent),
    ToolValidated {
        tool_call_id: ToolCallId,
        name: String,
        mutating: bool,
    },
    ApprovalRequested(ApprovalRequest),
    ApprovalResolved(ApprovalResponse),
    ToolStarted {
        tool_call_id: ToolCallId,
        name: String,
    },
    ToolCompleted {
        tool_call_id: ToolCallId,
        name: String,
        output: String,
        executed: bool,
        status: ToolStatus,
    },
    ContinuationStarted {
        index: usize,
    },
    UsageAccumulated {
        usage: Usage,
    },
    LimitReached {
        limit: LimitKind,
    },
}

impl std::fmt::Debug for AgentEvent {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Model(_) => "Model([REDACTED])",
            Self::ToolValidated { .. } => "ToolValidated",
            Self::ApprovalRequested(_) => "ApprovalRequested",
            Self::ApprovalResolved(_) => "ApprovalResolved",
            Self::ToolStarted { .. } => "ToolStarted",
            Self::ToolCompleted { .. } => "ToolCompleted([REDACTED])",
            Self::ContinuationStarted { .. } => "ContinuationStarted",
            Self::UsageAccumulated { .. } => "UsageAccumulated",
            Self::LimitReached { .. } => "LimitReached",
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum AgentError {
    #[error(transparent)]
    Backend(#[from] BackendError),
    #[error(transparent)]
    Context(#[from] ContextError),
    #[error(transparent)]
    Tool(#[from] ToolError),
    #[error("approval response did not match the pending effect")]
    StaleApproval,
    #[error("tool outcome is uncertain")]
    ToolOutcomeUncertain,
    #[error("agent limit reached: {0:?}")]
    Limit(LimitKind),
}

pub async fn run_no_tool_turn(
    backend: Arc<dyn ModelBackend>,
    prompt: String,
    cancellation: CancellationToken,
    event_queue: usize,
    on_event: impl FnMut(&ModelEvent),
) -> Result<TurnOutcome, BackendError> {
    run_no_tool_turn_with_profile(
        backend,
        prompt,
        AgentInstructionProfile::built_in(),
        cancellation,
        event_queue,
        on_event,
    )
    .await
}

pub async fn run_no_tool_turn_with_profile(
    backend: Arc<dyn ModelBackend>,
    prompt: String,
    instruction_profile: AgentInstructionProfile,
    cancellation: CancellationToken,
    event_queue: usize,
    on_event: impl FnMut(&ModelEvent),
) -> Result<TurnOutcome, BackendError> {
    let request = BackendRequest {
        request_id: BackendRequestId::new(),
        model: MODEL.into(),
        system_instructions: instruction_profile.system_instructions().into(),
        messages: vec![BackendMessage::User(UserMessage {
            item_id: ItemId::new(),
            text: prompt,
        })],
        tools: vec![],
    };
    run_response(backend, request, cancellation, event_queue, None, on_event).await
}

#[allow(clippy::too_many_arguments)]
pub async fn run_agent_turn(
    backend: Arc<dyn ModelBackend>,
    tools: Arc<dyn ToolRuntime>,
    approvals: Arc<dyn ApprovalPolicy>,
    turn_id: TurnId,
    prompt: String,
    cancellation: CancellationToken,
    event_queue: usize,
    limits: AgentLimits,
    on_event: impl FnMut(&AgentEvent),
) -> Result<TurnOutcome, AgentError> {
    run_agent_turn_with_profile(
        backend,
        tools,
        approvals,
        turn_id,
        prompt,
        AgentInstructionProfile::built_in(),
        cancellation,
        event_queue,
        limits,
        on_event,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn run_agent_turn_with_profile(
    backend: Arc<dyn ModelBackend>,
    tools: Arc<dyn ToolRuntime>,
    approvals: Arc<dyn ApprovalPolicy>,
    turn_id: TurnId,
    prompt: String,
    instruction_profile: AgentInstructionProfile,
    cancellation: CancellationToken,
    event_queue: usize,
    limits: AgentLimits,
    mut on_event: impl FnMut(&AgentEvent),
) -> Result<TurnOutcome, AgentError> {
    let deadline = tokio::time::Instant::now() + limits.turn_timeout;
    let definitions = tools.definitions();
    let mut messages = vec![BackendMessage::User(UserMessage {
        item_id: ItemId::new(),
        text: prompt,
    })];
    let mut executed_provider_calls = HashSet::new();
    let mut total_calls = 0_usize;
    let mut continuations = 0_usize;
    let mut accumulated_usage: Option<Usage> = None;
    loop {
        if cancellation.is_cancelled() {
            return Err(AgentError::Backend(BackendError::Cancelled));
        }
        let request = match build_context(
            BackendRequestId::new(),
            MODEL,
            instruction_profile.system_instructions().into(),
            messages.clone(),
            definitions.clone(),
            ContextLimits {
                maximum_messages: limits.maximum_context_messages,
                maximum_bytes: limits.maximum_context_bytes,
                maximum_tool_argument_bytes: limits.maximum_tool_argument_bytes,
            },
        )? {
            ContextBuild::Fits(request) => request,
            ContextBuild::TooLarge(_) => {
                on_event(&AgentEvent::LimitReached {
                    limit: LimitKind::ContextBytes,
                });
                return Err(AgentError::Limit(LimitKind::ContextBytes));
            }
        };
        let outcome = run_response(
            backend.clone(),
            request,
            cancellation.child_token(),
            event_queue,
            Some(deadline),
            |event| {
                if !matches!(event, ModelEvent::UsageUpdated { .. }) {
                    on_event(&AgentEvent::Model(event.clone()));
                }
            },
        )
        .await
        .map_err(|error| {
            if error == BackendError::StreamTimedOut {
                on_event(&AgentEvent::LimitReached {
                    limit: LimitKind::TurnDuration,
                });
                AgentError::Limit(LimitKind::TurnDuration)
            } else {
                AgentError::Backend(error)
            }
        })?;
        let usage = match accumulated_usage.take() {
            Some(accumulated) => {
                accumulated
                    .checked_add(&outcome.usage)
                    .ok_or(AgentError::Backend(
                        BackendError::InternalInvariantViolation,
                    ))?
            }
            None => outcome.usage.clone(),
        };
        on_event(&AgentEvent::UsageAccumulated {
            usage: usage.clone(),
        });
        accumulated_usage = Some(usage.clone());
        if outcome.phase.tool_calls.is_empty() {
            return Ok(TurnOutcome {
                usage,
                continuations,
                ..outcome
            });
        }
        if continuations == limits.maximum_model_continuations {
            on_event(&AgentEvent::LimitReached {
                limit: LimitKind::ModelContinuations,
            });
            return Err(AgentError::Limit(LimitKind::ModelContinuations));
        }
        total_calls = total_calls
            .checked_add(outcome.phase.tool_calls.len())
            .ok_or(AgentError::Limit(LimitKind::ToolCalls))?;
        if total_calls > limits.maximum_tool_calls {
            on_event(&AgentEvent::LimitReached {
                limit: LimitKind::ToolCalls,
            });
            return Err(AgentError::Limit(LimitKind::ToolCalls));
        }

        let mut prepared = Vec::with_capacity(outcome.phase.tool_calls.len());
        for call in &outcome.phase.tool_calls {
            if call.arguments.len() > limits.maximum_tool_argument_bytes {
                on_event(&AgentEvent::LimitReached {
                    limit: LimitKind::ToolArgumentBytes,
                });
                return Err(AgentError::Limit(LimitKind::ToolArgumentBytes));
            }
            if !executed_provider_calls.insert(call.provider_call_id.clone()) {
                return Err(AgentError::Tool(ToolError::AlreadyExecuted));
            }
            let candidate = tokio::select! {
                _ = cancellation.cancelled() => {
                    return Err(AgentError::Backend(BackendError::Cancelled));
                }
                candidate = tools.prepare(call, cancellation.child_token()) => candidate,
            };
            let candidate = match candidate {
                Ok(candidate) => candidate,
                Err(error @ (ToolError::InvalidArguments | ToolError::Unavailable)) => {
                    PreparedTool::rejected(call, error)
                }
                Err(ToolError::Cancelled) => {
                    return Err(AgentError::Backend(BackendError::Cancelled));
                }
                Err(error) => return Err(AgentError::Tool(error)),
            };
            if candidate.maximum_result_bytes > limits.maximum_tool_result_bytes {
                on_event(&AgentEvent::LimitReached {
                    limit: LimitKind::ToolResultBytes,
                });
                return Err(AgentError::Limit(LimitKind::ToolResultBytes));
            }
            on_event(&AgentEvent::ToolValidated {
                tool_call_id: candidate.tool_call_id,
                name: candidate.name.clone(),
                mutating: candidate.mutating,
            });
            prepared.push(candidate);
        }

        messages.push(BackendMessage::Assistant(outcome.phase));
        for candidate in prepared {
            if cancellation.is_cancelled() {
                return Err(AgentError::Backend(BackendError::Cancelled));
            }
            let (execution, executed) = if candidate.mutating {
                if limits.maximum_pending_approvals == 0 {
                    on_event(&AgentEvent::LimitReached {
                        limit: LimitKind::PendingApprovals,
                    });
                    return Err(AgentError::Limit(LimitKind::PendingApprovals));
                }
                let request = ApprovalRequest {
                    turn_id,
                    approval_id: ApprovalId::new(),
                    tool_call_id: candidate.tool_call_id,
                    effect_digest: candidate.effect_digest.clone(),
                    summary: candidate.summary.clone(),
                };
                on_event(&AgentEvent::ApprovalRequested(request.clone()));
                let response = tokio::select! {
                    _ = cancellation.cancelled() => {
                        return Err(AgentError::Backend(BackendError::Cancelled));
                    }
                    response = approvals.decide(&request, cancellation.child_token()) => response,
                };
                if response.turn_id != request.turn_id
                    || response.approval_id != request.approval_id
                    || response.tool_call_id != request.tool_call_id
                    || response.effect_digest != request.effect_digest
                {
                    return Err(AgentError::StaleApproval);
                }
                on_event(&AgentEvent::ApprovalResolved(response.clone()));
                match response.decision {
                    ApprovalDecision::Approved => {
                        on_event(&AgentEvent::ToolStarted {
                            tool_call_id: candidate.tool_call_id,
                            name: candidate.name.clone(),
                        });
                        let execution = tools
                            .execute(&candidate, turn_id, cancellation.child_token())
                            .await
                            .map_err(|error| match error {
                                ToolError::Cancelled => {
                                    AgentError::Backend(BackendError::Cancelled)
                                }
                                error => AgentError::Tool(error),
                            })?;
                        (execution, true)
                    }
                    ApprovalDecision::Denied => (
                        crate::tools::ToolExecution {
                            output: r#"{"status":"denied","code":"approval_denied"}"#.into(),
                            status: ToolStatus::Denied,
                        },
                        false,
                    ),
                    ApprovalDecision::Unavailable => (
                        crate::tools::ToolExecution {
                            output: r#"{"status":"denied","code":"approval_unavailable"}"#.into(),
                            status: ToolStatus::Denied,
                        },
                        false,
                    ),
                }
            } else {
                on_event(&AgentEvent::ToolStarted {
                    tool_call_id: candidate.tool_call_id,
                    name: candidate.name.clone(),
                });
                let execution = tools
                    .execute(&candidate, turn_id, cancellation.child_token())
                    .await
                    .map_err(|error| match error {
                        ToolError::Cancelled => AgentError::Backend(BackendError::Cancelled),
                        error => AgentError::Tool(error),
                    })?;
                (execution, true)
            };
            if execution.output.len() > limits.maximum_tool_result_bytes {
                on_event(&AgentEvent::LimitReached {
                    limit: LimitKind::ToolResultBytes,
                });
                return Err(AgentError::Limit(LimitKind::ToolResultBytes));
            }
            on_event(&AgentEvent::ToolCompleted {
                tool_call_id: candidate.tool_call_id,
                name: candidate.name.clone(),
                output: execution.output.clone(),
                executed,
                status: execution.status,
            });
            messages.push(BackendMessage::Tool(ToolResult {
                tool_call_id: candidate.tool_call_id,
                provider_call_id: candidate.provider_call_id,
                output: execution.output,
            }));
            if execution.status == ToolStatus::Cancelled {
                return Err(AgentError::Backend(BackendError::Cancelled));
            }
            if execution.status == ToolStatus::Uncertain {
                return Err(AgentError::ToolOutcomeUncertain);
            }
        }
        continuations += 1;
        on_event(&AgentEvent::ContinuationStarted {
            index: continuations,
        });
    }
}

pub async fn run_qualification_tool_turn(
    backend: Arc<dyn ModelBackend>,
    prompt: String,
    cancellation: CancellationToken,
    event_queue: usize,
    mut on_event: impl FnMut(&ModelEvent),
) -> Result<TurnOutcome, BackendError> {
    let instruction_profile = AgentInstructionProfile::built_in();
    let tool = ToolDefinition {
        name: "phase1b_echo".into(),
        description: "Return a supplied short string unchanged.".into(),
        schema: serde_json::json!({"type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":false}),
    };
    let mut messages = vec![BackendMessage::User(UserMessage {
        item_id: ItemId::new(),
        text: prompt,
    })];
    let mut used = HashSet::new();
    for continuation in 0..=4 {
        let outcome = run_response(
            backend.clone(),
            BackendRequest {
                request_id: BackendRequestId::new(),
                model: MODEL.into(),
                system_instructions: instruction_profile.system_instructions().into(),
                messages: messages.clone(),
                tools: vec![tool.clone()],
            },
            cancellation.child_token(),
            event_queue,
            None,
            &mut on_event,
        )
        .await?;
        if outcome.phase.tool_calls.is_empty() {
            return Ok(TurnOutcome {
                continuations: continuation,
                ..outcome
            });
        }
        let phase = outcome.phase;
        messages.push(BackendMessage::Assistant(phase.clone()));
        for call in &phase.tool_calls {
            if call.name != "phase1b_echo" || !used.insert(call.provider_call_id.clone()) {
                return Err(BackendError::Protocol(
                    "qualification tool identity is invalid",
                ));
            }
            let value = parse_strict_object(&call.arguments, 64 * 1024, 16)
                .map_err(|_| BackendError::Protocol("qualification tool arguments are invalid"))?;
            let object = value.as_object().ok_or(BackendError::Protocol(
                "qualification tool arguments are invalid",
            ))?;
            if object.len() != 1 {
                return Err(BackendError::Protocol(
                    "qualification tool schema rejected arguments",
                ));
            }
            let echoed = object
                .get("value")
                .and_then(serde_json::Value::as_str)
                .filter(|text| text.len() <= 4096)
                .ok_or(BackendError::Protocol(
                    "qualification tool schema rejected arguments",
                ))?;
            messages.push(BackendMessage::Tool(ToolResult {
                tool_call_id: call.tool_call_id,
                provider_call_id: call.provider_call_id.clone(),
                output: echoed.into(),
            }));
        }
    }
    Err(BackendError::Protocol("model continuation limit exceeded"))
}

async fn run_response(
    backend: Arc<dyn ModelBackend>,
    request: BackendRequest,
    cancellation: CancellationToken,
    event_queue: usize,
    deadline: Option<tokio::time::Instant>,
    mut on_event: impl FnMut(&ModelEvent),
) -> Result<TurnOutcome, BackendError> {
    let (sender, mut receiver) = mpsc::channel(event_queue.max(1));
    let child_cancellation = cancellation.child_token();
    let expected_request_id = request.request_id;
    let expected_model = request.model.clone();
    let mut task = Some(tokio::spawn(async move {
        backend.stream(request, sender, child_cancellation).await
    }));
    let mut phase = None;
    let mut usage = None;
    let mut finish = None;
    let mut terminal_error = None;
    let mut terminal_seen = false;
    let mut semantic_seen = false;
    let mut response_started = false;
    let mut provider_completion_id: Option<String> = None;
    loop {
        let next = if let Some(deadline) = deadline {
            tokio::select! {
                value = receiver.recv() => value,
                _ = tokio::time::sleep_until(deadline) => {
                    abort_backend(&cancellation, &mut receiver, &mut task).await;
                    return Err(BackendError::StreamTimedOut);
                }
            }
        } else {
            receiver.recv().await
        };
        let Some(event) = next else { break };
        if terminal_seen {
            abort_backend(&cancellation, &mut receiver, &mut task).await;
            return Err(BackendError::Protocol("event followed terminal response"));
        }
        match &event {
            ModelEvent::ResponseStarted {
                request_id,
                provider_completion_id: started_id,
                model,
            } => {
                if response_started
                    || *request_id != expected_request_id
                    || model != &expected_model
                {
                    abort_backend(&cancellation, &mut receiver, &mut task).await;
                    return Err(BackendError::EventIncompatible(
                        "response start identity is incompatible",
                    ));
                }
                response_started = true;
                provider_completion_id = started_id.clone();
            }
            ModelEvent::ReasoningDelta { .. }
            | ModelEvent::TextDelta { .. }
            | ModelEvent::ToolCallArgumentsDelta { .. }
            | ModelEvent::AssistantPhaseCompleted { .. }
            | ModelEvent::UsageUpdated { .. }
            | ModelEvent::ResponseCompleted { .. }
            | ModelEvent::ResponseIncomplete { .. }
                if !response_started =>
            {
                abort_backend(&cancellation, &mut receiver, &mut task).await;
                return Err(BackendError::EventIncompatible(
                    "response event preceded response start",
                ));
            }
            _ => {}
        }
        if let ModelEvent::AssistantPhaseCompleted { phase: completed } = &event {
            if completed.compatibility.model != expected_model
                || provider_completion_id
                    .as_ref()
                    .is_some_and(|id| id != &completed.provider_completion_id)
            {
                abort_backend(&cancellation, &mut receiver, &mut task).await;
                return Err(BackendError::ChoiceIncompatible);
            }
            provider_completion_id = Some(completed.provider_completion_id.clone());
        }
        if let ModelEvent::ResponseCompleted {
            request_id,
            provider_completion_id: completed_id,
            model,
            ..
        } = &event
            && (*request_id != expected_request_id
                || model != &expected_model
                || provider_completion_id
                    .as_ref()
                    .is_some_and(|id| id != completed_id))
        {
            abort_backend(&cancellation, &mut receiver, &mut task).await;
            return Err(BackendError::ChoiceIncompatible);
        }
        on_event(&event);
        match event {
            ModelEvent::ResponseStarted { .. } => {}
            ModelEvent::ReasoningDelta { .. }
            | ModelEvent::TextDelta { .. }
            | ModelEvent::ToolCallArgumentsDelta { .. } => semantic_seen = true,
            ModelEvent::AssistantPhaseCompleted { phase: completed } => {
                semantic_seen = true;
                if phase.replace(completed).is_some() {
                    abort_backend(&cancellation, &mut receiver, &mut task).await;
                    return Err(BackendError::Protocol(
                        "duplicate completed assistant phase",
                    ));
                }
            }
            ModelEvent::UsageUpdated { usage: completed } => {
                if usage.replace(completed).is_some() {
                    abort_backend(&cancellation, &mut receiver, &mut task).await;
                    return Err(BackendError::Protocol("duplicate terminal usage"));
                }
            }
            ModelEvent::ResponseCompleted {
                finish: completed, ..
            } => {
                terminal_seen = true;
                finish = Some(completed);
            }
            ModelEvent::ResponseIncomplete { reason } => {
                terminal_seen = true;
                terminal_error = Some(match reason {
                    IncompleteReason::Length => BackendError::OutputLimit,
                    IncompleteReason::ContentFiltered => BackendError::ContentFiltered,
                    IncompleteReason::InsufficientSystemResource => {
                        BackendError::ResourceInterrupted
                    }
                });
            }
            ModelEvent::ResponseFailed { .. } => {
                terminal_seen = true;
                terminal_error = Some(if semantic_seen {
                    BackendError::InterruptedAmbiguous
                } else {
                    BackendError::DeliveryUnknown
                });
            }
            ModelEvent::ResponseCancelled {
                transport_terminated,
                ..
            } => {
                terminal_seen = true;
                terminal_error = Some(if transport_terminated {
                    BackendError::Cancelled
                } else {
                    BackendError::CancellationUnacknowledged
                });
            }
            ModelEvent::OptionalExtension { .. } => {}
            ModelEvent::RequiredExtension { .. } => {
                abort_backend(&cancellation, &mut receiver, &mut task).await;
                return Err(BackendError::EventIncompatible(
                    "required backend event is incompatible",
                ));
            }
        }
    }
    let backend_result = task
        .take()
        .ok_or(BackendError::InternalInvariantViolation)?
        .await
        .map_err(|_| BackendError::InternalInvariantViolation)?;
    if let Some(error) = terminal_error {
        return Err(error);
    }
    if let Err(error) = backend_result {
        return Err(if semantic_seen && error != BackendError::Cancelled {
            BackendError::InterruptedAmbiguous
        } else {
            error
        });
    }
    let phase = phase.ok_or(BackendError::Protocol("completed assistant phase missing"))?;
    let usage = usage.ok_or(BackendError::Protocol("terminal usage missing"))?;
    let finish = finish.ok_or(BackendError::Protocol("terminal response missing"))?;
    if (finish == FinishClass::Stop) != phase.tool_calls.is_empty() {
        return Err(BackendError::Protocol(
            "finish class and assistant phase disagree",
        ));
    }
    Ok(TurnOutcome {
        phase,
        usage,
        continuations: 0,
    })
}

async fn abort_backend(
    cancellation: &CancellationToken,
    receiver: &mut mpsc::Receiver<ModelEvent>,
    task: &mut Option<tokio::task::JoinHandle<Result<(), BackendError>>>,
) {
    cancellation.cancel();
    receiver.close();
    if let Some(task) = task.take() {
        let _ = task.await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::types::ToolCallId;
    use crate::backend::scripted::ScriptedBackend;
    use crate::backend::{BackendRequest, CompletedToolCall, ModelBackend, ProviderCompatibility};
    use crate::tools::{ApprovalDecision, ScriptedToolRuntime, StaticApprovalPolicy};
    use std::future::Future;
    use std::pin::Pin;

    struct MismatchedIdentityBackend;

    impl ModelBackend for MismatchedIdentityBackend {
        fn stream<'a>(
            &'a self,
            _: BackendRequest,
            events: mpsc::Sender<ModelEvent>,
            _: CancellationToken,
        ) -> Pin<Box<dyn Future<Output = Result<(), BackendError>> + Send + 'a>> {
            Box::pin(async move {
                events
                    .send(ModelEvent::ResponseStarted {
                        request_id: BackendRequestId::new(),
                        provider_completion_id: Some("wrong".into()),
                        model: "wrong-model".into(),
                    })
                    .await
                    .map_err(|_| BackendError::EventChannelClosed)
            })
        }
    }

    fn usage() -> Usage {
        Usage {
            prompt_tokens: Some(1),
            cache_hit_tokens: Some(0),
            cache_miss_tokens: Some(1),
            output_tokens: Some(1),
            reasoning_tokens: Some(1),
            total_tokens: Some(2),
        }
    }
    fn phase(calls: Vec<CompletedToolCall>) -> AssistantPhase {
        AssistantPhase {
            item_id: ItemId::new(),
            provider_completion_id: "c".into(),
            text: calls.is_empty().then(|| "done".into()),
            reasoning: Some("sensitive".into()),
            reasoning_required_for_replay: !calls.is_empty(),
            tool_calls: calls,
            compatibility: ProviderCompatibility {
                model: MODEL.into(),
                system_fingerprint: None,
            },
        }
    }
    fn script(phase: AssistantPhase, finish: FinishClass) -> Vec<ModelEvent> {
        vec![
            ModelEvent::ResponseStarted {
                request_id: BackendRequestId::new(),
                provider_completion_id: Some("c".into()),
                model: MODEL.into(),
            },
            ModelEvent::AssistantPhaseCompleted { phase },
            ModelEvent::UsageUpdated { usage: usage() },
            ModelEvent::ResponseCompleted {
                request_id: BackendRequestId::new(),
                provider_completion_id: "c".into(),
                model: MODEL.into(),
                finish,
            },
        ]
    }

    fn limits() -> AgentLimits {
        AgentLimits {
            maximum_context_bytes: 1024 * 1024,
            maximum_context_messages: 64,
            maximum_model_continuations: 4,
            maximum_tool_calls: 8,
            maximum_tool_argument_bytes: 4096,
            maximum_tool_result_bytes: 4096,
            maximum_pending_approvals: 1,
            turn_timeout: Duration::from_secs(2),
        }
    }

    fn phase2_call(name: &str, id: &str) -> CompletedToolCall {
        CompletedToolCall {
            tool_call_id: ToolCallId::new(),
            provider_call_id: id.into(),
            name: name.into(),
            arguments: "{\"value\":\"ok\"}".into(),
        }
    }

    #[tokio::test]
    async fn no_tool_turn_uses_authoritative_phase() {
        let backend = Arc::new(ScriptedBackend::new([script(
            phase(vec![]),
            FinishClass::Stop,
        )]));
        let outcome = run_no_tool_turn(
            backend.clone(),
            "prompt".into(),
            CancellationToken::new(),
            8,
            |_| {},
        )
        .await
        .unwrap();
        assert_eq!(outcome.phase.text.as_deref(), Some("done"));
        let requests = backend.request_snapshot().unwrap();
        assert_eq!(requests.len(), 1);
        assert_eq!(
            requests[0].system_instructions,
            AgentInstructionProfile::built_in().system_instructions()
        );
    }

    #[tokio::test]
    async fn tool_continuation_replays_and_finishes() {
        let call = CompletedToolCall {
            tool_call_id: ToolCallId::new(),
            provider_call_id: "call".into(),
            name: "phase1b_echo".into(),
            arguments: "{\"value\":\"ok\"}".into(),
        };
        let backend = Arc::new(ScriptedBackend::new([
            script(phase(vec![call]), FinishClass::ToolCalls),
            script(phase(vec![]), FinishClass::Stop),
        ]));
        let outcome = run_qualification_tool_turn(
            backend.clone(),
            "prompt".into(),
            CancellationToken::new(),
            8,
            |_| {},
        )
        .await
        .unwrap();
        assert_eq!(outcome.continuations, 1);
        let instructions = AgentInstructionProfile::built_in();
        assert!(
            backend.request_snapshot().unwrap().iter().all(|request| {
                request.system_instructions == instructions.system_instructions()
            })
        );
    }

    #[tokio::test]
    async fn qualification_tool_rejects_invalid_json_without_continuing() {
        let call = CompletedToolCall {
            tool_call_id: ToolCallId::new(),
            provider_call_id: "call".into(),
            name: "phase1b_echo".into(),
            arguments: "{\"value\":1,\"value\":2}".into(),
        };
        let backend = Arc::new(ScriptedBackend::new([script(
            phase(vec![call]),
            FinishClass::ToolCalls,
        )]));
        let result = run_qualification_tool_turn(
            backend,
            "prompt".into(),
            CancellationToken::new(),
            8,
            |_| {},
        )
        .await;
        assert!(matches!(result, Err(BackendError::Protocol(_))));
    }

    #[tokio::test]
    async fn general_loop_replays_read_only_result_and_schema() {
        let backend = Arc::new(ScriptedBackend::new([
            script(
                phase(vec![phase2_call("phase2_read", "read-call")]),
                FinishClass::ToolCalls,
            ),
            script(phase(vec![]), FinishClass::Stop),
        ]));
        let tools = Arc::new(ScriptedToolRuntime::default());
        let outcome = run_agent_turn(
            backend.clone(),
            tools.clone(),
            Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Unavailable)),
            TurnId::new(),
            "prompt".into(),
            CancellationToken::new(),
            8,
            limits(),
            |_| {},
        )
        .await
        .unwrap();
        assert_eq!(outcome.continuations, 1);
        assert_eq!(tools.executed_count(), 1);
        let requests = backend.request_snapshot().unwrap();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].tools.len(), 2);
        let instructions = AgentInstructionProfile::built_in();
        assert!(
            requests.iter().all(|request| {
                request.system_instructions == instructions.system_instructions()
            })
        );
        assert!(
            matches!(requests[1].messages.as_slice(), [BackendMessage::User(_), BackendMessage::Assistant(AssistantPhase { reasoning_required_for_replay: true, .. }), BackendMessage::Tool(ToolResult { output, .. })] if output == "read:ok")
        );
    }

    #[tokio::test]
    async fn multiple_calls_execute_sequentially_and_malformed_call_executes_nothing() {
        let first = phase2_call("phase2_read", "first");
        let second = phase2_call("phase2_read", "second");
        let backend = Arc::new(ScriptedBackend::new([
            script(phase(vec![first, second]), FinishClass::ToolCalls),
            script(phase(vec![]), FinishClass::Stop),
        ]));
        let tools = Arc::new(ScriptedToolRuntime::default());
        run_agent_turn(
            backend.clone(),
            tools.clone(),
            Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Approved)),
            TurnId::new(),
            "prompt".into(),
            CancellationToken::new(),
            1,
            limits(),
            |_| {},
        )
        .await
        .unwrap();
        assert_eq!(tools.executed_count(), 2);
        let requests = backend.request_snapshot().unwrap();
        let results: Vec<_> = requests[1]
            .messages
            .iter()
            .filter_map(|message| match message {
                BackendMessage::Tool(result) => Some(result.provider_call_id.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(results, ["first", "second"]);

        let mut malformed = phase2_call("phase2_read", "malformed");
        malformed.arguments = "{\"value\":1}".into();
        let tools = Arc::new(ScriptedToolRuntime::default());
        let malformed_backend = Arc::new(ScriptedBackend::new([
            script(phase(vec![malformed]), FinishClass::ToolCalls),
            script(phase(vec![]), FinishClass::Stop),
        ]));
        let result = run_agent_turn(
            malformed_backend.clone(),
            tools.clone(),
            Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Approved)),
            TurnId::new(),
            "prompt".into(),
            CancellationToken::new(),
            1,
            limits(),
            |_| {},
        )
        .await
        .unwrap();
        assert_eq!(result.continuations, 1);
        assert_eq!(tools.executed_count(), 0);
        let requests = malformed_backend.request_snapshot().unwrap();
        let output = requests[1]
            .messages
            .iter()
            .find_map(|message| match message {
                BackendMessage::Tool(result) => Some(result.output.as_str()),
                _ => None,
            })
            .unwrap();
        assert_eq!(
            output,
            r#"{"status":"failed","code":"tool_arguments_invalid"}"#
        );
    }

    #[tokio::test]
    async fn backend_failure_classifies_delivery_before_and_after_semantic_events() {
        use crate::backend::scripted::{ScriptedResponse, ScriptedStep};

        let before = Arc::new(ScriptedBackend::from_responses([ScriptedResponse::new([
            ScriptedStep::Fail(BackendError::Transport("fixture")),
        ])]));
        assert!(matches!(
            run_no_tool_turn(before, "prompt".into(), CancellationToken::new(), 1, |_| {}).await,
            Err(BackendError::Transport("fixture"))
        ));

        let after = Arc::new(ScriptedBackend::from_responses([ScriptedResponse::new([
            ScriptedStep::Emit(ModelEvent::ResponseStarted {
                request_id: BackendRequestId::new(),
                provider_completion_id: Some("c".into()),
                model: MODEL.into(),
            }),
            ScriptedStep::Emit(ModelEvent::TextDelta {
                text: "partial".into(),
            }),
            ScriptedStep::Fail(BackendError::Transport("fixture")),
        ])]));
        assert!(matches!(
            run_no_tool_turn(after, "prompt".into(), CancellationToken::new(), 1, |_| {}).await,
            Err(BackendError::InterruptedAmbiguous)
        ));
    }

    #[tokio::test]
    async fn mutating_tool_requires_bound_approval_and_denial_does_not_execute() {
        for (decision, expected_executions) in [
            (ApprovalDecision::Approved, 1),
            (ApprovalDecision::Denied, 0),
            (ApprovalDecision::Unavailable, 0),
        ] {
            let backend = Arc::new(ScriptedBackend::new([
                script(
                    phase(vec![phase2_call("phase2_mutate", "mutate-call")]),
                    FinishClass::ToolCalls,
                ),
                script(phase(vec![]), FinishClass::Stop),
            ]));
            let tools = Arc::new(ScriptedToolRuntime::default());
            run_agent_turn(
                backend,
                tools.clone(),
                Arc::new(StaticApprovalPolicy::new(decision)),
                TurnId::new(),
                "prompt".into(),
                CancellationToken::new(),
                8,
                limits(),
                |_| {},
            )
            .await
            .unwrap();
            assert_eq!(tools.executed_count(), expected_executions);
        }
    }

    #[tokio::test]
    async fn limits_stop_before_new_effect_or_continuation() {
        let backend = Arc::new(ScriptedBackend::new([script(
            phase(vec![phase2_call("phase2_read", "read-call")]),
            FinishClass::ToolCalls,
        )]));
        let tools = Arc::new(ScriptedToolRuntime::default());
        let mut constrained = limits();
        constrained.maximum_model_continuations = 0;
        let result = run_agent_turn(
            backend.clone(),
            tools.clone(),
            Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Approved)),
            TurnId::new(),
            "prompt".into(),
            CancellationToken::new(),
            8,
            constrained,
            |_| {},
        )
        .await;
        assert!(matches!(
            result,
            Err(AgentError::Limit(LimitKind::ModelContinuations))
        ));
        assert_eq!(tools.executed_count(), 0);
        assert_eq!(backend.request_snapshot().unwrap().len(), 1);
    }

    async fn run_single_call_with_limits(
        call: CompletedToolCall,
        limits: AgentLimits,
    ) -> (Result<TurnOutcome, AgentError>, Arc<ScriptedToolRuntime>) {
        let backend = Arc::new(ScriptedBackend::new([script(
            phase(vec![call]),
            FinishClass::ToolCalls,
        )]));
        let tools = Arc::new(ScriptedToolRuntime::default());
        let result = run_agent_turn(
            backend,
            tools.clone(),
            Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Approved)),
            TurnId::new(),
            "prompt".into(),
            CancellationToken::new(),
            8,
            limits,
            |_| {},
        )
        .await;
        (result, tools)
    }

    #[tokio::test]
    async fn each_pre_effect_limit_fails_without_execution() {
        let mut tool_count = limits();
        tool_count.maximum_tool_calls = 0;
        let (result, tools) =
            run_single_call_with_limits(phase2_call("phase2_read", "count"), tool_count).await;
        assert!(matches!(
            result,
            Err(AgentError::Limit(LimitKind::ToolCalls))
        ));
        assert_eq!(tools.executed_count(), 0);

        let mut arguments = limits();
        arguments.maximum_tool_argument_bytes = 4;
        let (result, tools) =
            run_single_call_with_limits(phase2_call("phase2_read", "args"), arguments).await;
        assert!(matches!(
            result,
            Err(AgentError::Limit(LimitKind::ToolArgumentBytes))
        ));
        assert_eq!(tools.executed_count(), 0);

        let mut result_bytes = limits();
        result_bytes.maximum_tool_result_bytes = 3;
        let (result, tools) =
            run_single_call_with_limits(phase2_call("phase2_read", "result"), result_bytes).await;
        assert!(matches!(
            result,
            Err(AgentError::Limit(LimitKind::ToolResultBytes))
        ));
        assert_eq!(tools.executed_count(), 0);

        let mut approvals = limits();
        approvals.maximum_pending_approvals = 0;
        let (result, tools) =
            run_single_call_with_limits(phase2_call("phase2_mutate", "approval"), approvals).await;
        assert!(matches!(
            result,
            Err(AgentError::Limit(LimitKind::PendingApprovals))
        ));
        assert_eq!(tools.executed_count(), 0);
    }

    #[tokio::test]
    async fn context_limit_stops_before_first_request() {
        let backend = Arc::new(ScriptedBackend::empty());
        let mut constrained = limits();
        constrained.maximum_context_bytes = 1;
        let result = run_agent_turn(
            backend.clone(),
            Arc::new(ScriptedToolRuntime::default()),
            Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Approved)),
            TurnId::new(),
            "prompt".into(),
            CancellationToken::new(),
            8,
            constrained,
            |_| {},
        )
        .await;
        assert!(matches!(
            result,
            Err(AgentError::Limit(LimitKind::ContextBytes))
        ));
        assert!(backend.request_snapshot().unwrap().is_empty());
    }

    #[tokio::test]
    async fn optional_event_is_ignored_but_required_or_late_event_fails() {
        let optional = Arc::new(ScriptedBackend::new([{
            let mut events = vec![ModelEvent::OptionalExtension {
                name: "future-metadata".into(),
            }];
            events.extend(script(phase(vec![]), FinishClass::Stop));
            events
        }]));
        assert!(
            run_no_tool_turn(
                optional,
                "prompt".into(),
                CancellationToken::new(),
                8,
                |_| {}
            )
            .await
            .is_ok()
        );

        let required = Arc::new(ScriptedBackend::new([vec![
            ModelEvent::RequiredExtension {
                name: "future-required".into(),
            },
        ]]));
        assert!(matches!(
            run_no_tool_turn(
                required,
                "prompt".into(),
                CancellationToken::new(),
                8,
                |_| {}
            )
            .await,
            Err(BackendError::EventIncompatible(_))
        ));

        let late = Arc::new(ScriptedBackend::new([{
            let mut events = script(phase(vec![]), FinishClass::Stop);
            events.push(ModelEvent::TextDelta {
                text: "late".into(),
            });
            events
        }]));
        assert!(matches!(
            run_no_tool_turn(late, "prompt".into(), CancellationToken::new(), 8, |_| {}).await,
            Err(BackendError::Protocol("event followed terminal response"))
        ));
    }

    struct PendingApproval;

    impl ApprovalPolicy for PendingApproval {
        fn decide<'a>(
            &'a self,
            _: &'a ApprovalRequest,
            _: CancellationToken,
        ) -> Pin<Box<dyn Future<Output = ApprovalResponse> + Send + 'a>> {
            Box::pin(std::future::pending())
        }
    }

    #[tokio::test]
    async fn cancellation_during_approval_wait_stops_before_execution() {
        let backend = Arc::new(ScriptedBackend::new([script(
            phase(vec![phase2_call("phase2_mutate", "mutating-call")]),
            FinishClass::ToolCalls,
        )]));
        let tools = Arc::new(ScriptedToolRuntime::default());
        let cancellation = CancellationToken::new();
        let cancel_from_event = cancellation.clone();
        let result = run_agent_turn(
            backend,
            tools.clone(),
            Arc::new(PendingApproval),
            TurnId::new(),
            "prompt".into(),
            cancellation,
            8,
            limits(),
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
        assert_eq!(tools.executed_count(), 0);
    }

    #[tokio::test]
    async fn cancellation_requires_transport_acknowledgement() {
        let backend = Arc::new(ScriptedBackend::new([vec![
            ModelEvent::ResponseCancelled {
                stage: crate::backend::CancellationStage::BeforeFirstEvent,
                transport_terminated: false,
            },
        ]]));
        assert!(matches!(
            run_no_tool_turn(
                backend,
                "prompt".into(),
                CancellationToken::new(),
                8,
                |_| {}
            )
            .await,
            Err(BackendError::CancellationUnacknowledged)
        ));
    }

    #[tokio::test]
    async fn usage_accumulates_across_continuations() {
        let backend = Arc::new(ScriptedBackend::new([
            script(
                phase(vec![phase2_call("phase2_read", "read-call")]),
                FinishClass::ToolCalls,
            ),
            script(phase(vec![]), FinishClass::Stop),
        ]));
        let mut observed = Vec::new();
        let outcome = run_agent_turn(
            backend,
            Arc::new(ScriptedToolRuntime::default()),
            Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Denied)),
            TurnId::new(),
            "prompt".into(),
            CancellationToken::new(),
            8,
            limits(),
            |event| {
                if let AgentEvent::UsageAccumulated { usage } = event {
                    observed.push(usage.total_tokens);
                }
            },
        )
        .await
        .unwrap();
        assert_eq!(observed, [Some(2), Some(4)]);
        assert_eq!(outcome.usage.total_tokens, Some(4));
    }

    #[tokio::test]
    async fn incomplete_responses_never_dispatch_tools() {
        for (reason, expected) in [
            (IncompleteReason::Length, BackendError::OutputLimit),
            (
                IncompleteReason::ContentFiltered,
                BackendError::ContentFiltered,
            ),
            (
                IncompleteReason::InsufficientSystemResource,
                BackendError::ResourceInterrupted,
            ),
        ] {
            let backend = Arc::new(ScriptedBackend::new([vec![
                ModelEvent::ResponseStarted {
                    request_id: BackendRequestId::new(),
                    provider_completion_id: Some("c".into()),
                    model: MODEL.into(),
                },
                ModelEvent::ToolCallArgumentsDelta {
                    tool_index: 0,
                    provider_call_id: Some("partial-call".into()),
                    name: Some("phase2_read".into()),
                    bytes: b"{\"value\":".to_vec(),
                },
                ModelEvent::ResponseIncomplete { reason },
            ]]));
            let tools = Arc::new(ScriptedToolRuntime::default());
            let result = run_agent_turn(
                backend,
                tools.clone(),
                Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Approved)),
                TurnId::new(),
                "prompt".into(),
                CancellationToken::new(),
                8,
                limits(),
                |_| {},
            )
            .await;
            assert!(matches!(result, Err(AgentError::Backend(error)) if error == expected));
            assert_eq!(tools.executed_count(), 0);
        }
    }

    #[tokio::test]
    async fn response_start_must_match_the_local_request_identity_and_model() {
        assert!(matches!(
            run_no_tool_turn(
                Arc::new(MismatchedIdentityBackend),
                "prompt".into(),
                CancellationToken::new(),
                8,
                |_| {},
            )
            .await,
            Err(BackendError::EventIncompatible(_))
        ));
    }
}
