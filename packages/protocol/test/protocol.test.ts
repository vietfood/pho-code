import { describe, expect, test } from "bun:test";
import {
  INTENDED_PI_SDK,
  PINNED_ELECTRON,
  PROTOCOL_VERSION,
  RUNTIME_EVENT_TYPES,
  applyRuntimeEvent,
  assertJsonSafe,
  commandFail,
  commandOk,
  createHarnessError,
  emptyConversationState,
  emptyFeatureSnapshot,
  idleRunState,
  isCommandResult,
  isJsonSafeValue,
  isSupportedProtocolVersion,
  jsonRoundTrip,
  nodeVersionMeetsMinimum,
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

  test("settings snapshots are JSON-safe", () => {
    const snapshot = {
      appearance: { theme: "dark" as const },
      permission: {
        profile: "guarded" as const,
        yoloMode: false,
        permissionReviewLog: true,
        projectOverridePresent: false,
        appliesToSharedPiAgentDir: true as const,
      },
    };
    expect(isJsonSafeValue(snapshot)).toBe(true);
    expect(jsonRoundTrip(snapshot)).toEqual(snapshot);
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
    models: [],
    sessions: [],
    features: emptyFeatureSnapshot(),
    thinkingLevel: "off",
    availableThinkingLevels: ["off"],
    supportsThinking: false,
  };
}
