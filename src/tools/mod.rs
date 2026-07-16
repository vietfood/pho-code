pub mod output;
pub mod patch;
pub mod read;
pub mod search;
pub mod shell;
pub mod workspace;

pub const MAXIMUM_MODEL_RESULT_BYTES: usize = 128 * 1024;

use std::collections::HashSet;
use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use sha2::{Digest as _, Sha256};
use tokio_util::sync::CancellationToken;

use crate::agent::types::ToolStatus;
use crate::agent::types::{ApprovalId, ToolCallId, TurnId};
use crate::backend::strict_json::parse_strict_object;
use crate::backend::{CompletedToolCall, ToolDefinition};

pub trait ArtifactWriter: Send + Sync {
    fn write(
        &self,
        request: output::ArtifactRequest,
    ) -> Result<output::ArtifactCommit, &'static str>;
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
        cancellation: CancellationToken,
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
        _: CancellationToken,
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

#[derive(Clone)]
pub struct PreparedTool {
    pub tool_call_id: ToolCallId,
    pub provider_call_id: String,
    pub name: String,
    pub mutating: bool,
    pub effect_digest: String,
    pub summary: String,
    pub maximum_result_bytes: usize,
    operation: PreparedOperation,
}

impl std::fmt::Debug for PreparedTool {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PreparedTool")
            .field("tool_call_id", &self.tool_call_id)
            .field("name", &self.name)
            .field("mutating", &self.mutating)
            .finish_non_exhaustive()
    }
}

#[derive(Clone)]
enum PreparedOperation {
    Fixed(String),
    Rejected(String),
    SearchFiles(search::FileSearchRequest),
    SearchText(search::TextSearchRequest),
    Read(read::ReadRequest),
    Patch(patch::PatchPlan),
    Shell(shell::ShellRequest),
}

impl PreparedTool {
    pub(crate) fn rejected(call: &CompletedToolCall, error: ToolError) -> Self {
        let code = match error {
            ToolError::InvalidArguments => "tool_arguments_invalid",
            ToolError::Unavailable => "tool_unavailable",
            _ => "tool_preparation_failed",
        };
        let output = format!(r#"{{"status":"failed","code":"{code}"}}"#);
        Self {
            tool_call_id: call.tool_call_id,
            provider_call_id: call.provider_call_id.clone(),
            name: call.name.clone(),
            mutating: false,
            effect_digest: effect_digest(&call.name, &call.arguments),
            summary: "Tool preparation failed before execution.".into(),
            maximum_result_bytes: output.len(),
            operation: PreparedOperation::Rejected(output),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum ToolError {
    #[error("tool is unavailable")]
    Unavailable,
    #[error("tool arguments failed strict validation")]
    InvalidArguments,
    #[error("tool call was already executed")]
    AlreadyExecuted,
    #[error("tool operation failed")]
    OperationFailed,
    #[error("tool operation was cancelled")]
    Cancelled,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ToolExecution {
    pub output: String,
    pub status: ToolStatus,
}

impl ToolExecution {
    fn completed(output: String) -> Self {
        Self {
            output,
            status: ToolStatus::Completed,
        }
    }
}

pub trait ToolRuntime: Send + Sync {
    fn definitions(&self) -> Vec<ToolDefinition>;
    fn prepare<'a>(
        &'a self,
        call: &'a CompletedToolCall,
        cancellation: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<PreparedTool, ToolError>> + Send + 'a>>;
    fn execute<'a>(
        &'a self,
        prepared: &'a PreparedTool,
        turn_id: TurnId,
        cancellation: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<ToolExecution, ToolError>> + Send + 'a>>;
}

pub struct NoToolRuntime;

impl ToolRuntime for NoToolRuntime {
    fn definitions(&self) -> Vec<ToolDefinition> {
        Vec::new()
    }

    fn prepare<'a>(
        &'a self,
        _: &'a CompletedToolCall,
        _: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<PreparedTool, ToolError>> + Send + 'a>> {
        Box::pin(async { Err(ToolError::Unavailable) })
    }

    fn execute<'a>(
        &'a self,
        _: &'a PreparedTool,
        _: TurnId,
        _: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<ToolExecution, ToolError>> + Send + 'a>> {
        Box::pin(async { Err(ToolError::Unavailable) })
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

    fn prepare<'a>(
        &'a self,
        call: &'a CompletedToolCall,
        _: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<PreparedTool, ToolError>> + Send + 'a>> {
        Box::pin(async move {
            let mutating = match call.name.as_str() {
                "phase1b_echo" => false,
                "phase3_mutation_probe" => true,
                _ => return Err(ToolError::Unavailable),
            };
            let value = validated_value(&call.arguments)?;
            let maximum_result_bytes = value.len();
            Ok(PreparedTool {
                tool_call_id: call.tool_call_id,
                provider_call_id: call.provider_call_id.clone(),
                name: call.name.clone(),
                mutating,
                effect_digest: effect_digest(&call.name, &call.arguments),
                summary: if mutating {
                    "Deny the Phase 3 fake mutation; no local effect is available.".into()
                } else {
                    "Return the supplied value from process memory.".into()
                },
                maximum_result_bytes,
                operation: PreparedOperation::Fixed(value),
            })
        })
    }

    fn execute<'a>(
        &'a self,
        prepared: &'a PreparedTool,
        _: TurnId,
        _: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<ToolExecution, ToolError>> + Send + 'a>> {
        Box::pin(async move {
            if let Some(execution) = rejected_execution(prepared) {
                return Ok(execution);
            }
            if prepared.mutating {
                return Err(ToolError::Unavailable);
            }
            execute_once(&self.executed, prepared).map(ToolExecution::completed)
        })
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

    fn prepare<'a>(
        &'a self,
        call: &'a CompletedToolCall,
        _: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<PreparedTool, ToolError>> + Send + 'a>> {
        Box::pin(async move {
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
            let maximum_result_bytes = output.len();
            Ok(PreparedTool {
                tool_call_id: call.tool_call_id,
                provider_call_id: call.provider_call_id.clone(),
                name: call.name.clone(),
                mutating,
                effect_digest,
                summary: if mutating {
                    "Apply the scripted in-memory mutation.".into()
                } else {
                    "Run the scripted read-only tool.".into()
                },
                maximum_result_bytes,
                operation: PreparedOperation::Fixed(output),
            })
        })
    }

    fn execute<'a>(
        &'a self,
        prepared: &'a PreparedTool,
        _: TurnId,
        _: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<ToolExecution, ToolError>> + Send + 'a>> {
        Box::pin(async move {
            if let Some(execution) = rejected_execution(prepared) {
                return Ok(execution);
            }
            execute_once(&self.executed, prepared).map(ToolExecution::completed)
        })
    }
}

pub struct Phase4ToolRuntime {
    workspace: workspace::Workspace,
    search: Arc<search::WorkspaceSearch>,
    artifacts: Arc<dyn ArtifactWriter>,
    effects: Arc<dyn patch::EffectRecorder>,
    trash: Arc<dyn patch::Trash>,
    executed: Mutex<HashSet<ToolCallId>>,
    personal_workspace: bool,
}

pub type Phase5ToolRuntime = Phase4ToolRuntime;

impl Phase4ToolRuntime {
    pub fn new_disposable(
        root: impl AsRef<Path>,
        artifacts: Arc<dyn ArtifactWriter>,
        effects: Arc<dyn patch::EffectRecorder>,
        trash: Arc<dyn patch::Trash>,
    ) -> Result<Self, ToolError> {
        let workspace = workspace::Workspace::open(root).map_err(|_| ToolError::Unavailable)?;
        let temporary_root =
            std::fs::canonicalize(std::env::temp_dir()).map_err(|_| ToolError::Unavailable)?;
        if workspace.root() == temporary_root || !workspace.root().starts_with(&temporary_root) {
            return Err(ToolError::Unavailable);
        }
        Self::from_workspace(workspace, artifacts, effects, trash, false)
    }

    pub fn new_persistent(
        root: impl AsRef<Path>,
        artifacts: Arc<dyn ArtifactWriter>,
        effects: Arc<dyn patch::EffectRecorder>,
        trash: Arc<dyn patch::Trash>,
    ) -> Result<Self, ToolError> {
        let workspace = workspace::Workspace::open(root).map_err(|_| ToolError::Unavailable)?;
        Self::from_workspace(workspace, artifacts, effects, trash, true)
    }

    fn from_workspace(
        workspace: workspace::Workspace,
        artifacts: Arc<dyn ArtifactWriter>,
        effects: Arc<dyn patch::EffectRecorder>,
        trash: Arc<dyn patch::Trash>,
        personal_workspace: bool,
    ) -> Result<Self, ToolError> {
        let search = Arc::new(
            search::WorkspaceSearch::start(workspace.clone())
                .map_err(|_| ToolError::Unavailable)?,
        );
        Ok(Self {
            workspace,
            search,
            artifacts,
            effects,
            trash,
            executed: Mutex::new(HashSet::new()),
            personal_workspace,
        })
    }

    pub fn new_disposable_in_memory(root: impl AsRef<Path>) -> Result<Self, ToolError> {
        Self::new_disposable(
            root,
            Arc::new(output::MemoryArtifactWriter::new(16 * 1024 * 1024)),
            Arc::new(patch::MemoryEffectRecorder),
            Arc::new(patch::MacTrash),
        )
    }
}

impl ToolRuntime for Phase4ToolRuntime {
    fn definitions(&self) -> Vec<ToolDefinition> {
        if self.personal_workspace {
            phase5_definitions()
        } else {
            phase4_definitions()
        }
    }

    fn prepare<'a>(
        &'a self,
        call: &'a CompletedToolCall,
        cancellation: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<PreparedTool, ToolError>> + Send + 'a>> {
        let workspace = self.workspace.clone();
        let call = call.clone();
        Box::pin(async move {
            let task = tokio::task::spawn_blocking(move || {
                let object =
                    parse_strict_object(&call.arguments, patch::MAXIMUM_PATCH_BYTES + 8 * 1024, 32)
                        .map_err(|_| ToolError::InvalidArguments)?;
                let object = object.as_object().ok_or(ToolError::InvalidArguments)?;
                let (operation, mutating, effect_digest, summary) = match call.name.as_str() {
                    "search_files" => {
                        require_keys(object, &["query", "path", "limit", "cursor"])?;
                        let request = search::FileSearchRequest {
                            query: required_string(object, "query", 4096)?,
                            path: optional_string(object, "path", 4096)?,
                            limit: optional_usize(object, "limit")?.unwrap_or(20),
                            cursor: optional_string(object, "cursor", 128)?,
                        };
                        (
                            PreparedOperation::SearchFiles(request),
                            false,
                            effect_digest(&call.name, &call.arguments),
                            "Search indexed workspace paths.".into(),
                        )
                    }
                    "search_text" => {
                        require_keys(
                            object,
                            &[
                                "query",
                                "path",
                                "mode",
                                "case_sensitive",
                                "context_lines",
                                "limit",
                                "cursor",
                            ],
                        )?;
                        let mode = match optional_string(object, "mode", 16)?
                            .as_deref()
                            .unwrap_or("literal")
                        {
                            "literal" => search::TextSearchMode::Literal,
                            "regex" => search::TextSearchMode::Regex,
                            "fuzzy" => search::TextSearchMode::Fuzzy,
                            _ => return Err(ToolError::InvalidArguments),
                        };
                        let request = search::TextSearchRequest {
                            query: required_string(object, "query", 4096)?,
                            path: optional_string(object, "path", 4096)?,
                            mode,
                            case_sensitive: optional_bool(object, "case_sensitive")?
                                .unwrap_or(false),
                            context_lines: optional_usize(object, "context_lines")?.unwrap_or(0),
                            limit: optional_usize(object, "limit")?.unwrap_or(20),
                            cursor: optional_string(object, "cursor", 128)?,
                        };
                        (
                            PreparedOperation::SearchText(request),
                            false,
                            effect_digest(&call.name, &call.arguments),
                            "Search bounded indexed workspace text.".into(),
                        )
                    }
                    "read_file" => {
                        require_keys(object, &["path", "start_line", "line_count"])?;
                        let request = read::ReadRequest {
                            path: required_string(object, "path", 4096)?,
                            start_line: optional_usize(object, "start_line")?.unwrap_or(1),
                            line_count: optional_usize(object, "line_count")?.unwrap_or(200),
                        };
                        (
                            PreparedOperation::Read(request),
                            false,
                            effect_digest(&call.name, &call.arguments),
                            "Read a bounded UTF-8 file window.".into(),
                        )
                    }
                    "apply_patch" => {
                        require_keys(object, &["patch"])?;
                        let patch_text =
                            required_string(object, "patch", patch::MAXIMUM_PATCH_BYTES)?;
                        let plan = patch::prepare(&workspace, &patch_text)
                            .map_err(|_| ToolError::InvalidArguments)?;
                        let digest = plan.effect_digest.clone();
                        let summary = plan.summary.clone();
                        (PreparedOperation::Patch(plan), true, digest, summary)
                    }
                    "shell" => {
                        require_keys(object, &["command", "cwd", "timeout_seconds"])?;
                        let command =
                            required_string(object, "command", shell::MAXIMUM_COMMAND_BYTES)?;
                        let cwd = optional_string(object, "cwd", 4096)?;
                        let timeout = optional_usize(object, "timeout_seconds")?.unwrap_or(120);
                        let timeout =
                            u64::try_from(timeout).map_err(|_| ToolError::InvalidArguments)?;
                        let (request, digest, summary) =
                            shell::validate(&workspace, command, cwd, timeout)
                                .map_err(|_| ToolError::InvalidArguments)?;
                        (PreparedOperation::Shell(request), true, digest, summary)
                    }
                    _ => return Err(ToolError::Unavailable),
                };
                Ok(PreparedTool {
                    tool_call_id: call.tool_call_id,
                    provider_call_id: call.provider_call_id.clone(),
                    name: call.name.clone(),
                    mutating,
                    effect_digest,
                    summary,
                    maximum_result_bytes: MAXIMUM_MODEL_RESULT_BYTES,
                    operation,
                })
            });
            tokio::select! {
                _ = cancellation.cancelled() => Err(ToolError::Cancelled),
                result = task => result.map_err(|_| ToolError::OperationFailed)?,
            }
        })
    }

    fn execute<'a>(
        &'a self,
        prepared: &'a PreparedTool,
        turn_id: TurnId,
        cancellation: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<ToolExecution, ToolError>> + Send + 'a>> {
        Box::pin(async move {
            {
                let mut executed = self
                    .executed
                    .lock()
                    .map_err(|_| ToolError::AlreadyExecuted)?;
                if !executed.insert(prepared.tool_call_id) {
                    return Err(ToolError::AlreadyExecuted);
                }
            }
            match &prepared.operation {
                PreparedOperation::Fixed(output) => Ok(ToolExecution::completed(output.clone())),
                PreparedOperation::Rejected(output) => Ok(ToolExecution {
                    output: output.clone(),
                    status: ToolStatus::Failed,
                }),
                PreparedOperation::SearchFiles(request) => {
                    if cancellation.is_cancelled() {
                        return operation_failure(ToolError::Cancelled);
                    }
                    let search = Arc::clone(&self.search);
                    let request = request.clone();
                    let task = tokio::task::spawn_blocking(move || search.search_files(&request));
                    let result = task.await.map_err(|_| ToolError::OperationFailed)?;
                    if cancellation.is_cancelled() {
                        operation_failure(ToolError::Cancelled)
                    } else {
                        result
                            .and_then(|result| result.model_content())
                            .map(ToolExecution::completed)
                            .or_else(search_failure)
                    }
                }
                PreparedOperation::SearchText(request) => {
                    let search = Arc::clone(&self.search);
                    let request = request.clone();
                    let token = cancellation.clone();
                    tokio::task::spawn_blocking(move || search.search_text(&request, &token))
                        .await
                        .map_err(|_| ToolError::OperationFailed)?
                        .and_then(|result| result.model_content())
                        .map(ToolExecution::completed)
                        .or_else(search_failure)
                }
                PreparedOperation::Read(request) => {
                    let workspace = self.workspace.clone();
                    let request = request.clone();
                    let token = cancellation.clone();
                    tokio::task::spawn_blocking(move || {
                        read::read_file(&workspace, &request, &token)
                    })
                    .await
                    .map_err(|_| ToolError::OperationFailed)?
                    .and_then(|result| result.model_content())
                    .map(ToolExecution::completed)
                    .or_else(|error| {
                        operation_failure(match error {
                            read::ReadError::Cancelled => ToolError::Cancelled,
                            _ => ToolError::OperationFailed,
                        })
                    })
                }
                PreparedOperation::Patch(plan) => {
                    let plan = plan.clone();
                    let artifacts = Arc::clone(&self.artifacts);
                    let effects = Arc::clone(&self.effects);
                    let trash = Arc::clone(&self.trash);
                    let token = cancellation.clone();
                    let call_id = prepared.tool_call_id;
                    tokio::task::spawn_blocking(move || {
                        patch::execute(
                            &plan,
                            turn_id,
                            call_id,
                            artifacts.as_ref(),
                            effects.as_ref(),
                            trash.as_ref(),
                            &token,
                        )
                    })
                    .await
                    .map_err(|_| ToolError::OperationFailed)?
                    .and_then(|result| {
                        let status = match result.status {
                            "completed" => ToolStatus::Completed,
                            "failed_rolled_back" => ToolStatus::Failed,
                            "cancelled_rolled_back" => ToolStatus::Cancelled,
                            _ => ToolStatus::Uncertain,
                        };
                        result
                            .model_content()
                            .map(|output| ToolExecution { status, output })
                    })
                    .or_else(|error| {
                        operation_failure(match error {
                            patch::PatchError::Cancelled => ToolError::Cancelled,
                            _ => ToolError::OperationFailed,
                        })
                    })
                }
                PreparedOperation::Shell(request) => shell::execute(
                    request,
                    turn_id,
                    prepared.tool_call_id,
                    Arc::clone(&self.artifacts),
                    cancellation,
                )
                .await
                .and_then(|result| {
                    let status = if result.cancelled {
                        ToolStatus::Cancelled
                    } else if result.timed_out {
                        ToolStatus::Failed
                    } else {
                        ToolStatus::Completed
                    };
                    result
                        .model_content()
                        .map(|output| ToolExecution { output, status })
                })
                .or_else(|error| match error {
                    shell::ShellError::OutcomeUncertain => Ok(ToolExecution {
                        output: r#"{"status":"uncertain","code":"shell_outcome_uncertain"}"#.into(),
                        status: ToolStatus::Uncertain,
                    }),
                    shell::ShellError::Cancelled => operation_failure(ToolError::Cancelled),
                    _ => operation_failure(ToolError::OperationFailed),
                }),
            }
        })
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
    match &prepared.operation {
        PreparedOperation::Fixed(output) => Ok(output.clone()),
        _ => Err(ToolError::Unavailable),
    }
}

fn rejected_execution(prepared: &PreparedTool) -> Option<ToolExecution> {
    match &prepared.operation {
        PreparedOperation::Rejected(output) => Some(ToolExecution {
            output: output.clone(),
            status: ToolStatus::Failed,
        }),
        _ => None,
    }
}

pub(crate) fn phase4_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "search_files".into(),
            description: "Fuzzy-search indexed files inside the selected workspace.".into(),
            schema: serde_json::json!({"type":"object","properties":{"query":{"type":"string"},"path":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":100},"cursor":{"type":"string"}},"required":["query"],"additionalProperties":false}),
        },
        ToolDefinition {
            name: "search_text".into(),
            description: "Search indexed UTF-8 workspace text using literal, regex, or fuzzy matching.".into(),
            schema: serde_json::json!({"type":"object","properties":{"query":{"type":"string"},"path":{"type":"string"},"mode":{"type":"string","enum":["literal","regex","fuzzy"]},"case_sensitive":{"type":"boolean"},"context_lines":{"type":"integer","minimum":0,"maximum":3},"limit":{"type":"integer","minimum":1,"maximum":100},"cursor":{"type":"string"}},"required":["query"],"additionalProperties":false}),
        },
        ToolDefinition {
            name: "read_file".into(),
            description: "Read a stable numbered UTF-8 line window inside the selected workspace.".into(),
            schema: serde_json::json!({"type":"object","properties":{"path":{"type":"string"},"start_line":{"type":"integer","minimum":1},"line_count":{"type":"integer","minimum":1,"maximum":400}},"required":["path"],"additionalProperties":false}),
        },
        ToolDefinition {
            name: "apply_patch".into(),
            description: "Apply an approved patch inside a disposable workspace. Pass one `patch` string in this exact form for a replacement:\n```\n*** Begin Patch\n*** Update File: path\n@@\n-old\n+new\n*** End Patch\n```\n A hunk header may be bare `@@` or `@@ <locator>`; locator text is compatibility-only and the prefixed context/removal/addition lines are always matched exactly and uniquely. Add files use `*** Add File: path` with `+` lines; deletes use `*** Delete File: path`. Do not wrap the patch in Markdown or a shell command.".into(),
            schema: serde_json::json!({"type":"object","properties":{"patch":{"type":"string"}},"required":["patch"],"additionalProperties":false}),
        },
        ToolDefinition {
            name: "shell".into(),
            description: "Run an approved noninteractive zsh command in a disposable workspace; this is not a sandbox.".into(),
            schema: serde_json::json!({"type":"object","properties":{"command":{"type":"string"},"cwd":{"type":"string"},"timeout_seconds":{"type":"integer","minimum":1,"maximum":300}},"required":["command"],"additionalProperties":false}),
        },
    ]
}

pub(crate) fn phase5_definitions() -> Vec<ToolDefinition> {
    let mut definitions = phase4_definitions();
    for definition in &mut definitions {
        definition.description = definition
            .description
            .replace("a disposable workspace", "the selected personal workspace");
    }
    definitions
}

fn require_keys(
    object: &serde_json::Map<String, serde_json::Value>,
    allowed: &[&str],
) -> Result<(), ToolError> {
    if object.keys().all(|key| allowed.contains(&key.as_str())) {
        Ok(())
    } else {
        Err(ToolError::InvalidArguments)
    }
}

fn required_string(
    object: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    maximum: usize,
) -> Result<String, ToolError> {
    optional_string(object, key, maximum)?.ok_or(ToolError::InvalidArguments)
}

fn optional_string(
    object: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    maximum: usize,
) -> Result<Option<String>, ToolError> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    let value = value.as_str().ok_or(ToolError::InvalidArguments)?;
    if value.is_empty() || value.len() > maximum || value.as_bytes().contains(&0) {
        return Err(ToolError::InvalidArguments);
    }
    Ok(Some(value.to_owned()))
}

fn optional_usize(
    object: &serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Result<Option<usize>, ToolError> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    let value = value.as_u64().ok_or(ToolError::InvalidArguments)?;
    usize::try_from(value)
        .map(Some)
        .map_err(|_| ToolError::InvalidArguments)
}

fn optional_bool(
    object: &serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Result<Option<bool>, ToolError> {
    object
        .get(key)
        .map(|value| value.as_bool().ok_or(ToolError::InvalidArguments))
        .transpose()
}

fn search_failure(error: search::SearchError) -> Result<ToolExecution, ToolError> {
    if error == search::SearchError::Cancelled {
        return operation_failure(ToolError::Cancelled);
    }
    let code = match error {
        search::SearchError::InvalidArguments => "search_arguments_invalid",
        search::SearchError::InvalidRegex => "search_regex_invalid",
        search::SearchError::PreflightFailed => "search_preflight_failed",
        search::SearchError::IndexStartupFailed => "search_index_startup_failed",
        search::SearchError::WatcherStartupFailed => "search_watcher_startup_failed",
        search::SearchError::IndexBuilding => "search_index_building",
        search::SearchError::IndexStale => "search_index_stale",
        search::SearchError::IndexLimitExceeded => "search_index_limit_exceeded",
        search::SearchError::StaleCursor => "search_cursor_stale",
        search::SearchError::SearchFailed => "search_failed",
        search::SearchError::Cancelled => unreachable!(),
    };
    Ok(ToolExecution {
        output: format!(r#"{{"status":"failed","code":"{code}"}}"#),
        status: ToolStatus::Failed,
    })
}

fn operation_failure(error: ToolError) -> Result<ToolExecution, ToolError> {
    match error {
        ToolError::Cancelled => Ok(ToolExecution {
            output: r#"{"status":"cancelled","code":"tool_cancelled"}"#.into(),
            status: ToolStatus::Cancelled,
        }),
        ToolError::OperationFailed => Ok(ToolExecution {
            output: r#"{"status":"failed","code":"tool_operation_failed"}"#.into(),
            status: ToolStatus::Failed,
        }),
        error => Err(error),
    }
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

    #[tokio::test]
    async fn phase3_runtime_executes_echo_once_and_cannot_execute_mutation() {
        let runtime = Phase3ToolRuntime::default();
        let echo = runtime
            .prepare(
                &call("phase1b_echo", "{\"value\":\"hello\"}"),
                CancellationToken::new(),
            )
            .await
            .unwrap();
        assert_eq!(
            runtime
                .execute(&echo, TurnId::new(), CancellationToken::new())
                .await
                .unwrap(),
            ToolExecution::completed("hello".into())
        );
        assert_eq!(
            runtime
                .execute(&echo, TurnId::new(), CancellationToken::new())
                .await,
            Err(ToolError::AlreadyExecuted)
        );

        let mutation = runtime
            .prepare(
                &call("phase3_mutation_probe", "{\"value\":\"never applied\"}"),
                CancellationToken::new(),
            )
            .await
            .unwrap();
        assert!(mutation.mutating);
        assert_eq!(
            runtime
                .execute(&mutation, TurnId::new(), CancellationToken::new())
                .await,
            Err(ToolError::Unavailable)
        );
    }

    #[tokio::test]
    async fn phase3_runtime_rejects_unknown_or_non_strict_arguments() {
        let runtime = Phase3ToolRuntime::default();
        assert!(matches!(
            runtime
                .prepare(
                    &call("other", "{\"value\":\"x\"}"),
                    CancellationToken::new()
                )
                .await,
            Err(ToolError::Unavailable)
        ));
        assert!(matches!(
            runtime
                .prepare(
                    &call("phase1b_echo", "{\"value\":1,\"value\":2}"),
                    CancellationToken::new(),
                )
                .await,
            Err(ToolError::InvalidArguments)
        ));
    }
}
