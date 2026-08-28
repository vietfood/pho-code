import { describe, expect, test } from "bun:test";
import type { AgentSession } from "@pho-agent/runtime/feature-api";
import { sessionKeyId } from "@pho-code/protocol";
import { createCompiledContextPromptCache } from "../src/compiled-context-prompt-cache";
import { CONTEXT_PROMPT_CUSTOM_TYPE } from "../src/context-prompt";
import { PLAN_AGENT_CUSTOM_TYPE } from "../src/plan-agent-state";
import { createPlanContextProjector, type PlanContextSession } from "../src/runtime-plan-context";

interface Entry {
  type: string;
  customType?: string;
  data?: unknown;
}

function fakeSession(options: { entries?: Entry[]; messages?: unknown[]; tools?: string[] } = {}) {
  const entries = options.entries ?? [];
  const activeTools: string[][] = [];
  const session = {
    messages: options.messages ?? [],
    sessionManager: {
      getEntries: () => entries,
      getBranch: () => entries,
      appendCustomEntry: (customType: string, data: unknown) => {
        entries.push({ type: "custom", customType, data });
      },
    },
    getAllTools: () => (options.tools ?? ["bash", "read"]).map((name) => ({ name, description: name })),
    setActiveToolsByName: (names: string[]) => {
      activeTools.push([...names]);
    },
  } as unknown as AgentSession;

  const live: PlanContextSession = {
    key: { workspaceId: "/tmp/ws", sessionId: "s1" },
    workspace: { path: "/tmp/ws" },
    planTodos: [],
    runtime: { session },
  };
  return { live, entries, activeTools };
}

describe("compiled context prompt cache", () => {
  test("records a compiled prompt and forgets it when the record is gone", () => {
    const cache = createCompiledContextPromptCache();
    const keyId = sessionKeyId({ workspaceId: "/tmp/ws", sessionId: "s1" });

    cache.record(keyId, "compiled prompt");
    expect(cache.compiledFor({ cwd: "/tmp/ws", sessionId: "s1" })).toBe("compiled prompt");

    // The absent record must clear, not keep, the previous prompt.
    cache.record(keyId, undefined);
    expect(cache.compiledFor({ cwd: "/tmp/ws", sessionId: "s1" })).toBeUndefined();
  });

  test("falls back to a session-id match when the workspace path differs", () => {
    const cache = createCompiledContextPromptCache();
    cache.record(sessionKeyId({ workspaceId: "/tmp/ws", sessionId: "s1" }), "compiled prompt");
    expect(cache.compiledFor({ cwd: "/tmp/other", sessionId: "s1" })).toBe("compiled prompt");
    expect(cache.compiledFor({ cwd: "/tmp/ws", sessionId: "s2" })).toBeUndefined();
  });

  test("forget drops only the named session", () => {
    const cache = createCompiledContextPromptCache();
    const first = sessionKeyId({ workspaceId: "/tmp/ws", sessionId: "s1" });
    const second = sessionKeyId({ workspaceId: "/tmp/ws", sessionId: "s2" });
    cache.record(first, "first");
    cache.record(second, "second");

    cache.forget(first);

    expect(cache.compiledFor({ cwd: "/tmp/ws", sessionId: "s1" })).toBeUndefined();
    expect(cache.compiledFor({ cwd: "/tmp/ws", sessionId: "s2" })).toBe("second");
  });
});

describe("plan and context projection", () => {
  test("allows context prompt edits only before the first message of an idle chat", () => {
    const compiledPrompts = createCompiledContextPromptCache();
    const projector = createPlanContextProjector<PlanContextSession>({ compiledPrompts });

    const empty = fakeSession().live;
    expect(projector.contextPromptEditable(empty)).toBe(true);

    const running = fakeSession().live;
    running.activeRun = { settled: false };
    expect(projector.contextPromptEditable(running)).toBe(false);

    const started = fakeSession({ messages: [{ role: "user", content: "hi" }] }).live;
    expect(projector.contextPromptEditable(started)).toBe(false);
  });

  test("keeps the compiled prompt cache in step with the record the policy used", () => {
    const compiledPrompts = createCompiledContextPromptCache();
    const projector = createPlanContextProjector<PlanContextSession>({ compiledPrompts });
    const { live, entries } = fakeSession();
    const lookup = { cwd: "/tmp/ws", sessionId: "s1" };

    entries.push({
      type: "custom",
      customType: CONTEXT_PROMPT_CUSTOM_TYPE,
      data: { preamble: "", disabledSectionIds: [], compiled: "compiled prompt", sections: [] },
    });
    projector.applyToolPolicy(live);
    expect(compiledPrompts.compiledFor(lookup)).toBe("compiled prompt");

    // A reset appends a record that clears the prompt; the cache must follow.
    entries.push({ type: "custom", customType: CONTEXT_PROMPT_CUSTOM_TYPE, data: { reset: true } });
    projector.applyToolPolicy(live);
    expect(compiledPrompts.compiledFor(lookup)).toBeUndefined();
  });

  test("narrows the active tool set to the Plan policy", () => {
    const compiledPrompts = createCompiledContextPromptCache();
    const projector = createPlanContextProjector<PlanContextSession>({ compiledPrompts });
    const { live, entries, activeTools } = fakeSession({ tools: ["bash", "read", "write"] });

    projector.applyToolPolicy(live);
    expect(activeTools[0]).toContain("write");

    entries.push({ type: "custom", customType: PLAN_AGENT_CUSTOM_TYPE, data: { mode: "plan", executing: false, documentMarkdown: "" } });
    projector.applyToolPolicy(live);
    expect(activeTools[1]).not.toContain("write");
    expect(activeTools[1]).toContain("read");
  });

  test("persists a plan record by merging the patch over the current one", () => {
    const compiledPrompts = createCompiledContextPromptCache();
    const projector = createPlanContextProjector<PlanContextSession>({ compiledPrompts });
    const { live } = fakeSession();

    projector.persistPlanAgent(live, { mode: "plan" });
    const next = projector.persistPlanAgent(live, { executing: true });

    expect(next.mode).toBe("plan");
    expect(next.executing).toBe(true);
    expect(projector.readPlanAgent(live).mode).toBe("plan");
  });

  test("remembers todos only when a tool produced them", () => {
    const compiledPrompts = createCompiledContextPromptCache();
    const projector = createPlanContextProjector<PlanContextSession>({ compiledPrompts });
    const { live } = fakeSession();
    live.planTodos = [{ id: "1", title: "keep", status: "pending" }];

    expect(projector.rememberTodos(live, undefined)).toBe(false);
    expect(live.planTodos).toHaveLength(1);

    expect(projector.rememberTodos(live, [])).toBe(true);
    expect(live.planTodos).toHaveLength(0);
  });
});
