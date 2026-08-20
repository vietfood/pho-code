import type { AgentFeature } from "@pho-agent/runtime";
import { createPlanAgentFeature as createAgentPlanFeature } from "@pho-agent/runtime/plan-agent";
import { collectContextPromptRecord, enabledToolNames } from "./context-prompt";

export {
  PLAN_AGENT_FEATURE_ID,
  PLAN_AGENT_FEATURE_VERSION,
  createPlanAgentExtension,
} from "@pho-agent/runtime/plan-agent";

export function createPlanAgentFeature(): AgentFeature {
  return createAgentPlanFeature({
    contextEnabledToolNames(entries) {
      const context = collectContextPromptRecord(entries);
      return context ? enabledToolNames(context.sections) : undefined;
    },
  });
}
