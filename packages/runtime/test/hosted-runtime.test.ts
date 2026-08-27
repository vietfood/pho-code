import { describe, expect, test } from "bun:test";
import type { AgentBackendAdapter } from "@pho-agent/host";
import {
  emptyFeatureSnapshot,
  type AgentRuntimeEvent,
  type AgentSessionSnapshot,
  type RuntimeEvent,
  type WorkspaceSnapshot,
} from "@pho-code/protocol";
import { createDisposableStubHarnessRuntime } from "../src/harness-runtime";
import { hostPhoCodeRuntime } from "../src/hosted-runtime";

const workspace: WorkspaceSnapshot = {
  workspace: {
    id: "/workspace",
    path: "/workspace",
    displayName: "workspace",
    lastOpenedAt: "2026-08-26T00:00:00.000Z",
    projectResourcesApproved: true,
  },
  sessions: [],
  models: [],
  features: emptyFeatureSnapshot(),
};

function fakeCodexBackend(options: {
  interaction?: boolean;
  streamDelta?: string;
  streamTool?: boolean;
  onSelected?: (selected: string | undefined) => void;
} = {}): AgentBackendAdapter {
  const listeners = new Set<(event: AgentRuntimeEvent) => void>();
  let snapshot: AgentSessionSnapshot = {
    key: { scopeId: "/workspace", sessionId: "codex-session" },
    run: { status: "settled", runId: "run-1" },
    messages: [{
      id: "assistant-1",
      role: "assistant",
      blocks: [{
        type: "tool",
        id: "command-1",
        name: "Command",
        kind: "command",
        status: "completed",
        input: "pwd",
        output: "/workspace",
      }],
    }],
    model: {
      currentId: "gpt-5.4",
      available: [
        { id: "gpt-5.4", label: "GPT-5.4", supportsImages: true },
        { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", supportsImages: false },
      ],
    },
    reasoning: {
      currentId: "medium",
      available: [
        { id: "low", label: "Low" },
        { id: "medium", label: "Medium" },
        { id: "high", label: "High" },
      ],
    },
    fastMode: { enabled: false, description: "Faster responses" },
  };
  return {
    descriptor: {
      id: "codex",
      label: "Codex",
      capabilities: { "model-selection": "experimental", steering: "experimental" },
    },
    async getSessionSnapshot() { return snapshot; },
    async createSession() {
      for (const listener of listeners) {
        listener({ ...snapshot.key, type: "session_snapshot", occurredAt: new Date().toISOString(), snapshot });
      }
      return snapshot;
    },
    async openSession() { return snapshot; },
    async setModel(input) {
      snapshot = { ...snapshot, model: { ...snapshot.model!, currentId: input.modelId } };
      return snapshot;
    },
    async setReasoning(input) {
      snapshot = { ...snapshot, reasoning: { ...snapshot.reasoning!, currentId: input.reasoningId } };
      return snapshot;
    },
    async setFastMode(input) {
      snapshot = { ...snapshot, fastMode: { ...snapshot.fastMode!, enabled: input.enabled } };
      return snapshot;
    },
    async sendPrompt() {
      if (options.streamDelta) {
        for (const listener of listeners) {
          listener({
            ...snapshot.key,
            type: "text_delta",
            runId: "run-1",
            delta: options.streamDelta,
            occurredAt: "2026-08-26T00:00:00.000Z",
          });
        }
      }
      if (options.streamTool) {
        for (const listener of listeners) {
          listener({
            ...snapshot.key,
            type: "tool_update",
            runId: "run-1",
            tool: {
              type: "tool",
              id: "command-live",
              name: "Command",
              kind: "command",
              status: "running",
              input: "pwd",
              output: "/work",
            },
            occurredAt: "2026-08-26T00:00:00.000Z",
          });
        }
      }
      if (options.interaction) {
        for (const listener of listeners) {
          listener({
            ...snapshot.key,
            type: "interaction_requested",
            runId: "run-1",
            occurredAt: "2026-08-26T00:00:00.000Z",
            request: {
              requestId: "approval-1",
              kind: "approval",
              title: "Approve command?",
              message: "Run git status?",
              options: [
                { value: "accept", label: "Yes" },
                { value: "decline", label: "No" },
              ],
            },
          });
        }
      }
      return { ...snapshot.key, runId: "run-1", admitted: true };
    },
    async steerRun(input) { return { ...snapshot.key, runId: input.runId, admitted: true }; },
    async abortRun() {},
    async resolveInteraction(input) { options.onSelected?.(input.selected); },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispose() { listeners.clear(); },
  };
}

describe("hosted Pho Code runtime", () => {
  test("routes a non-Pi session and projects its native tool into the existing transcript", async () => {
    const raw = {
      ...createDisposableStubHarnessRuntime(),
      inspectWorkspace: async () => workspace,
      listWorkspaceSessions: async () => [],
      listSessionActivity: () => [],
      subscribe: (_listener: (event: RuntimeEvent) => void) => () => undefined,
    };
    const runtime = hostPhoCodeRuntime(raw, { backends: [fakeCodexBackend()] });
    await runtime.inspectWorkspace({ path: "/workspace", approveProjectResources: true });

    const snapshot = await runtime.createSession("/workspace", "codex");
    expect(runtime.listAgentBackends().map(({ id }) => id)).toEqual(["pi", "codex"]);
    expect(snapshot.session).toMatchObject({ id: "codex-session", backendId: "codex" });
    expect(snapshot.model).toMatchObject({ provider: "codex", id: "gpt-5.4", name: "GPT-5.4" });
    expect(snapshot.models).toHaveLength(2);
    expect(snapshot.messages[0]?.blocks[0]).toMatchObject({
      type: "tool",
      callId: "command-1",
      kind: "command",
      inputPreview: "pwd",
    });
    expect(await runtime.listWorkspaceSessions("/workspace")).toContainEqual(snapshot.session);

    const admission = await runtime.sendPrompt({
      backendId: "codex",
      workspaceId: "/workspace",
      sessionId: "codex-session",
      text: "Continue",
    });
    expect(admission).toMatchObject({ backendId: "codex", admitted: true });
    await runtime.dispose();
  });

  test("routes backend model selection and text deltas through Pho Code protocol", async () => {
    const raw = {
      ...createDisposableStubHarnessRuntime(),
      inspectWorkspace: async () => workspace,
      listWorkspaceSessions: async () => [],
      listSessionActivity: () => [],
      subscribe: (_listener: (event: RuntimeEvent) => void) => () => undefined,
    };
    const runtime = hostPhoCodeRuntime(raw, { backends: [fakeCodexBackend({ streamDelta: "Hello", streamTool: true })] });
    const events: RuntimeEvent[] = [];
    runtime.subscribe((event) => events.push(event));
    await runtime.inspectWorkspace({ path: "/workspace", approveProjectResources: true });
    const created = await runtime.createSession("/workspace", "codex");
    const changed = await runtime.setSessionModel({
      backendId: "codex",
      workspaceId: "/workspace",
      sessionId: created.session.id,
      provider: "codex",
      id: "gpt-5.3-codex",
    });
    expect(changed.model?.id).toBe("gpt-5.3-codex");
    expect((await runtime.setThinkingLevel({
      backendId: "codex",
      workspaceId: "/workspace",
      sessionId: created.session.id,
      level: "high",
    })).thinkingLevel).toBe("high");
    expect((await runtime.setFastMode({
      backendId: "codex",
      workspaceId: "/workspace",
      sessionId: created.session.id,
      enabled: true,
    })).fastMode?.enabled).toBe(true);
    await runtime.sendPrompt({
      backendId: "codex",
      workspaceId: "/workspace",
      sessionId: created.session.id,
      text: "Continue",
    });
    expect(events.find((event) => event.type === "textDelta")).toMatchObject({
      backendId: "codex",
      payload: { runId: "run-1", delta: "Hello" },
    });
    expect(events.find((event) => event.type === "toolEvent")).toMatchObject({
      payload: { callId: "command-live", outputPreview: "/work", status: "running" },
    });
    await runtime.dispose();
  });

  test("projects and resolves a backend approval through the existing host dialog", async () => {
    let selected: string | undefined;
    const raw = {
      ...createDisposableStubHarnessRuntime(),
      inspectWorkspace: async () => workspace,
      listWorkspaceSessions: async () => [],
      listSessionActivity: () => [],
      subscribe: (_listener: (event: RuntimeEvent) => void) => () => undefined,
    };
    const runtime = hostPhoCodeRuntime(raw, {
      backends: [fakeCodexBackend({ interaction: true, onSelected: (value) => { selected = value; } })],
    });
    const events: RuntimeEvent[] = [];
    runtime.subscribe((event) => events.push(event));
    await runtime.inspectWorkspace({ path: "/workspace", approveProjectResources: true });
    const created = await runtime.createSession("/workspace", "codex");
    await runtime.sendPrompt({
      backendId: "codex",
      workspaceId: "/workspace",
      sessionId: created.session.id,
      text: "Continue",
    });

    const dialogEvent = events.find((event) => event.type === "extensionDialogRequest");
    expect(dialogEvent?.payload).toMatchObject({
      requestId: "approval-1",
      backendId: "codex",
      kind: "select",
      options: ["Yes", "No"],
    });
    await runtime.resolveHostDialog({
      requestId: "approval-1",
      backendId: "codex",
      workspaceId: "/workspace",
      sessionId: created.session.id,
      selected: "Yes",
    });
    expect(selected).toBe("accept");
    await runtime.dispose();
  });
});
