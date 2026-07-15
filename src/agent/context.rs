use std::collections::{HashSet, VecDeque};

use crate::agent::types::{BackendRequestId, ToolCallId};
use crate::backend::strict_json::parse_strict_object;
use crate::backend::{BackendMessage, BackendRequest, ToolDefinition};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ContextLimits {
    pub maximum_messages: usize,
    pub maximum_bytes: usize,
    pub maximum_tool_argument_bytes: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ContextSize {
    pub messages: usize,
    pub bytes: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ContextBuild {
    Fits(BackendRequest),
    TooLarge(ContextSize),
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum ContextError {
    #[error("context contains no messages")]
    Empty,
    #[error("context model/profile changed")]
    ModelChanged,
    #[error("context reasoning required for replay is missing")]
    MissingReasoning,
    #[error("context tool call identity is duplicated")]
    DuplicateCall,
    #[error("context tool arguments are incomplete or invalid")]
    InvalidArguments,
    #[error("context tool result is missing, duplicated, or out of order")]
    InvalidToolResult,
    #[error("context size arithmetic overflowed")]
    SizeOverflow,
}

pub fn build_context(
    request_id: BackendRequestId,
    model: &str,
    system_instructions: String,
    messages: Vec<BackendMessage>,
    tools: Vec<ToolDefinition>,
    limits: ContextLimits,
) -> Result<ContextBuild, ContextError> {
    if messages.is_empty() {
        return Err(ContextError::Empty);
    }
    let mut expected: VecDeque<(ToolCallId, String)> = VecDeque::new();
    let mut provider_calls = HashSet::new();
    let mut local_calls = HashSet::new();
    let mut bytes = system_instructions.len();
    for message in &messages {
        bytes = bytes
            .checked_add(message_bytes(message)?)
            .ok_or(ContextError::SizeOverflow)?;
        match message {
            BackendMessage::User(_) => {
                if !expected.is_empty() {
                    return Err(ContextError::InvalidToolResult);
                }
            }
            BackendMessage::Assistant(phase) => {
                if !expected.is_empty() {
                    return Err(ContextError::InvalidToolResult);
                }
                if phase.compatibility.model != model {
                    return Err(ContextError::ModelChanged);
                }
                if phase.reasoning_required_for_replay && phase.reasoning.is_none() {
                    return Err(ContextError::MissingReasoning);
                }
                for call in &phase.tool_calls {
                    if call.arguments.len() > limits.maximum_tool_argument_bytes
                        || parse_strict_object(
                            &call.arguments,
                            limits.maximum_tool_argument_bytes,
                            32,
                        )
                        .is_err()
                    {
                        return Err(ContextError::InvalidArguments);
                    }
                    if !provider_calls.insert(call.provider_call_id.clone())
                        || !local_calls.insert(call.tool_call_id)
                    {
                        return Err(ContextError::DuplicateCall);
                    }
                    expected.push_back((call.tool_call_id, call.provider_call_id.clone()));
                }
            }
            BackendMessage::Tool(result) => {
                let Some((local, provider)) = expected.pop_front() else {
                    return Err(ContextError::InvalidToolResult);
                };
                if result.tool_call_id != local || result.provider_call_id != provider {
                    return Err(ContextError::InvalidToolResult);
                }
            }
        }
    }
    if !expected.is_empty() {
        return Err(ContextError::InvalidToolResult);
    }
    for tool in &tools {
        bytes = bytes
            .checked_add(tool.name.len())
            .and_then(|value| value.checked_add(tool.description.len()))
            .and_then(|value| {
                serde_json::to_vec(&tool.schema)
                    .ok()
                    .and_then(|schema| value.checked_add(schema.len()))
            })
            .ok_or(ContextError::SizeOverflow)?;
    }
    let size = ContextSize {
        messages: messages.len(),
        bytes,
    };
    if size.messages > limits.maximum_messages || size.bytes > limits.maximum_bytes {
        return Ok(ContextBuild::TooLarge(size));
    }
    Ok(ContextBuild::Fits(BackendRequest {
        request_id,
        model: model.into(),
        system_instructions,
        messages,
        tools,
    }))
}

fn message_bytes(message: &BackendMessage) -> Result<usize, ContextError> {
    let lengths: Vec<usize> = match message {
        BackendMessage::User(user) => vec![user.text.len()],
        BackendMessage::Assistant(phase) => {
            let mut values = vec![
                phase.provider_completion_id.len(),
                phase.compatibility.model.len(),
                phase.text.as_ref().map_or(0, String::len),
                phase.reasoning.as_ref().map_or(0, String::len),
            ];
            for call in &phase.tool_calls {
                values.extend([
                    call.provider_call_id.len(),
                    call.name.len(),
                    call.arguments.len(),
                ]);
            }
            values
        }
        BackendMessage::Tool(result) => vec![result.provider_call_id.len(), result.output.len()],
    };
    lengths.into_iter().try_fold(0_usize, |total, value| {
        total.checked_add(value).ok_or(ContextError::SizeOverflow)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::types::{ItemId, ToolCallId};
    use crate::backend::{
        AssistantPhase, CompletedToolCall, ProviderCompatibility, ToolResult, UserMessage,
    };

    fn limits(bytes: usize) -> ContextLimits {
        ContextLimits {
            maximum_messages: 16,
            maximum_bytes: bytes,
            maximum_tool_argument_bytes: 1024,
        }
    }

    fn phase(model: &str, reasoning: Option<&str>, arguments: &str) -> AssistantPhase {
        AssistantPhase {
            item_id: ItemId::new(),
            provider_completion_id: "completion".into(),
            text: None,
            reasoning: reasoning.map(str::to_owned),
            reasoning_required_for_replay: true,
            tool_calls: vec![CompletedToolCall {
                tool_call_id: ToolCallId::new(),
                provider_call_id: "provider-call".into(),
                name: "phase2_read".into(),
                arguments: arguments.into(),
            }],
            compatibility: ProviderCompatibility {
                model: model.into(),
                system_fingerprint: None,
            },
        }
    }

    #[test]
    fn preserves_complete_reasoning_call_and_result_grouping() {
        let phase = phase("model", Some("reasoning"), "{\"value\":\"ok\"}");
        let call = &phase.tool_calls[0];
        let messages = vec![
            BackendMessage::User(UserMessage {
                item_id: ItemId::new(),
                text: "hi".into(),
            }),
            BackendMessage::Assistant(phase.clone()),
            BackendMessage::Tool(ToolResult {
                tool_call_id: call.tool_call_id,
                provider_call_id: call.provider_call_id.clone(),
                output: "ok".into(),
            }),
        ];
        let built = build_context(
            BackendRequestId::new(),
            "model",
            String::new(),
            messages.clone(),
            vec![],
            limits(4096),
        )
        .unwrap();
        assert!(
            matches!(built, ContextBuild::Fits(BackendRequest { messages: built, .. }) if built == messages)
        );
    }

    #[test]
    fn rejects_model_switch_missing_reasoning_and_invalid_arguments() {
        assert_eq!(
            build_context(
                BackendRequestId::new(),
                "model",
                String::new(),
                vec![BackendMessage::Assistant(phase(
                    "other",
                    Some("reasoning"),
                    "{\"value\":\"ok\"}",
                ))],
                vec![],
                limits(4096),
            ),
            Err(ContextError::ModelChanged)
        );
        assert_eq!(
            build_context(
                BackendRequestId::new(),
                "model",
                String::new(),
                vec![BackendMessage::Assistant(phase(
                    "model",
                    None,
                    "{\"value\":\"ok\"}",
                ))],
                vec![],
                limits(4096),
            ),
            Err(ContextError::MissingReasoning)
        );
        assert_eq!(
            build_context(
                BackendRequestId::new(),
                "model",
                String::new(),
                vec![BackendMessage::Assistant(phase(
                    "model",
                    Some("reasoning"),
                    "{",
                ))],
                vec![],
                limits(4096),
            ),
            Err(ContextError::InvalidArguments)
        );
    }

    #[test]
    fn reports_too_large_without_truncating() {
        let messages = vec![BackendMessage::User(UserMessage {
            item_id: ItemId::new(),
            text: "hello".into(),
        })];
        assert!(matches!(
            build_context(
                BackendRequestId::new(),
                "model",
                String::new(),
                messages,
                vec![],
                limits(4),
            )
            .unwrap(),
            ContextBuild::TooLarge(ContextSize { bytes: 5, .. })
        ));
    }
}
