import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import type { HarnessFeature } from "./features";

export const CONTEXT_PROMPT_FEATURE_ID = "context-prompt";
export const CONTEXT_PROMPT_FEATURE_VERSION = "1.0.0";

export function createContextPromptFeature(options: {
  compiledFor: (input: { cwd: string; sessionId: string }) => string | undefined;
}): HarnessFeature {
  return {
    id: CONTEXT_PROMPT_FEATURE_ID,
    version: CONTEXT_PROMPT_FEATURE_VERSION,
    extensionFactories: [createContextPromptExtension(options)],
    expected: { extensions: 1 },
  };
}

function createContextPromptExtension(options: {
  compiledFor: (input: { cwd: string; sessionId: string }) => string | undefined;
}): InlineExtension {
  return {
    name: CONTEXT_PROMPT_FEATURE_ID,
    factory(pi) {
      pi.on("before_agent_start", async (_event, ctx) => {
        const compiled = options.compiledFor({
          cwd: ctx.cwd,
          sessionId: ctx.sessionManager.getSessionId(),
        });
        if (!compiled) {
          return undefined;
        }
        return { systemPrompt: compiled };
      });
    },
  };
}
