use std::collections::BTreeMap;

use serde::Deserialize;

use crate::agent::types::{BackendRequestId, ItemId, ToolCallId};
use crate::backend::profile::MODEL;

use super::{
    AssistantPhase, BackendError, CompletedToolCall, FinishClass, IncompleteReason, ModelEvent,
    ProviderCompatibility, Usage,
};

#[derive(Clone, Debug)]
pub struct SseLimits {
    pub maximum_line_bytes: usize,
    pub maximum_frame_bytes: usize,
    pub maximum_event_count: usize,
    pub maximum_tool_calls: usize,
    pub maximum_field_bytes: usize,
    pub maximum_response_bytes: usize,
}

impl Default for SseLimits {
    fn default() -> Self {
        Self {
            maximum_line_bytes: 256 * 1024,
            maximum_frame_bytes: 512 * 1024,
            maximum_event_count: 100_000,
            maximum_tool_calls: 32,
            maximum_field_bytes: 2 * 1024 * 1024,
            maximum_response_bytes: 16 * 1024 * 1024,
        }
    }
}

#[derive(Default)]
struct ToolSlot {
    provider_call_id: Option<String>,
    kind: Option<String>,
    name: Option<String>,
    arguments: String,
}

pub struct SseDecoder {
    limits: SseLimits,
    request_id: BackendRequestId,
    line: Vec<u8>,
    data_lines: Vec<Vec<u8>>,
    frame_bytes: usize,
    response_bytes: usize,
    event_count: usize,
    started: bool,
    done: bool,
    completion_id: Option<String>,
    model: Option<String>,
    system_fingerprint: Option<String>,
    reasoning: String,
    text: String,
    tools: BTreeMap<u32, ToolSlot>,
    finish: Option<Result<FinishClass, String>>,
    usage: Option<Usage>,
}

impl SseDecoder {
    pub fn new(limits: SseLimits, request_id: BackendRequestId) -> Self {
        Self {
            limits,
            request_id,
            line: Vec::new(),
            data_lines: Vec::new(),
            frame_bytes: 0,
            response_bytes: 0,
            event_count: 0,
            started: false,
            done: false,
            completion_id: None,
            model: None,
            system_fingerprint: None,
            reasoning: String::new(),
            text: String::new(),
            tools: BTreeMap::new(),
            finish: None,
            usage: None,
        }
    }

    pub fn feed(&mut self, bytes: &[u8]) -> Result<Vec<ModelEvent>, BackendError> {
        if self.done && !bytes.is_empty() {
            return Err(protocol("data followed stream terminator"));
        }
        self.response_bytes = self
            .response_bytes
            .checked_add(bytes.len())
            .ok_or_else(|| protocol("response byte count overflow"))?;
        if self.response_bytes > self.limits.maximum_response_bytes {
            return Err(BackendError::SseOversized("response byte limit exceeded"));
        }
        let mut events = Vec::new();
        for &byte in bytes {
            if byte == b'\n' {
                let mut line = std::mem::take(&mut self.line);
                if line.last() == Some(&b'\r') {
                    line.pop();
                }
                events.extend(self.accept_line(&line)?);
            } else {
                self.line.push(byte);
                if self.line.len() > self.limits.maximum_line_bytes {
                    return Err(BackendError::SseOversized("SSE line byte limit exceeded"));
                }
            }
        }
        Ok(events)
    }

    pub fn finish(mut self) -> Result<Vec<ModelEvent>, BackendError> {
        let mut events = Vec::new();
        if !self.line.is_empty() {
            let mut line = std::mem::take(&mut self.line);
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            events.extend(self.accept_line(&line)?);
            events.extend(self.accept_line(b"")?);
        }
        if !self.done {
            return Err(BackendError::StreamEndedEarly);
        }
        Ok(events)
    }

    fn accept_line(&mut self, line: &[u8]) -> Result<Vec<ModelEvent>, BackendError> {
        if line.is_empty() {
            if self.data_lines.is_empty() {
                return Ok(Vec::new());
            }
            let data =
                self.data_lines
                    .iter()
                    .enumerate()
                    .fold(Vec::new(), |mut output, (index, part)| {
                        if index > 0 {
                            output.push(b'\n');
                        }
                        output.extend_from_slice(part);
                        output
                    });
            self.data_lines.clear();
            self.frame_bytes = 0;
            return self.accept_frame(&data);
        }
        if line.starts_with(b":") {
            return Ok(Vec::new());
        }
        let Some(colon) = line.iter().position(|byte| *byte == b':') else {
            return Ok(Vec::new());
        };
        if &line[..colon] != b"data" {
            return Ok(Vec::new());
        }
        let mut value = &line[colon + 1..];
        if value.first() == Some(&b' ') {
            value = &value[1..];
        }
        self.frame_bytes = self
            .frame_bytes
            .checked_add(value.len())
            .ok_or_else(|| protocol("SSE frame byte count overflow"))?;
        if self.frame_bytes > self.limits.maximum_frame_bytes {
            return Err(BackendError::SseOversized("SSE frame byte limit exceeded"));
        }
        self.data_lines.push(value.to_vec());
        Ok(Vec::new())
    }

    fn accept_frame(&mut self, data: &[u8]) -> Result<Vec<ModelEvent>, BackendError> {
        self.event_count = self
            .event_count
            .checked_add(1)
            .ok_or_else(|| protocol("event count overflow"))?;
        if self.event_count > self.limits.maximum_event_count {
            return Err(BackendError::SseOversized("event count limit exceeded"));
        }
        if data == b"[DONE]" {
            return self.complete();
        }
        if self.done {
            return Err(protocol("event followed stream terminator"));
        }
        let chunk: Chunk = serde_json::from_slice(data)
            .map_err(|_| BackendError::SseMalformed("chat completion chunk"))?;
        self.accept_chunk(chunk)
    }

    fn accept_chunk(&mut self, chunk: Chunk) -> Result<Vec<ModelEvent>, BackendError> {
        if let Some(wire_usage) = chunk.usage {
            let usage = wire_usage.into_domain()?;
            if self.usage.as_ref().is_some_and(|prior| prior != &usage) {
                return Err(protocol("conflicting usage chunks"));
            }
            self.usage = Some(usage);
        }
        if chunk.choices.is_empty() {
            if self.usage.is_none() {
                return Err(protocol("empty choices without usage"));
            }
            return Ok(Vec::new());
        }
        if self.finish.is_some() {
            return Err(BackendError::EventIncompatible(
                "semantic chunk followed finish reason",
            ));
        }
        if chunk.choices.len() != 1 || chunk.choices[0].index != 0 {
            return Err(BackendError::ChoiceIncompatible);
        }
        let id = bounded_required(chunk.id, 256, "completion ID")?;
        let model = bounded_required(chunk.model, 256, "model")?;
        if model != MODEL {
            return Err(BackendError::ChoiceIncompatible);
        }
        stable(&mut self.completion_id, id, "completion ID changed")?;
        stable(&mut self.model, model.clone(), "model changed")?;
        if let Some(fingerprint) = chunk.system_fingerprint {
            if fingerprint.len() > 256 {
                return Err(protocol("system fingerprint byte limit exceeded"));
            }
            stable(
                &mut self.system_fingerprint,
                fingerprint,
                "system fingerprint changed",
            )?;
        }
        let mut events = Vec::new();
        if !self.started {
            self.started = true;
            events.push(ModelEvent::ResponseStarted {
                request_id: self.request_id,
                provider_completion_id: self.completion_id.clone(),
                model: model.clone(),
            });
        }
        let choice = chunk
            .choices
            .into_iter()
            .next()
            .ok_or_else(|| protocol("choice missing"))?;
        if let Some(reasoning) = choice.delta.reasoning_content {
            append_bounded(
                &mut self.reasoning,
                &reasoning,
                self.limits.maximum_field_bytes,
                "reasoning",
            )?;
            if !reasoning.is_empty() {
                events.push(ModelEvent::ReasoningDelta { text: reasoning });
            }
        }
        if let Some(text) = choice.delta.content {
            append_bounded(
                &mut self.text,
                &text,
                self.limits.maximum_field_bytes,
                "assistant text",
            )?;
            if !text.is_empty() {
                events.push(ModelEvent::TextDelta { text });
            }
        }
        for call in choice.delta.tool_calls {
            if usize::try_from(call.index).map_err(|_| protocol("tool index overflow"))?
                >= self.limits.maximum_tool_calls
            {
                return Err(protocol("tool call limit exceeded"));
            }
            let slot = self.tools.entry(call.index).or_default();
            if let Some(id) = call.id {
                stable(&mut slot.provider_call_id, id, "tool call ID changed")?;
            }
            if let Some(kind) = call.kind {
                stable(&mut slot.kind, kind, "tool call type changed")?;
            }
            if let Some(function) = call.function {
                if let Some(name) = function.name {
                    stable(&mut slot.name, name, "tool call name changed")?;
                }
                if let Some(arguments) = function.arguments {
                    append_bounded(
                        &mut slot.arguments,
                        &arguments,
                        self.limits.maximum_field_bytes,
                        "tool arguments",
                    )?;
                    events.push(ModelEvent::ToolCallArgumentsDelta {
                        tool_index: call.index,
                        provider_call_id: slot.provider_call_id.clone(),
                        name: slot.name.clone(),
                        bytes: arguments.into_bytes(),
                    });
                }
            }
        }
        if let Some(reason) = choice.finish_reason {
            if self.finish.is_some() {
                return Err(protocol("duplicate finish reason"));
            }
            self.finish = Some(match reason.as_str() {
                "stop" => Ok(FinishClass::Stop),
                "tool_calls" => Ok(FinishClass::ToolCalls),
                "length" | "content_filter" | "insufficient_system_resource" => Err(reason),
                _ => return Err(BackendError::FinishReasonMissing),
            });
        }
        Ok(events)
    }

    fn complete(&mut self) -> Result<Vec<ModelEvent>, BackendError> {
        if self.done {
            return Err(protocol("duplicate [DONE]"));
        }
        self.done = true;
        let finish = self
            .finish
            .clone()
            .ok_or(BackendError::FinishReasonMissing)?;
        if let Err(reason) = finish {
            let reason = match reason.as_str() {
                "length" => IncompleteReason::Length,
                "content_filter" => IncompleteReason::ContentFiltered,
                "insufficient_system_resource" => IncompleteReason::InsufficientSystemResource,
                _ => return Err(BackendError::FinishReasonMissing),
            };
            return Ok(vec![ModelEvent::ResponseIncomplete { reason }]);
        }
        let finish = finish.map_err(|_| protocol("finish mapping failed"))?;
        let completion_id = self
            .completion_id
            .clone()
            .ok_or_else(|| protocol("completion ID missing"))?;
        let model = self
            .model
            .clone()
            .ok_or_else(|| protocol("model missing"))?;
        let usage = self
            .usage
            .clone()
            .ok_or_else(|| protocol("terminal usage chunk missing"))?;
        if finish == FinishClass::Stop && !self.tools.is_empty() {
            return Err(protocol("stop finish contained tool calls"));
        }
        let mut calls = Vec::new();
        let mut provider_call_ids = std::collections::HashSet::new();
        if finish == FinishClass::ToolCalls {
            if self.tools.is_empty() {
                return Err(protocol("tool finish contained no calls"));
            }
            for (expected, (index, slot)) in self.tools.iter().enumerate() {
                if usize::try_from(*index).ok() != Some(expected) {
                    return Err(protocol("tool indices are not contiguous"));
                }
                if slot.kind.as_deref() != Some("function") {
                    return Err(protocol("unsupported tool call type"));
                }
                let provider_call_id = slot
                    .provider_call_id
                    .clone()
                    .ok_or_else(|| protocol("tool call ID missing"))?;
                let name = slot
                    .name
                    .clone()
                    .ok_or_else(|| protocol("tool call name missing"))?;
                if provider_call_id.is_empty() || name.is_empty() {
                    return Err(protocol("tool call identity is empty"));
                }
                if provider_call_id.len() > 256 || name.len() > 256 {
                    return Err(protocol("tool call identity byte limit exceeded"));
                }
                if !provider_call_ids.insert(provider_call_id.clone()) {
                    return Err(protocol("duplicate provider tool call identity"));
                }
                calls.push(CompletedToolCall {
                    tool_call_id: ToolCallId::new(),
                    provider_call_id,
                    name,
                    arguments: slot.arguments.clone(),
                });
            }
        }
        let phase = AssistantPhase {
            item_id: ItemId::new(),
            provider_completion_id: completion_id.clone(),
            text: (!self.text.is_empty()).then(|| self.text.clone()),
            reasoning: (!self.reasoning.is_empty()).then(|| self.reasoning.clone()),
            reasoning_required_for_replay: !calls.is_empty(),
            tool_calls: calls,
            compatibility: ProviderCompatibility {
                model,
                system_fingerprint: self.system_fingerprint.clone(),
            },
        };
        Ok(vec![
            ModelEvent::AssistantPhaseCompleted { phase },
            ModelEvent::UsageUpdated { usage },
            ModelEvent::ResponseCompleted {
                request_id: self.request_id,
                provider_completion_id: completion_id,
                model: self
                    .model
                    .clone()
                    .ok_or_else(|| protocol("model missing"))?,
                finish,
            },
        ])
    }
}

#[derive(Deserialize)]
struct Chunk {
    id: Option<String>,
    model: Option<String>,
    system_fingerprint: Option<String>,
    #[serde(default)]
    choices: Vec<Choice>,
    usage: Option<WireUsage>,
}

#[derive(Deserialize)]
struct Choice {
    index: u32,
    #[serde(default)]
    delta: Delta,
    finish_reason: Option<String>,
}

#[derive(Default, Deserialize)]
struct Delta {
    content: Option<String>,
    reasoning_content: Option<String>,
    #[serde(default)]
    tool_calls: Vec<WireToolCall>,
}

#[derive(Deserialize)]
struct WireToolCall {
    index: u32,
    id: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    function: Option<WireFunction>,
}

#[derive(Deserialize)]
struct WireFunction {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Deserialize)]
struct WireUsage {
    prompt_tokens: Option<u64>,
    prompt_cache_hit_tokens: Option<u64>,
    prompt_cache_miss_tokens: Option<u64>,
    completion_tokens: Option<u64>,
    total_tokens: Option<u64>,
    completion_tokens_details: Option<CompletionDetails>,
}

#[derive(Deserialize)]
struct CompletionDetails {
    reasoning_tokens: Option<u64>,
}

impl WireUsage {
    fn into_domain(self) -> Result<Usage, BackendError> {
        if let (Some(total), Some(prompt), Some(output)) = (
            self.total_tokens,
            self.prompt_tokens,
            self.completion_tokens,
        ) && prompt.checked_add(output) != Some(total)
        {
            return Err(protocol("usage totals are inconsistent"));
        }
        if let (Some(prompt), Some(cache_hit), Some(cache_miss)) = (
            self.prompt_tokens,
            self.prompt_cache_hit_tokens,
            self.prompt_cache_miss_tokens,
        ) && cache_hit.checked_add(cache_miss) != Some(prompt)
        {
            return Err(protocol("usage cache totals are inconsistent"));
        }
        let reasoning_tokens = self
            .completion_tokens_details
            .and_then(|details| details.reasoning_tokens);
        if let (Some(reasoning), Some(completion)) = (reasoning_tokens, self.completion_tokens)
            && reasoning > completion
        {
            return Err(protocol("usage reasoning tokens are inconsistent"));
        }
        Ok(Usage {
            prompt_tokens: self.prompt_tokens,
            cache_hit_tokens: self.prompt_cache_hit_tokens,
            cache_miss_tokens: self.prompt_cache_miss_tokens,
            output_tokens: self.completion_tokens,
            reasoning_tokens,
            total_tokens: self.total_tokens,
        })
    }
}

fn protocol(message: &'static str) -> BackendError {
    BackendError::EventIncompatible(message)
}

fn stable(
    slot: &mut Option<String>,
    value: String,
    message: &'static str,
) -> Result<(), BackendError> {
    if slot.as_ref().is_some_and(|prior| prior != &value) {
        return Err(protocol(message));
    }
    if slot.is_none() {
        *slot = Some(value);
    }
    Ok(())
}

fn bounded_required(
    value: Option<String>,
    limit: usize,
    name: &'static str,
) -> Result<String, BackendError> {
    let value = value.ok_or_else(|| protocol("required chunk identity missing"))?;
    if value.is_empty() || value.len() > limit {
        return Err(match name {
            "model" => protocol("model identity invalid"),
            _ => protocol("completion identity invalid"),
        });
    }
    Ok(value)
}

fn append_bounded(
    target: &mut String,
    value: &str,
    limit: usize,
    name: &'static str,
) -> Result<(), BackendError> {
    let length = target
        .len()
        .checked_add(value.len())
        .ok_or_else(|| protocol("field byte count overflow"))?;
    if length > limit {
        return Err(match name {
            "reasoning" => protocol("reasoning byte limit exceeded"),
            "assistant text" => protocol("assistant text byte limit exceeded"),
            _ => protocol("tool argument byte limit exceeded"),
        });
    }
    target.push_str(value);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decoder() -> SseDecoder {
        SseDecoder::new(SseLimits::default(), BackendRequestId::new())
    }

    fn successful_fixture() -> Vec<u8> {
        concat!(
            ": keep-alive\r\n\r\n",
            "data: {\"id\":\"completion\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"r\"},\"finish_reason\":null}]}\r\n\r\n",
            "data: {\"id\":\"completion\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hé\"},\"finish_reason\":\"stop\"}]}\r\n\r\n",
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"prompt_cache_hit_tokens\":1,\"prompt_cache_miss_tokens\":1,\"completion_tokens\":1,\"total_tokens\":3,\"completion_tokens_details\":{\"reasoning_tokens\":1}}}\r\n\r\n",
            "data: [DONE]\r\n\r\n"
        ).as_bytes().to_vec()
    }

    #[test]
    fn one_byte_fragmentation_crlf_reasoning_usage_and_done() {
        let mut decoder = decoder();
        let mut events = Vec::new();
        for byte in successful_fixture() {
            events.extend(decoder.feed(&[byte]).unwrap());
        }
        decoder.finish().unwrap();
        assert!(
            events
                .iter()
                .any(|event| matches!(event, ModelEvent::ReasoningDelta { text } if text == "r"))
        );
        assert!(events.iter().any(|event| matches!(event, ModelEvent::AssistantPhaseCompleted { phase } if phase.text.as_deref() == Some("hé"))));
        assert!(matches!(
            events.last(),
            Some(ModelEvent::ResponseCompleted {
                finish: FinishClass::Stop,
                ..
            })
        ));
    }

    #[test]
    fn accepts_terminal_usage_on_the_finished_choice_chunk() {
        let fixture = concat!(
            "data: {\"id\":\"c\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"ok\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":2,\"prompt_cache_hit_tokens\":0,\"prompt_cache_miss_tokens\":2,\"completion_tokens\":1,\"total_tokens\":3}}\n\n",
            "data: [DONE]\n\n"
        );
        let mut decoder = decoder();
        let events = decoder.feed(fixture.as_bytes()).unwrap();
        decoder.finish().unwrap();
        assert!(events.iter().any(|event| matches!(
            event,
            ModelEvent::UsageUpdated {
                usage: Usage {
                    total_tokens: Some(3),
                    ..
                }
            }
        )));
    }

    #[test]
    fn tool_calls_assemble_by_index_only_after_done() {
        let fixture = concat!(
            "data: {\"id\":\"c\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"r\",\"tool_calls\":[{\"index\":0,\"id\":\"call\",\"type\":\"function\",\"function\":{\"name\":\"phase1b_echo\",\"arguments\":\"{\\\"value\\\":\"}}]},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"c\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"ok\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n",
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1,\"total_tokens\":2}}\n\n",
            "data: [DONE]\n\n"
        );
        let mut decoder = decoder();
        let events = decoder.feed(fixture.as_bytes()).unwrap();
        decoder.finish().unwrap();
        let phase = events
            .into_iter()
            .find_map(|event| match event {
                ModelEvent::AssistantPhaseCompleted { phase } => Some(phase),
                _ => None,
            })
            .unwrap();
        assert_eq!(phase.tool_calls.len(), 1);
        assert!(phase.reasoning_required_for_replay);
    }

    #[test]
    fn malformed_terminal_and_limits_fail_closed() {
        let mut done_decoder = decoder();
        assert!(done_decoder.feed(b"data: [DONE]\n\n").is_err());
        let mut oversized_decoder = SseDecoder::new(
            SseLimits {
                maximum_line_bytes: 4,
                ..SseLimits::default()
            },
            BackendRequestId::new(),
        );
        assert!(oversized_decoder.feed(b"12345").is_err());
        let mut decoder = decoder();
        decoder.feed(b"data: {\"id\":\"c\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n").unwrap();
        assert!(decoder.finish().is_err());
    }

    #[test]
    fn incompatible_choice_model_finish_and_usage_are_rejected() {
        for frame in [
            "data: {\"id\":\"c\",\"model\":\"other\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"c\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":1,\"delta\":{},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"c\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"future\"}]}\n\n",
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":2,\"total_tokens\":3}}\n\n",
        ] {
            assert!(decoder().feed(frame.as_bytes()).is_err());
        }
    }

    #[test]
    fn semantic_deltas_after_finish_are_rejected() {
        for fixture in [
            concat!(
                "data: {\"id\":\"c\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call\",\"type\":\"function\",\"function\":{\"name\":\"phase1b_echo\",\"arguments\":\"{\\\"value\\\":\\\"one\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":1,\"prompt_cache_hit_tokens\":0,\"prompt_cache_miss_tokens\":1,\"completion_tokens\":1,\"total_tokens\":2}}\n\n",
                "data: {\"id\":\"c\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"extra\"}}]},\"finish_reason\":null}]}\n\n",
            ),
            concat!(
                "data: {\"id\":\"c\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"done\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":1,\"prompt_cache_hit_tokens\":0,\"prompt_cache_miss_tokens\":1,\"completion_tokens\":1,\"total_tokens\":2}}\n\n",
                "data: {\"id\":\"c\",\"model\":\"deepseek-v4-flash\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"late\"},\"finish_reason\":null}]}\n\n",
            ),
        ] {
            assert!(decoder().feed(fixture.as_bytes()).is_err());
        }
    }

    #[test]
    fn inconsistent_cache_and_reasoning_usage_are_rejected() {
        for frame in [
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":3,\"prompt_cache_hit_tokens\":1,\"prompt_cache_miss_tokens\":1,\"completion_tokens\":1,\"total_tokens\":4}}\n\n",
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1,\"total_tokens\":2,\"completion_tokens_details\":{\"reasoning_tokens\":2}}}\n\n",
        ] {
            assert!(decoder().feed(frame.as_bytes()).is_err());
        }
    }
}
