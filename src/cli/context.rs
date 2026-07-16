use std::fmt::Write as _;

use crate::agent::instructions::AgentInstructionProfile;
use crate::app::runtime::RuntimeConfig;
use crate::backend::ToolDefinition;
use crate::backend::profile::{
    MAXIMUM_OUTPUT_TOKENS, MODEL, PROFILE_REVISION, REASONING_EFFORT, THINKING_MODE,
};
use crate::tools::{phase4_definitions, phase5_definitions};

#[derive(Debug, thiserror::Error)]
pub enum ContextRenderError {
    #[error("context manifest formatting failed")]
    Format,
    #[error("tool schema serialization failed")]
    Schema,
}

pub fn render() -> Result<String, ContextRenderError> {
    let instruction_profile = AgentInstructionProfile::built_in();
    let config = RuntimeConfig::default();
    let ordinary_tools = phase5_definitions();
    let disposable_tools = phase4_definitions();
    let mut output = String::new();

    line(&mut output, "Pho Code model context manifest")?;
    line(
        &mut output,
        &format!(
            "instruction_profile_revision: {}",
            instruction_profile.revision()
        ),
    )?;
    line(
        &mut output,
        &format!("instruction_sha256: {}", instruction_profile.digest()),
    )?;
    line(
        &mut output,
        &format!("backend_profile_revision: {PROFILE_REVISION}"),
    )?;
    line(&mut output, &format!("model: {MODEL}"))?;
    line(&mut output, &format!("thinking: {THINKING_MODE}"))?;
    line(
        &mut output,
        &format!("reasoning_effort: {REASONING_EFFORT}"),
    )?;
    line(&mut output, "stream: true")?;
    line(&mut output, "stream_usage: true")?;
    line(
        &mut output,
        &format!("maximum_output_tokens: {MAXIMUM_OUTPUT_TOKENS}"),
    )?;
    line(
        &mut output,
        "tool_choice: auto when the selected profile has tools",
    )?;
    line(&mut output, "")?;
    line(&mut output, "runtime_limits:")?;
    line(
        &mut output,
        &format!("  maximum_context_bytes: {}", config.maximum_context_bytes),
    )?;
    line(
        &mut output,
        &format!(
            "  maximum_context_messages: {}",
            config.maximum_context_messages
        ),
    )?;
    line(
        &mut output,
        &format!(
            "  maximum_model_continuations: {}",
            config.maximum_model_continuations
        ),
    )?;
    line(
        &mut output,
        &format!("  maximum_tool_calls: {}", config.maximum_tool_calls),
    )?;
    line(
        &mut output,
        &format!(
            "  maximum_tool_argument_bytes: {}",
            config.maximum_tool_argument_bytes
        ),
    )?;
    line(
        &mut output,
        &format!(
            "  maximum_tool_result_bytes: {}",
            config.maximum_tool_result_bytes
        ),
    )?;
    line(
        &mut output,
        &format!("  turn_timeout_seconds: {}", config.turn_timeout.as_secs()),
    )?;
    line(&mut output, "")?;
    line(&mut output, "system_instructions_begin")?;
    line(&mut output, instruction_profile.system_instructions())?;
    line(&mut output, "system_instructions_end")?;
    line(&mut output, "")?;
    render_tools(
        &mut output,
        "ordinary_chat_tool_profile",
        "Used by durable ordinary chat after the Phase 5 persistence gate.",
        &ordinary_tools,
    )?;
    line(&mut output, "")?;
    render_tools(
        &mut output,
        "phase4_disposable_debug_tool_profile",
        "Used only by debug raw chat with the temporary-workspace Phase 4 gate.",
        &disposable_tools,
    )?;
    line(&mut output, "")?;
    line(
        &mut output,
        "dynamic_messages: not shown; this offline command does not start or inspect a turn",
    )?;
    line(
        &mut output,
        "provider_service_context: not observable by Pho Code",
    )?;
    line(
        &mut output,
        "privacy: no credential, Keychain access, workspace path, prompt, history, or network request is used",
    )?;

    Ok(output)
}

fn render_tools(
    output: &mut String,
    name: &str,
    description: &str,
    definitions: &[ToolDefinition],
) -> Result<(), ContextRenderError> {
    line(output, &format!("{name}:"))?;
    line(output, &format!("  description: {description}"))?;
    line(output, &format!("  tools: {}", definitions.len()))?;
    for definition in definitions {
        line(output, &format!("  - name: {}", definition.name))?;
        line(
            output,
            &format!("    description: {}", definition.description),
        )?;
        let schema = serde_json::to_string_pretty(&definition.schema)
            .map_err(|_| ContextRenderError::Schema)?;
        line(output, "    schema:")?;
        for schema_line in schema.lines() {
            line(output, &format!("      {schema_line}"))?;
        }
    }
    Ok(())
}

fn line(output: &mut String, value: &str) -> Result<(), ContextRenderError> {
    writeln!(output, "{value}").map_err(|_| ContextRenderError::Format)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_discloses_exact_static_context_without_dynamic_content() {
        let manifest = render().unwrap();
        let instructions = AgentInstructionProfile::built_in();

        assert!(manifest.contains(instructions.system_instructions()));
        assert!(manifest.contains(&instructions.digest()));
        assert!(manifest.contains("model: deepseek-v4-flash"));
        assert!(manifest.contains("ordinary_chat_tool_profile"));
        assert!(manifest.contains("phase4_disposable_debug_tool_profile"));
        assert!(manifest.contains("- name: apply_patch"));
        assert!(manifest.contains("dynamic_messages: not shown"));
        assert!(manifest.contains("provider_service_context: not observable"));
    }
}
