import { describe, expect, test } from "bun:test";
import {
  INTENDED_PI_SDK,
  PINNED_ELECTRON,
  PROTOCOL_VERSION,
  RUNTIME_EVENT_TYPES,
  applyLiveRunDelta,
  applyRuntimeEvent,
  assertJsonSafe,
  commandFail,
  commandOk,
  createHarnessError,
  emptyConversationState,
  emptyFeatureSnapshot,
  emptyGitHubMcpSettingsSnapshot,
  emptySkillSettingsSnapshot,
  glassCssTokens,
  idleRunState,
  isCommandResult,
  isJsonSafeValue,
  isSafeHttpUrl,
  hostnameFromHttpUrl,
  isSupportedProtocolVersion,
  isWorkspaceReferenceToken,
  isWebSourceRecord,
  isLiveRunDeltaType,
  jsonRoundTrip,
  mergeLiveRun,
  nodeVersionMeetsMinimum,
  providerDisclosureCopy,
  runtimeEventUpdatesSessionList,
  unwrapCommandResult,
  type BootstrapState,
  type SessionSnapshot,
} from "../src/index";

function sampleBootstrapState(): BootstrapState {
  return {
    protocolVersion: PROTOCOL_VERSION,
    appName: "Pho Code",
    milestone: "vertical-slice",
    capabilities: {
      piRuntime: true,
    },
    versions: {
      electron: PINNED_ELECTRON.version,
      embeddedNode: "24.18.1",
    },
    embeddedNodeCompatible: true,
    intendedPiSdk: {
      packageName: INTENDED_PI_SDK.packageName,
      version: INTENDED_PI_SDK.version,
      enginesNode: INTENDED_PI_SDK.enginesNode,
    },
    recentWorkspaces: [],
    sessions: [],
    models: [],
  };
}

describe("protocol serialization", () => {
  test("bootstrap state survives a JSON round trip", () => {
    const state = sampleBootstrapState();
    const roundTrip = jsonRoundTrip(state);
    expect(roundTrip).toEqual(state);
    expect(isJsonSafeValue(state)).toBe(true);
  });

  test("rejects class instances, functions, undefined, sparse arrays, cycles, and custom serialization", () => {
    expect(isJsonSafeValue(() => undefined)).toBe(false);
    expect(isJsonSafeValue(new Date())).toBe(false);
    expect(isJsonSafeValue({ nested: undefined })).toBe(false);
    expect(isJsonSafeValue({ ok: "value" })).toBe(true);

    const sparse: unknown[] = [];
    sparse.length = 2;
    sparse[1] = "kept";
    expect(isJsonSafeValue(sparse)).toBe(false);
    expect(JSON.parse(JSON.stringify(sparse))).toEqual([null, "kept"]);

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(isJsonSafeValue(cyclic)).toBe(false);

    expect(isJsonSafeValue({ toJSON: () => "nope" })).toBe(false);
    expect(isJsonSafeValue({ [Symbol("secret")]: true })).toBe(false);
    expect(isJsonSafeValue(Number.NaN)).toBe(false);
  });

  test("accepts repeated references that JSON serializes without a cycle", () => {
    const shared = { type: "error", message: "Feature failed" };
    expect(isJsonSafeValue({ diagnostics: [shared], features: [{ diagnostics: [shared] }] })).toBe(true);
  });

  test("identifies the unsafe field without exposing its value", () => {
    expect(() => assertJsonSafe({ features: { diagnostics: [{ path: undefined }] } }, "snapshot")).toThrow(
      "Value at $.features.diagnostics[0].path is not JSON-safe.",
    );
  });

  test("accepts protocol version 1 and rejects unknown versions", () => {
    expect(isSupportedProtocolVersion(1)).toBe(true);
    expect(isSupportedProtocolVersion(2)).toBe(false);
    expect(isSupportedProtocolVersion("1")).toBe(false);
  });

  test("normalizes harness errors without leaking extra fields", () => {
    const error = createHarnessError({
      code: "untrusted_sender",
      message: "Untrusted IPC sender",
      operation: "getBootstrapState",
    });
    expect(jsonRoundTrip(error)).toEqual(error);
    expect(error.recoverable).toBe(false);
  });

  test("treats Electron Node 24 as compatible with the intended Pi engine", () => {
    expect(nodeVersionMeetsMinimum("24.18.1", PINNED_ELECTRON.minimumEmbeddedNode)).toBe(true);
    expect(nodeVersionMeetsMinimum("22.19.0", PINNED_ELECTRON.minimumEmbeddedNode)).toBe(true);
    expect(nodeVersionMeetsMinimum("22.18.0", PINNED_ELECTRON.minimumEmbeddedNode)).toBe(false);
  });

  test("keeps workspace reference tokens JSON-safe and relative", () => {
    const token = { path: "src/composer.tsx", kind: "file" as const };
    expect(isWorkspaceReferenceToken(token)).toBe(true);
    expect(isWorkspaceReferenceToken({ path: "/tmp/secret", kind: "file" })).toBe(true);
    expect(isWorkspaceReferenceToken({ path: "src/composer.tsx" })).toBe(true);
    expect(isWorkspaceReferenceToken({ path: "" })).toBe(false);
    expect(isJsonSafeValue({ suggestions: [token], status: "ready" })).toBe(true);
    expect(jsonRoundTrip(token)).toEqual(token);
  });

  test("keeps web source records JSON-safe", () => {
    const source = { title: "Example", url: "https://example.com/doc", provider: "duckduckgo" as const };
    expect(isWebSourceRecord(source)).toBe(true);
    expect(isWebSourceRecord({ title: "Jina", url: "https://example.com/doc", provider: "jina" })).toBe(true);
    expect(isWebSourceRecord({ title: "Talk", url: "https://www.youtube.com/watch?v=abcdefghijk", provider: "youtube" })).toBe(true);
    expect(isWebSourceRecord({ title: "x", url: "file:///etc/passwd", provider: "http" })).toBe(false);
    expect(isJsonSafeValue({ sources: [source] })).toBe(true);
    expect(jsonRoundTrip(source)).toEqual(source);
  });

  test("ignores stale run deltas and older sequence numbers", () => {
    const snapshot = sampleSessionSnapshot("run-a");
    let state = applyRuntimeEvent(emptyConversationState(), {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 2,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: snapshot,
      occurredAt: "2026-08-13T00:00:00.000Z",
      sessionId: "s1",
      runId: "run-a",
    });
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.textDelta,
      payload: { runId: "run-a", delta: "old" },
      occurredAt: "2026-08-13T00:00:01.000Z",
      runId: "run-a",
    });
    expect(state.snapshot?.run.streamingText).toBe("");
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 3,
      type: RUNTIME_EVENT_TYPES.textDelta,
      payload: { runId: "run-b", delta: "stale" },
      occurredAt: "2026-08-13T00:00:02.000Z",
      runId: "run-b",
    });
    expect(state.snapshot?.run.streamingText).toBe("");
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 4,
      type: RUNTIME_EVENT_TYPES.textDelta,
      payload: { runId: "run-a", delta: "hi" },
      occurredAt: "2026-08-13T00:00:03.000Z",
      runId: "run-a",
    });
    expect(state.snapshot?.run.streamingText).toBe("hi");
  });

  test("classifies live-run deltas separately from session-list events", () => {
    expect(isLiveRunDeltaType(RUNTIME_EVENT_TYPES.textDelta)).toBe(true);
    expect(isLiveRunDeltaType(RUNTIME_EVENT_TYPES.thinkingDelta)).toBe(true);
    expect(isLiveRunDeltaType(RUNTIME_EVENT_TYPES.toolEvent)).toBe(true);
    expect(isLiveRunDeltaType(RUNTIME_EVENT_TYPES.runAdmitted)).toBe(false);
    expect(isLiveRunDeltaType(RUNTIME_EVENT_TYPES.runSettled)).toBe(false);
    expect(runtimeEventUpdatesSessionList(RUNTIME_EVENT_TYPES.sessionSnapshot)).toBe(true);
    expect(runtimeEventUpdatesSessionList(RUNTIME_EVENT_TYPES.runSettled)).toBe(true);
    expect(runtimeEventUpdatesSessionList(RUNTIME_EVENT_TYPES.textDelta)).toBe(false);
  });

  test("establishes a second run after a terminal snapshot and ignores a late first-run delta", () => {
    const runA = sampleSessionSnapshot("run-a");
    runA.run = { ...idleRunState(), runId: "run-a", status: "settled" };
    let state = applyRuntimeEvent(emptyConversationState(), {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: runA,
      occurredAt: "2026-08-13T00:00:00.000Z",
      sessionId: "s1",
      runId: "run-a",
    });
    expect(state.snapshot?.run.status).toBe("settled");

    const runB = sampleSessionSnapshot("run-b");
    runB.run = { ...idleRunState(), runId: "run-b", status: "admitted" };
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 2,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: runB,
      occurredAt: "2026-08-13T00:00:01.000Z",
      sessionId: "s1",
      runId: "run-b",
    });
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 3,
      type: RUNTIME_EVENT_TYPES.runAdmitted,
      payload: { sessionId: "s1", runId: "run-b", admitted: true },
      occurredAt: "2026-08-13T00:00:02.000Z",
      sessionId: "s1",
      runId: "run-b",
    });
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 4,
      type: RUNTIME_EVENT_TYPES.textDelta,
      payload: { runId: "run-b", delta: "second" },
      occurredAt: "2026-08-13T00:00:03.000Z",
      runId: "run-b",
    });
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 5,
      type: RUNTIME_EVENT_TYPES.textDelta,
      payload: { runId: "run-a", delta: "late-first" },
      occurredAt: "2026-08-13T00:00:04.000Z",
      runId: "run-a",
    });

    expect(state.snapshot?.run.runId).toBe("run-b");
    expect(state.snapshot?.run.streamingText).toBe("second");
    expect(state.lastSequence).toBe(5);
  });

  test("command results round-trip expected failures without extra fields", () => {
    const error = createHarnessError({
      code: "workspace_not_selected",
      message: "Select a workspace first.",
      operation: "createSession",
      recoverable: true,
    });
    const failed = commandFail(error);
    expect(isCommandResult(failed)).toBe(true);
    expect(jsonRoundTrip(failed)).toEqual(failed);
    expect(isJsonSafeValue(failed)).toBe(true);
    let thrown: unknown;
    try {
      unwrapCommandResult(failed);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toEqual(error);
    expect(unwrapCommandResult(commandOk({ admitted: true }))).toEqual({ admitted: true });
  });

  test("select dialog requests replace confirm dialogs and settle by request id", () => {
    const snapshot = sampleSessionSnapshot("run-a");
    snapshot.sessions = [
      {
        id: "s1",
        workspaceId: "/tmp/ws",
        title: "New session",
        updatedAt: "2026-08-13T00:00:00.000Z",
      },
    ];
    let state = applyRuntimeEvent(emptyConversationState(), {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: snapshot,
      occurredAt: "2026-08-13T00:00:00.000Z",
      sessionId: "s1",
    });
    expect(state.snapshot?.sessions).toHaveLength(1);

    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 2,
      type: RUNTIME_EVENT_TYPES.extensionDialogRequest,
      payload: {
        requestId: "dlg-1",
        kind: "select",
        title: "Allow harness_mark?",
        options: ["Yes", "No"],
      },
      occurredAt: "2026-08-13T00:00:01.000Z",
    });
    expect(state.dialog).toMatchObject({ kind: "select", requestId: "dlg-1" });

    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 3,
      type: RUNTIME_EVENT_TYPES.extensionDialogSettled,
      payload: { requestId: "dlg-1" },
      occurredAt: "2026-08-13T00:00:02.000Z",
    });
    expect(state.dialog).toBeNull();
  });

  test("interleaves thinking and tool work while streaming", () => {
    const snapshot = sampleSessionSnapshot("run-a");
    let state = applyRuntimeEvent(emptyConversationState(), {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: snapshot,
      occurredAt: "2026-08-13T00:00:00.000Z",
      sessionId: "s1",
      runId: "run-a",
    });
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 2,
      type: RUNTIME_EVENT_TYPES.thinkingDelta,
      payload: { runId: "run-a", delta: "plan A" },
      occurredAt: "2026-08-13T00:00:01.000Z",
      runId: "run-a",
    });
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 3,
      type: RUNTIME_EVENT_TYPES.toolEvent,
      payload: {
        runId: "run-a",
        callId: "t1",
        name: "bash",
        status: "running",
        inputPreview: '{"command":"ls"}',
        outputPreview: "",
      },
      occurredAt: "2026-08-13T00:00:02.000Z",
      runId: "run-a",
    });
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 4,
      type: RUNTIME_EVENT_TYPES.thinkingDelta,
      payload: { runId: "run-a", delta: "plan B" },
      occurredAt: "2026-08-13T00:00:03.000Z",
      runId: "run-a",
    });
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 5,
      type: RUNTIME_EVENT_TYPES.toolEvent,
      payload: {
        runId: "run-a",
        callId: "t1",
        name: "bash",
        status: "completed",
        inputPreview: "",
        outputPreview: "ok",
      },
      occurredAt: "2026-08-13T00:00:04.000Z",
      runId: "run-a",
    });

    expect(state.snapshot?.run.work).toEqual([
      { type: "thinking", text: "plan A" },
      {
        type: "tool",
        callId: "t1",
        name: "bash",
        status: "completed",
        inputPreview: '{"command":"ls"}',
        outputPreview: "ok",
      },
      { type: "thinking", text: "plan B" },
    ]);
  });

  test("mid-run session snapshots preserve live work and streaming text", () => {
    const snapshot = sampleSessionSnapshot("run-a");
    let state = applyRuntimeEvent(emptyConversationState(), {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: snapshot,
      occurredAt: "2026-08-13T00:00:00.000Z",
      sessionId: "s1",
      runId: "run-a",
    });
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 2,
      type: RUNTIME_EVENT_TYPES.thinkingDelta,
      payload: { runId: "run-a", delta: "keep me" },
      occurredAt: "2026-08-13T00:00:01.000Z",
      runId: "run-a",
    });
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 3,
      type: RUNTIME_EVENT_TYPES.textDelta,
      payload: { runId: "run-a", delta: "hello" },
      occurredAt: "2026-08-13T00:00:02.000Z",
      runId: "run-a",
    });

    const wiped = sampleSessionSnapshot("run-a");
    wiped.run = { ...idleRunState(), runId: "run-a", status: "streaming" };
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 4,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: wiped,
      occurredAt: "2026-08-13T00:00:03.000Z",
      sessionId: "s1",
      runId: "run-a",
    });

    expect(state.snapshot?.run.streamingText).toBe("hello");
    expect(state.snapshot?.run.work).toEqual([{ type: "thinking", text: "keep me" }]);
  });

  test("live run deltas accumulate thinking without a conversation snapshot", () => {
    const admitted = { ...idleRunState(), runId: "run-a", status: "admitted" as const };
    const first = applyLiveRunDelta(admitted, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 2,
      type: RUNTIME_EVENT_TYPES.thinkingDelta,
      payload: { runId: "run-a", delta: "Could interpret" },
      occurredAt: "2026-08-14T00:00:01.000Z",
      runId: "run-a",
    });
    const second = applyLiveRunDelta(first, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 3,
      type: RUNTIME_EVENT_TYPES.thinkingDelta,
      payload: { runId: "run-a", delta: " VAEs" },
      occurredAt: "2026-08-14T00:00:02.000Z",
      runId: "run-a",
    });
    expect(second.work).toEqual([{ type: "thinking", text: "Could interpret VAEs" }]);
    expect(applyLiveRunDelta(second, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 4,
      type: RUNTIME_EVENT_TYPES.thinkingDelta,
      payload: { runId: "run-b", delta: "other" },
      occurredAt: "2026-08-14T00:00:03.000Z",
      runId: "run-b",
    })).toEqual(second);
  });

  test("mergeLiveRun keeps in-flight thinking when a later snapshot is empty", () => {
    const live = applyLiveRunDelta(
      { ...idleRunState(), runId: "run-a", status: "streaming" },
      {
        protocolVersion: PROTOCOL_VERSION,
        sequence: 1,
        type: RUNTIME_EVENT_TYPES.thinkingDelta,
        payload: { runId: "run-a", delta: "keep me" },
        occurredAt: "2026-08-14T00:00:01.000Z",
        runId: "run-a",
      },
    );
    const opened = { ...idleRunState(), runId: "run-a", status: "streaming" as const };
    expect(mergeLiveRun(live, opened).work).toEqual([{ type: "thinking", text: "keep me" }]);
    expect(mergeLiveRun(live, idleRunState()).work).toEqual([]);
  });

  test("settings snapshots are JSON-safe", () => {
    const snapshot = {
      appearance: {
        palette: "default" as const,
        mode: "dark" as const,
        glassEnabled: false,
        glassStrength: 55,
        uiFontSize: 18,
        chatFontSize: 16,
      },
      permission: {
        profile: "developer" as const,
        yoloMode: false,
        permissionReviewLog: true,
        projectOverridePresent: false,
        projectPermissionRulesTrusted: false,
        projectPermissionRulesRemembered: false,
        appliesToSharedPiAgentDir: true as const,
      },
      skills: emptySkillSettingsSnapshot(),
      githubMcp: emptyGitHubMcpSettingsSnapshot(),
    };
    expect(isJsonSafeValue(snapshot)).toBe(true);
    expect(jsonRoundTrip(snapshot)).toEqual(snapshot);
  });

  test("glassCssTokens keep chrome readable and frost the composer more than the pane", () => {
    const mid = glassCssTokens(55);
    expect(mid.opacityPercent).toBeGreaterThanOrEqual(70);
    expect(mid.sidebarOpacityPercent).toBeGreaterThanOrEqual(52);
    expect(mid.sidebarOpacityPercent).toBeLessThan(mid.opacityPercent);
    expect(mid.composerOpacityPercent).toBeGreaterThan(mid.opacityPercent);
    expect(mid.composerOpacityPercent).toBeLessThanOrEqual(90);
    expect(mid.sidebarBlurPx).toBeGreaterThanOrEqual(mid.blurPx);
    expect(mid.blurPx).toBeLessThanOrEqual(20);

    const max = glassCssTokens(100);
    expect(max.opacityPercent).toBeGreaterThanOrEqual(60);
    expect(max.sidebarOpacityPercent).toBeGreaterThanOrEqual(52);
    expect(max.blurPx).toBeLessThanOrEqual(24);
  });

  test("session usage and model cost fields survive a JSON round trip", () => {
    const snapshot = sampleSessionSnapshot("run-usage");
    expect(snapshot.usage?.costUsd).toBe(0.012);
    expect(snapshot.contextUsage?.percent).toBe(0.78);
    expect(snapshot.model?.cost.input).toBe(1);
    expect(snapshot.model?.contextWindow).toBe(128_000);
    expect(isJsonSafeValue(snapshot)).toBe(true);
    expect(jsonRoundTrip(snapshot)).toEqual(snapshot);
  });

  test("queue state and prepared image summaries are JSON-safe and path-free", () => {
    const snapshot = sampleSessionSnapshot("run-queue");
    snapshot.queue = {
      steering: [{ text: "go left after this tool" }],
      followUp: [{ text: "then summarize" }],
      steeringMode: "one-at-a-time",
      followUpMode: "all",
    };
    snapshot.messages = [
      {
        id: "u-image",
        role: "user",
        blocks: [{ type: "image", name: "shot.png", mimeType: "image/png" }],
      },
    ];
    const image = {
      id: "img-1",
      name: "shot.png",
      mimeType: "image/png" as const,
      byteLength: 128,
      width: 32,
      height: 24,
      previewDataUrl: "data:image/jpeg;base64,abc",
    };
    expect(isJsonSafeValue(snapshot)).toBe(true);
    expect(isJsonSafeValue(image)).toBe(true);
    expect(jsonRoundTrip(snapshot)).toEqual(snapshot);
    expect(JSON.stringify(snapshot)).not.toContain("/Users");
    expect(JSON.stringify(image)).not.toContain("/tmp");
    expect(image.name).toBe("shot.png");
  });
});

function sampleSessionSnapshot(runId: string): SessionSnapshot {
  return {
    session: {
      id: "s1",
      workspaceId: "/tmp/ws",
      title: "New session",
      updatedAt: "2026-08-13T00:00:00.000Z",
    },
    workspace: {
      id: "/tmp/ws",
      path: "/tmp/ws",
      displayName: "ws",
      lastOpenedAt: "2026-08-13T00:00:00.000Z",
      projectResourcesApproved: true,
    },
    messages: [],
    run: { ...idleRunState(), runId, status: "admitted" },
    models: [
      {
        provider: "test",
        id: "echo",
        name: "Echo",
        contextWindow: 128_000,
        cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
      },
    ],
    model: {
      provider: "test",
      id: "echo",
      name: "Echo",
      contextWindow: 128_000,
      cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
    },
    sessions: [],
    features: emptyFeatureSnapshot(),
    thinkingLevel: "off",
    availableThinkingLevels: ["off"],
    supportsThinking: false,
    contextUsage: { tokens: 1_000, contextWindow: 128_000, percent: 0.78 },
    usage: {
      input: 800,
      output: 200,
      cacheRead: 100,
      cacheWrite: 50,
      total: 1_150,
      costUsd: 0.012,
    },
  };
}

describe("provider auth protocol", () => {
  test("accepts credential-less http(s) URLs and rejects the rest", () => {
    expect(isSafeHttpUrl("https://example.com/oauth")).toBe(true);
    expect(isSafeHttpUrl("http://127.0.0.1:8787/callback")).toBe(true);
    expect(isSafeHttpUrl("https://user:pass@example.com/oauth")).toBe(false);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
    expect(hostnameFromHttpUrl("https://auth.example.com/authorize?x=1")).toBe("auth.example.com");
    expect(hostnameFromHttpUrl("javascript:alert(1)")).toBeUndefined();
  });

  test("subscription disclosure is an authentication classification, not billing", () => {
    expect(providerDisclosureCopy("subscription-classified")).toContain("authentication type");
    expect(providerDisclosureCopy("subscription-classified")).toContain("not a guarantee of included plan usage or cost");
  });

  test("flow snapshots stay JSON-safe and apply through providerAuthFlow events", () => {
    const snapshot = {
      flowId: "flow-1",
      providerId: "openai-codex",
      method: "oauth" as const,
      phase: "awaiting_external" as const,
      revision: 3,
      startedAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:01.000Z",
      prompt: {
        promptId: "prompt-1",
        kind: "manual_code" as const,
        message: "Paste the code",
      },
      links: [{ linkId: "link-1", hostname: "auth.example.com", label: "Open browser" }],
      progress: "Waiting for authorization.",
    };
    expect(isJsonSafeValue(snapshot)).toBe(true);
    expect(jsonRoundTrip(snapshot)).toEqual(snapshot);
    expect(JSON.stringify(snapshot)).not.toContain("https://");

    const state = applyRuntimeEvent(emptyConversationState(), {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.providerAuthFlow,
      payload: snapshot,
      occurredAt: "2026-08-13T00:00:01.000Z",
    });
    expect(state.authFlow).toEqual(snapshot);
    expect(state.lastSequence).toBe(1);
  });
});
