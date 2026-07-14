use std::collections::HashSet;
use std::sync::Arc;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::agent::types::{BackendRequestId, ItemId};
use crate::backend::profile::MODEL;
use crate::backend::strict_json::parse_strict_object;
use crate::backend::{
    AssistantPhase, BackendError, BackendMessage, BackendRequest, FinishClass, ModelBackend,
    ModelEvent, ToolDefinition, ToolResult, Usage, UserMessage,
};

#[derive(Clone, Debug)]
pub struct TurnOutcome {
    pub phase: AssistantPhase,
    pub usage: Usage,
    pub continuations: usize,
}

pub async fn run_no_tool_turn(
    backend: Arc<dyn ModelBackend>,
    prompt: String,
    cancellation: CancellationToken,
    event_queue: usize,
    on_event: impl FnMut(&ModelEvent),
) -> Result<TurnOutcome, BackendError> {
    let request = BackendRequest {
        request_id: BackendRequestId::new(),
        model: MODEL.into(),
        system_instructions: String::new(),
        messages: vec![BackendMessage::User(UserMessage {
            item_id: ItemId::new(),
            text: prompt,
        })],
        tools: vec![],
    };
    run_response(backend, request, cancellation, event_queue, on_event).await
}

pub async fn run_qualification_tool_turn(
    backend: Arc<dyn ModelBackend>,
    prompt: String,
    cancellation: CancellationToken,
    event_queue: usize,
    mut on_event: impl FnMut(&ModelEvent),
) -> Result<TurnOutcome, BackendError> {
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
                system_instructions: String::new(),
                messages: messages.clone(),
                tools: vec![tool.clone()],
            },
            cancellation.child_token(),
            event_queue,
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
    mut on_event: impl FnMut(&ModelEvent),
) -> Result<TurnOutcome, BackendError> {
    let (sender, mut receiver) = mpsc::channel(event_queue.max(1));
    let child_cancellation = cancellation.child_token();
    let task =
        tokio::spawn(async move { backend.stream(request, sender, child_cancellation).await });
    let mut phase = None;
    let mut usage = None;
    let mut finish = None;
    let mut terminal_error = None;
    while let Some(event) = receiver.recv().await {
        on_event(&event);
        match event {
            ModelEvent::AssistantPhaseCompleted { phase: completed } => phase = Some(completed),
            ModelEvent::UsageUpdated { usage: completed } => usage = Some(completed),
            ModelEvent::ResponseCompleted {
                finish: completed, ..
            } => finish = Some(completed),
            ModelEvent::ResponseIncomplete { .. } | ModelEvent::ResponseFailed { .. } => {
                terminal_error = Some(BackendError::InterruptedAmbiguous);
            }
            ModelEvent::ResponseCancelled { .. } => {
                terminal_error = Some(BackendError::Cancelled);
            }
            _ => {}
        }
    }
    let backend_result = task
        .await
        .map_err(|_| BackendError::InternalInvariantViolation)?;
    if let Some(error) = terminal_error {
        return Err(error);
    }
    backend_result?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::types::ToolCallId;
    use crate::backend::scripted::ScriptedBackend;
    use crate::backend::{CompletedToolCall, ProviderCompatibility};

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
            ModelEvent::AssistantPhaseCompleted { phase },
            ModelEvent::UsageUpdated { usage: usage() },
            ModelEvent::ResponseCompleted {
                provider_completion_id: "c".into(),
                finish,
            },
        ]
    }

    #[tokio::test]
    async fn no_tool_turn_uses_authoritative_phase() {
        let backend = Arc::new(ScriptedBackend::new([script(
            phase(vec![]),
            FinishClass::Stop,
        )]));
        let outcome = run_no_tool_turn(
            backend,
            "prompt".into(),
            CancellationToken::new(),
            8,
            |_| {},
        )
        .await
        .unwrap();
        assert_eq!(outcome.phase.text.as_deref(), Some("done"));
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
            backend,
            "prompt".into(),
            CancellationToken::new(),
            8,
            |_| {},
        )
        .await
        .unwrap();
        assert_eq!(outcome.continuations, 1);
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
}
