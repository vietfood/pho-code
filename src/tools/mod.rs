pub mod output;
pub mod patch;
pub mod read;
pub mod search;
pub mod shell;

use std::collections::HashSet;
use std::future::Future;
use std::pin::Pin;
use std::sync::Mutex;

use sha2::{Digest as _, Sha256};

use crate::agent::types::{ApprovalId, ToolCallId, TurnId};
use crate::backend::strict_json::parse_strict_object;
use crate::backend::{CompletedToolCall, ToolDefinition};

pub trait ArtifactWriter: Send + Sync {
    fn write(
        &self,
        request: output::ArtifactRequest,
    ) -> Result<crate::agent::types::ArtifactId, &'static str>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApprovalDecision {
    Approved,
    Denied,
    Unavailable,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApprovalRequest {
    pub turn_id: TurnId,
    pub approval_id: ApprovalId,
    pub tool_call_id: ToolCallId,
    pub effect_digest: String,
    pub summary: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApprovalResponse {
    pub turn_id: TurnId,
    pub approval_id: ApprovalId,
    pub tool_call_id: ToolCallId,
    pub effect_digest: String,
    pub decision: ApprovalDecision,
}

pub trait ApprovalPolicy: Send + Sync {
    fn decide<'a>(
        &'a self,
        request: &'a ApprovalRequest,
    ) -> Pin<Box<dyn Future<Output = ApprovalResponse> + Send + 'a>>;
}

pub struct StaticApprovalPolicy {
    decision: ApprovalDecision,
}

impl StaticApprovalPolicy {
    pub fn new(decision: ApprovalDecision) -> Self {
        Self { decision }
    }
}

impl ApprovalPolicy for StaticApprovalPolicy {
    fn decide<'a>(
        &'a self,
        request: &'a ApprovalRequest,
    ) -> Pin<Box<dyn Future<Output = ApprovalResponse> + Send + 'a>> {
        Box::pin(async move {
            ApprovalResponse {
                turn_id: request.turn_id,
                approval_id: request.approval_id,
                tool_call_id: request.tool_call_id,
                effect_digest: request.effect_digest.clone(),
                decision: self.decision,
            }
        })
    }
}

#[derive(Clone, Debug)]
pub struct PreparedTool {
    pub tool_call_id: ToolCallId,
    pub provider_call_id: String,
    pub name: String,
    pub output: String,
    pub mutating: bool,
    pub effect_digest: String,
    pub summary: String,
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum ToolError {
    #[error("tool is unavailable")]
    Unavailable,
    #[error("tool arguments failed strict validation")]
    InvalidArguments,
    #[error("tool call was already executed")]
    AlreadyExecuted,
}

pub trait ToolRuntime: Send + Sync {
    fn definitions(&self) -> Vec<ToolDefinition>;
    fn prepare(&self, call: &CompletedToolCall) -> Result<PreparedTool, ToolError>;
    fn execute(&self, prepared: &PreparedTool) -> Result<String, ToolError>;
}

pub struct NoToolRuntime;

impl ToolRuntime for NoToolRuntime {
    fn definitions(&self) -> Vec<ToolDefinition> {
        Vec::new()
    }

    fn prepare(&self, _: &CompletedToolCall) -> Result<PreparedTool, ToolError> {
        Err(ToolError::Unavailable)
    }

    fn execute(&self, _: &PreparedTool) -> Result<String, ToolError> {
        Err(ToolError::Unavailable)
    }
}

/// Phase 3's fixed, process-local qualification tools.
///
/// These tools prove the live continuation and denial paths without granting
/// filesystem or process effects before Phase 4 owns those capabilities.
#[derive(Default)]
pub struct Phase3ToolRuntime {
    executed: Mutex<HashSet<ToolCallId>>,
}

impl ToolRuntime for Phase3ToolRuntime {
    fn definitions(&self) -> Vec<ToolDefinition> {
        [
            (
                "phase1b_echo",
                "Return one supplied short string unchanged from process memory.",
            ),
            (
                "phase3_mutation_probe",
                "Request a fake mutation used to verify approval denial; it has no local effect.",
            ),
        ]
        .into_iter()
        .map(|(name, description)| ToolDefinition {
            name: name.into(),
            description: description.into(),
            schema: value_schema(),
        })
        .collect()
    }

    fn prepare(&self, call: &CompletedToolCall) -> Result<PreparedTool, ToolError> {
        let mutating = match call.name.as_str() {
            "phase1b_echo" => false,
            "phase3_mutation_probe" => true,
            _ => return Err(ToolError::Unavailable),
        };
        let value = validated_value(&call.arguments)?;
        Ok(PreparedTool {
            tool_call_id: call.tool_call_id,
            provider_call_id: call.provider_call_id.clone(),
            name: call.name.clone(),
            output: value,
            mutating,
            effect_digest: effect_digest(&call.name, &call.arguments),
            summary: if mutating {
                "Deny the Phase 3 fake mutation; no local effect is available.".into()
            } else {
                "Return the supplied value from process memory.".into()
            },
        })
    }

    fn execute(&self, prepared: &PreparedTool) -> Result<String, ToolError> {
        if prepared.mutating {
            return Err(ToolError::Unavailable);
        }
        execute_once(&self.executed, prepared)
    }
}

#[derive(Default)]
pub struct ScriptedToolRuntime {
    executed: Mutex<HashSet<ToolCallId>>,
}

impl ScriptedToolRuntime {
    pub fn executed_count(&self) -> usize {
        self.executed.lock().map_or(0, |calls| calls.len())
    }
}

impl ToolRuntime for ScriptedToolRuntime {
    fn definitions(&self) -> Vec<ToolDefinition> {
        [
            ("phase2_read", "Return a deterministic in-memory value."),
            ("phase2_mutate", "Apply a deterministic in-memory mutation."),
        ]
        .into_iter()
        .map(|(name, description)| ToolDefinition {
            name: name.into(),
            description: description.into(),
            schema: value_schema(),
        })
        .collect()
    }

    fn prepare(&self, call: &CompletedToolCall) -> Result<PreparedTool, ToolError> {
        let mutating = match call.name.as_str() {
            "phase2_read" => false,
            "phase2_mutate" => true,
            _ => return Err(ToolError::Unavailable),
        };
        let value = validated_value(&call.arguments)?;
        let output = if mutating {
            format!("mutated:{value}")
        } else {
            format!("read:{value}")
        };
        let effect_digest = effect_digest(&call.name, &call.arguments);
        Ok(PreparedTool {
            tool_call_id: call.tool_call_id,
            provider_call_id: call.provider_call_id.clone(),
            name: call.name.clone(),
            output,
            mutating,
            effect_digest,
            summary: if mutating {
                "Apply the scripted in-memory mutation.".into()
            } else {
                "Run the scripted read-only tool.".into()
            },
        })
    }

    fn execute(&self, prepared: &PreparedTool) -> Result<String, ToolError> {
        execute_once(&self.executed, prepared)
    }
}

fn value_schema() -> serde_json::Value {
    serde_json::json!({"type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":false})
}

fn validated_value(arguments: &str) -> Result<String, ToolError> {
    let value =
        parse_strict_object(arguments, 64 * 1024, 16).map_err(|_| ToolError::InvalidArguments)?;
    let object = value.as_object().ok_or(ToolError::InvalidArguments)?;
    if object.len() != 1 {
        return Err(ToolError::InvalidArguments);
    }
    object
        .get("value")
        .and_then(serde_json::Value::as_str)
        .filter(|value| value.len() <= 4096)
        .map(str::to_owned)
        .ok_or(ToolError::InvalidArguments)
}

fn effect_digest(name: &str, arguments: &str) -> String {
    format!(
        "{:x}",
        Sha256::digest(format!("{name}\0{arguments}").as_bytes())
    )
}

fn execute_once(
    executed: &Mutex<HashSet<ToolCallId>>,
    prepared: &PreparedTool,
) -> Result<String, ToolError> {
    let mut executed = executed.lock().map_err(|_| ToolError::AlreadyExecuted)?;
    if !executed.insert(prepared.tool_call_id) {
        return Err(ToolError::AlreadyExecuted);
    }
    Ok(prepared.output.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(name: &str, arguments: &str) -> CompletedToolCall {
        CompletedToolCall {
            tool_call_id: ToolCallId::new(),
            provider_call_id: "provider-call".into(),
            name: name.into(),
            arguments: arguments.into(),
        }
    }

    #[test]
    fn phase3_runtime_executes_echo_once_and_cannot_execute_mutation() {
        let runtime = Phase3ToolRuntime::default();
        let echo = runtime
            .prepare(&call("phase1b_echo", "{\"value\":\"hello\"}"))
            .unwrap();
        assert_eq!(runtime.execute(&echo).unwrap(), "hello");
        assert_eq!(runtime.execute(&echo), Err(ToolError::AlreadyExecuted));

        let mutation = runtime
            .prepare(&call(
                "phase3_mutation_probe",
                "{\"value\":\"never applied\"}",
            ))
            .unwrap();
        assert!(mutation.mutating);
        assert_eq!(runtime.execute(&mutation), Err(ToolError::Unavailable));
    }

    #[test]
    fn phase3_runtime_rejects_unknown_or_non_strict_arguments() {
        let runtime = Phase3ToolRuntime::default();
        assert!(matches!(
            runtime.prepare(&call("other", "{\"value\":\"x\"}")),
            Err(ToolError::Unavailable)
        ));
        assert!(matches!(
            runtime.prepare(&call("phase1b_echo", "{\"value\":1,\"value\":2}")),
            Err(ToolError::InvalidArguments)
        ));
    }
}
