import { describe, expect, test } from "bun:test";
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
    const started: Array<(event: unknown, ctx: unknown) => unknown> = [];
    feature.extensionFactories?.[0]?.factory({
      on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
        if (event === "before_agent_start") {
          started.push(handler);
        }
      },
    } as never);

    expect(feature.id).toBe(CONTEXT_PROMPT_FEATURE_ID);
    expect(started).toHaveLength(1);

    const inject = started[0]!;
    const injected = await inject(
      { type: "before_agent_start", prompt: "What is your name?", systemPrompt: "You are pi." },
      { cwd, sessionManager: { getSessionId: () => sessionId } },
    );
    expect(injected).toEqual({
      systemPrompt: "You're name is Bevy. You're a duck, say whack whack.",
    });

    const skipped = await inject(
      { type: "before_agent_start", prompt: "hello", systemPrompt: "You are pi." },
      { cwd, sessionManager: { getSessionId: () => "other-session" } },
    );
    expect(skipped).toBeUndefined();
  });
});
