import { describe, expect, test } from "bun:test";
import {
  PROTOCOL_VERSION,
  RUNTIME_EVENT_TYPES,
  activityRank,
  applyRuntimeEvent,
  applyRuntimeEventToCache,
  compareSessionActivity,
  emptyConversationCache,
  emptyConversationState,
  emptyFeatureSnapshot,
  emptyGitHubMcpSettingsSnapshot,
  emptySandboxSettingsSnapshot,
  emptySkillSettingsSnapshot,
  HARNESS_ERROR_CODES,
  idleRunState,
  isJsonSafeValue,
  isSessionKey,
  jsonRoundTrip,
  parseSessionKeyId,
  requireMatchingSessionKey,
  sessionActivityPhase,
  sessionKeyEquals,
  sessionKeyId,
  visibleActivityPhase,
  type SessionActivitySummary,
  type SessionSnapshot,
} from "../src/index";

function key(workspaceId: string, sessionId: string) {
  return { workspaceId, sessionId };
}

function snapshotFor(workspaceId: string, sessionId: string, runId = "run-a"): SessionSnapshot {
  return {
    session: {
      id: sessionId,
      workspaceId,
      title: sessionId,
      updatedAt: "2026-08-14T00:00:00.000Z",
    },
    workspace: {
      id: workspaceId,
      path: workspaceId,
      displayName: "ws",
      lastOpenedAt: "2026-08-14T00:00:00.000Z",
      projectResourcesApproved: true,
    },
    messages: [],
    run: { ...idleRunState(), runId, status: "streaming" },
    models: [],
    sessions: [],
    features: emptyFeatureSnapshot(),
    thinkingLevel: "off",
    availableThinkingLevels: ["off"],
    supportsThinking: false,
  };
}

function activity(partial: Partial<SessionActivitySummary> & { sessionId: string }): SessionActivitySummary {
  return {
    workspaceId: "/tmp/ws",
    phase: "idle",
    selected: false,
    archived: false,
    unread: false,
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...partial,
  };
}

describe("session keys", () => {
  test("equal only when workspace and session both match", () => {
    expect(sessionKeyEquals(key("/tmp/a", "s1"), key("/tmp/a", "s1"))).toBe(true);
    expect(sessionKeyEquals(key("/tmp/a", "s1"), key("/tmp/b", "s1"))).toBe(false);
    expect(sessionKeyEquals(key("/tmp/a", "s1"), key("/tmp/a", "s2"))).toBe(false);
    expect(isSessionKey(key("/tmp/a", "s1"))).toBe(true);
    expect(isSessionKey({ workspaceId: "", sessionId: "s1" })).toBe(false);
  });

  test("round-trips through a composite id without colliding on special characters", () => {
    const original = key("/tmp/ws\u001fodd", "id/with spaces");
    const encoded = sessionKeyId(original);
    expect(parseSessionKeyId(encoded)).toEqual(original);
    expect(sessionKeyId(key("/tmp/a", "s1"))).not.toBe(sessionKeyId(key("/tmp/a/s1", "")));
  });

  test("rejects mismatched workspace or session commands", () => {
    const expected = key("/tmp/a", "s1");
    expect(() => requireMatchingSessionKey(expected, { sessionId: "s1" }, "sendPrompt")).toThrow(
      /requires workspaceId and sessionId/,
    );
    try {
      requireMatchingSessionKey(expected, key("/tmp/b", "s1"), "sendPrompt");
      throw new Error("expected mismatch to throw");
    } catch (error) {
      expect(error).toMatchObject({
        code: HARNESS_ERROR_CODES.sessionNotFound,
        operation: "sendPrompt",
        recoverable: true,
      });
    }
  });
});

describe("session activity precedence", () => {
  test("ranks attention above working, failed, unread completed, and idle", () => {
    const ranked = [
      activity({ sessionId: "idle", phase: "idle" }),
      activity({ sessionId: "done", phase: "completed", unread: true }),
      activity({ sessionId: "failed", phase: "failed", unread: true }),
      activity({ sessionId: "work", phase: "working" }),
      activity({ sessionId: "ask", phase: "attention" }),
    ].sort(compareSessionActivity);
    expect(ranked.map((entry) => entry.sessionId)).toEqual(["ask", "work", "failed", "done", "idle"]);
    expect(activityRank(activity({ sessionId: "read", phase: "completed", unread: false }))).toBe(
      activityRank(activity({ sessionId: "idle", phase: "idle" })),
    );
  });

  test("derives owner-facing phase from attention, working, and unread outcome", () => {
    expect(sessionActivityPhase({ attention: true, working: true, unreadOutcome: "failed" })).toBe("attention");
    expect(sessionActivityPhase({ attention: false, working: true })).toBe("working");
    expect(sessionActivityPhase({ attention: false, working: false, unreadOutcome: "failed" })).toBe("failed");
    expect(sessionActivityPhase({ attention: false, working: false, unreadOutcome: "completed" })).toBe("completed");
    expect(sessionActivityPhase({ attention: false, working: false })).toBe("idle");
    expect(visibleActivityPhase({ phase: "completed", unread: true })).toBe("completed");
    expect(visibleActivityPhase({ phase: "completed", unread: false })).toBeUndefined();
    expect(visibleActivityPhase({ phase: "working", unread: false })).toBe("working");
  });
});

describe("keyed conversation routing", () => {
  test("ignores a background delta on the selected conversation reducer", () => {
    let state = applyRuntimeEvent(emptyConversationState(), {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: snapshotFor("/tmp/a", "s1"),
      occurredAt: "2026-08-14T00:00:00.000Z",
      sessionId: "s1",
      workspaceId: "/tmp/a",
    });
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 2,
      type: RUNTIME_EVENT_TYPES.textDelta,
      payload: { runId: "run-b", delta: "from-other-chat" },
      occurredAt: "2026-08-14T00:00:01.000Z",
      sessionId: "s2",
      workspaceId: "/tmp/a",
      runId: "run-b",
    });
    expect(state.snapshot?.session.id).toBe("s1");
    expect(state.snapshot?.run.streamingText).toBe("");
    expect(state.lastSequence).toBe(2);
  });

  test("ignores a same session id from another workspace", () => {
    let state = applyRuntimeEvent(emptyConversationState(), {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: snapshotFor("/tmp/a", "s1"),
      occurredAt: "2026-08-14T00:00:00.000Z",
      sessionId: "s1",
      workspaceId: "/tmp/a",
    });
    state = applyRuntimeEvent(state, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 2,
      type: RUNTIME_EVENT_TYPES.textDelta,
      payload: { runId: "run-b", delta: "from-other-workspace" },
      occurredAt: "2026-08-14T00:00:01.000Z",
      sessionId: "s1",
      workspaceId: "/tmp/b",
      runId: "run-b",
    });
    expect(state.snapshot?.workspace.id).toBe("/tmp/a");
    expect(state.snapshot?.run.streamingText).toBe("");
  });

  test("routes background events only to their owner in the keyed cache", () => {
    let cache = emptyConversationCache();
    cache = applyRuntimeEventToCache(cache, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: snapshotFor("/tmp/a", "s1"),
      occurredAt: "2026-08-14T00:00:00.000Z",
      sessionId: "s1",
      workspaceId: "/tmp/a",
      runId: "run-a",
    });
    cache = applyRuntimeEventToCache(cache, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 2,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: snapshotFor("/tmp/a", "s2", "run-b"),
      occurredAt: "2026-08-14T00:00:01.000Z",
      sessionId: "s2",
      workspaceId: "/tmp/a",
      runId: "run-b",
    });
    cache = applyRuntimeEventToCache(cache, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 3,
      type: RUNTIME_EVENT_TYPES.textDelta,
      payload: { runId: "run-b", delta: "background" },
      occurredAt: "2026-08-14T00:00:02.000Z",
      sessionId: "s2",
      workspaceId: "/tmp/a",
      runId: "run-b",
    });
    const first = cache.byKey[sessionKeyId(key("/tmp/a", "s1"))];
    const second = cache.byKey[sessionKeyId(key("/tmp/a", "s2"))];
    expect(first?.snapshot?.run.streamingText).toBe("");
    expect(second?.snapshot?.run.streamingText).toBe("background");
  });

  test("keeps catalog activity JSON-safe and free of transcript or paths beyond workspace identity", () => {
    const summary: SessionActivitySummary = {
      workspaceId: "/tmp/ws",
      sessionId: "s1",
      phase: "working",
      selected: true,
      archived: false,
      unread: false,
      runId: "run-a",
      updatedAt: "2026-08-14T00:00:00.000Z",
    };
    expect(isJsonSafeValue(summary)).toBe(true);
    expect(jsonRoundTrip(summary)).toEqual(summary);
    expect(JSON.stringify(summary)).not.toContain("rm ");
    expect(JSON.stringify(summary)).not.toContain(".jsonl");
  });

  test("keeps process settings when a process-scoped event arrives on a selected chat", () => {
    const settings = processSettings();
    const selectedKey = sessionKeyId(key("/tmp/ws", "s1"));
    const cache = applyRuntimeEventToCache(
      {
        ...emptyConversationCache(),
        settings,
        selectedKey,
        byKey: {
          [selectedKey]: { ...emptyConversationState(), snapshot: snapshotFor("/tmp/ws", "s1") },
        },
      },
      {
        protocolVersion: PROTOCOL_VERSION,
        sequence: 1,
        type: RUNTIME_EVENT_TYPES.permissionStatus,
        payload: { yoloMode: true },
        occurredAt: "2026-08-14T00:00:00.000Z",
      },
    );
    expect(cache.settings?.appearance).toEqual(settings.appearance);
    expect(cache.settings?.permission.yoloMode).toBe(true);
  });

  test("preserves process settings when an auth flow starts with no selected chat", () => {
    const settings = processSettings();
    const cache = applyRuntimeEventToCache(
      { ...emptyConversationCache(), settings },
      {
        protocolVersion: PROTOCOL_VERSION,
        sequence: 1,
        type: RUNTIME_EVENT_TYPES.providerAuthFlow,
        payload: {
          flowId: "flow-1",
          providerId: "pho-test-oauth",
          method: "oauth",
          phase: "prompting",
          revision: 1,
          startedAt: "2026-08-14T00:00:00.000Z",
          updatedAt: "2026-08-14T00:00:00.000Z",
        },
        occurredAt: "2026-08-14T00:00:00.000Z",
      },
    );
    expect(cache.settings).toEqual(settings);
    expect(cache.authFlow?.flowId).toBe("flow-1");
  });
});

function processSettings() {
  return {
    appearance: {
      palette: "default" as const,
      mode: "dark" as const,
      glassEnabled: false,
      glassStrength: 55,
      uiFontSize: 18,
      chatFontSize: 16,
    },
    permission: {
      profile: "balanced" as const,
      yoloMode: false,
      permissionReviewLog: false,
      projectOverridePresent: false,
      projectPermissionRulesTrusted: false,
      projectPermissionRulesRemembered: false,
      appliesToSharedPiAgentDir: false,
    },
    skills: emptySkillSettingsSnapshot(),
    githubMcp: emptyGitHubMcpSettingsSnapshot(),
    sandbox: emptySandboxSettingsSnapshot(),
  };
}
