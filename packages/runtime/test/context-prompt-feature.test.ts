import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { sessionKeyId } from "@pho-code/protocol";
import { CONTEXT_PROMPT_FEATURE_ID, createContextPromptFeature } from "../src/context-prompt-feature";
import { lookupCompiledContextPrompt } from "../src/context-prompt";

describe("context prompt feature", () => {
  test("registers before_agent_start at factory time and injects compiled A from the live session", async () => {
    const cwd = "/tmp/ws";
    const sessionId = "session-1";
    const compiledByKey = new Map([
      [sessionKeyId({ workspaceId: cwd, sessionId }), "You're name is Bevy. You're a duck, say whack whack."],
    ]);
    const feature = createContextPromptFeature({
      compiledFor: (input) => lookupCompiledContextPrompt(compiledByKey, input),
    });
    const factory = namedFactory(feature.extensionFactories?.[0]);
    const started: Array<(event: unknown, ctx: unknown) => unknown> = [];

    factory({
      on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
        if (event === "before_agent_start") {
          started.push(handler);
        }
      },
    } as ExtensionAPI);

    expect(feature.id).toBe(CONTEXT_PROMPT_FEATURE_ID);
    expect(started).toHaveLength(1);

    const injected = await started[0]?.(
      { type: "before_agent_start", prompt: "What is your name?", systemPrompt: "You are pi." },
      {
        cwd,
        sessionManager: { getSessionId: () => sessionId },
      } as ExtensionContext,
    );
    expect(injected).toEqual({
      systemPrompt: "You're name is Bevy. You're a duck, say whack whack.",
    });

    const skipped = await started[0]?.(
      { type: "before_agent_start", prompt: "hello", systemPrompt: "You are pi." },
      {
        cwd,
        sessionManager: { getSessionId: () => "other-session" },
      } as ExtensionContext,
    );
    expect(skipped).toBeUndefined();
  });
});

function namedFactory(extension: unknown): (pi: ExtensionAPI) => void {
  if (typeof extension === "function") {
    return extension;
  }
  if (
    extension &&
    typeof extension === "object" &&
    "factory" in extension &&
    typeof extension.factory === "function"
  ) {
    return extension.factory as (pi: ExtensionAPI) => void;
  }
  throw new Error("expected a named inline extension factory");
}
