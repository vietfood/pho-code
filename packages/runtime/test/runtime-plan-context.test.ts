import { describe, expect, test } from "bun:test";
import type { AgentSession } from "@pho-agent/runtime/feature-api";
import { sessionKeyId, toolSectionId } from "@pho-code/protocol";
import { createCompiledContextPromptCache } from "../src/compiled-context-prompt-cache";
import { compileContextPrompt, CONTEXT_PROMPT_CUSTOM_TYPE } from "../src/context-prompt";
import { PLAN_AGENT_CUSTOM_TYPE } from "../src/plan-agent-state";
import {
  createPlanContextProjector,
  omitCursorSdkToolSections,
  toolPromptSources,
  type PlanContextSession,
} from "../src/runtime-plan-context";

interface Entry {
  type: string;
  customType?: string;
  data?: unknown;
}

function fakeSession(
  options: {
    entries?: Entry[];
    messages?: unknown[];
    tools?: string[];
    provider?: string;
    agentsFiles?: { path: string; content: string }[];
    systemPrompt?: string;
  } = {},
) {
  const entries = options.entries ?? [];
  // The display transcript reads the active branch, so the fake's context
  // messages must exist there as message entries, mirroring a real session.
  const messageEntries = (options.messages ?? []).map((message, index) => ({
    type: "message",
    id: `m${index}`,
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    message,
  }));
  const activeTools: string[][] = [];
  const session = {
    messages: options.messages ?? [],
    model: { provider: options.provider ?? "anthropic", id: "test-model" },
    systemPrompt: options.systemPrompt ?? "Pi native prompt",
    sessionManager: {
      getEntries: () => [...entries, ...messageEntries],
      getBranch: () => [...entries, ...messageEntries],
      appendCustomEntry: (customType: string, data: unknown) => {
        entries.push({ type: "custom", customType, data });
      },
    },
    resourceLoader: {
      getAgentsFiles: () => ({ agentsFiles: options.agentsFiles ?? [] }),
    },
    getAllTools: () => (options.tools ?? ["bash", "read"]).map((name) => ({ name, description: name })),
    getToolDefinition: (name: string) => ({ name, label: name }),
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

  const cursorRegistered = ["bash", "read", "cursor_ask_question", "cursor_activate_skill", "cursor"] as const;

  test("does not activate Cursor SDK tools unless the session model is Cursor", () => {
    const compiledPrompts = createCompiledContextPromptCache();
    const projector = createPlanContextProjector<PlanContextSession>({ compiledPrompts });
    const { live, activeTools } = fakeSession({ tools: [...cursorRegistered] });

    projector.applyToolPolicy(live);
    expect(activeTools[0]).toEqual(["bash", "read"]);
  });

  test("activates Cursor SDK tools when the session model is Cursor", () => {
    const compiledPrompts = createCompiledContextPromptCache();
    const projector = createPlanContextProjector<PlanContextSession>({ compiledPrompts });
    const { live, activeTools } = fakeSession({ tools: [...cursorRegistered], provider: "cursor" });

    projector.applyToolPolicy(live);
    expect(activeTools[0]).toEqual([...cursorRegistered]);
  });

  test("keeps Cursor SDK tools off in Plan even on a Cursor model", () => {
    const compiledPrompts = createCompiledContextPromptCache();
    const projector = createPlanContextProjector<PlanContextSession>({ compiledPrompts });
    const { live, entries, activeTools } = fakeSession({
      tools: [...cursorRegistered, "write"],
      provider: "cursor",
    });
    entries.push({
      type: "custom",
      customType: PLAN_AGENT_CUSTOM_TYPE,
      data: { mode: "plan", executing: false, documentMarkdown: "" },
    });

    projector.applyToolPolicy(live);
    expect(activeTools[0]).toEqual(["bash", "read"]);
  });

  test("hides Cursor SDK tools from the context prompt unless the model is Cursor", () => {
    const compiledPrompts = createCompiledContextPromptCache();
    const projector = createPlanContextProjector<PlanContextSession>({ compiledPrompts });
    const hidden = fakeSession({ tools: [...cursorRegistered] });
    expect(toolPromptSources(hidden.live.runtime.session).map((tool) => tool.name)).toEqual(["bash", "read"]);
    expect(projector.projectContextPrompt(hidden.live).sections.map((section) => section.id)).not.toContain(
      toolSectionId("cursor_ask_question"),
    );

    const shown = fakeSession({ tools: [...cursorRegistered], provider: "cursor" });
    expect(toolPromptSources(shown.live.runtime.session).map((tool) => tool.name)).toEqual([...cursorRegistered]);
    expect(projector.projectContextPrompt(shown.live).sections.map((section) => section.id)).toContain(
      toolSectionId("cursor_ask_question"),
    );
  });

  test("strips Cursor SDK tools from compiled A when a custom record is inspected on a non-Cursor model", () => {
    const compiledPrompts = createCompiledContextPromptCache();
    const projector = createPlanContextProjector<PlanContextSession>({ compiledPrompts });
    const sections = [
      { id: toolSectionId("bash"), kind: "tool" as const, title: "bash", enabled: true, body: "Run shell commands." },
      {
        id: toolSectionId("cursor_ask_question"),
        kind: "tool" as const,
        title: "Cursor question",
        enabled: true,
        body: "Ask a Cursor question.",
      },
    ];
    const compiled = compileContextPrompt({ preamble: "Stay brief.", sections, cwd: "/tmp/ws" });
    const { live, entries, activeTools } = fakeSession({
      tools: [...cursorRegistered],
      messages: [{ role: "user", content: "hi" }],
    });
    entries.push({
      type: "custom",
      customType: CONTEXT_PROMPT_CUSTOM_TYPE,
      data: { preamble: "Stay brief.", disabledSectionIds: [], compiled, sections },
    });

    projector.applyToolPolicy(live);
    expect(activeTools[0]).toEqual(["bash"]);
    expect(compiledPrompts.compiledFor({ cwd: "/tmp/ws", sessionId: "s1" })).not.toContain("Cursor question");
    expect(compiledPrompts.compiledFor({ cwd: "/tmp/ws", sessionId: "s1" })).toContain("- bash:");

    const projected = projector.projectContextPrompt(live);
    expect(projected.sections.map((section) => section.id)).toEqual([toolSectionId("bash")]);
    expect(projected.compiled).not.toContain("Cursor question");
    expect(omitCursorSdkToolSections(sections, false).map((section) => section.id)).toEqual([toolSectionId("bash")]);
  });

  test("omits the Windows powershell tool from the active set and Context prompt", () => {
    const compiledPrompts = createCompiledContextPromptCache();
    const projector = createPlanContextProjector<PlanContextSession>({ compiledPrompts });
    const { live, activeTools } = fakeSession({ tools: ["bash", "read", "powershell", "edit"] });

    projector.applyToolPolicy(live);
    expect(activeTools[0]).toEqual(["bash", "read", "edit"]);
    expect(toolPromptSources(live.runtime.session).map((tool) => tool.name)).toEqual(["bash", "read", "edit"]);
    expect(projector.projectContextPrompt(live).sections.map((section) => section.id)).not.toContain(toolSectionId("powershell"));
  });

  test("records a Pi-docs-stripped live prompt for uncustomized sessions", () => {
    const compiledPrompts = createCompiledContextPromptCache();
    const projector = createPlanContextProjector<PlanContextSession>({ compiledPrompts });
    const { live } = fakeSession({
      systemPrompt: `Hello\n\nPi documentation (read only when the user asks about pi itself):\n- Main documentation: /tmp/pi/README.md\n\nCwd: /tmp`,
    });

    projector.applyToolPolicy(live);
    const compiled = compiledPrompts.compiledFor({ cwd: "/tmp/ws", sessionId: "s1" });
    expect(compiled).toContain("Hello");
    expect(compiled).not.toContain("Pi documentation");
    expect(compiled).toContain("Cwd: /tmp");
  });
});
