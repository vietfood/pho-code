import { describe, expect, test } from "bun:test";
import {
  applyRuntimeEvent,
  COMPACTION_COPY,
  emptyConversationState,
  idleAgentCompactionState,
  idleRunState,
  isAgentCompactionState,
  isTranscriptCompactionBoundary,
  jsonRoundTrip,
  PROTOCOL_COMMANDS,
  RUNTIME_EVENT_TYPES,
  type CompactionStateChangedPayload,
  type SessionSnapshot,
  type TranscriptItem,
} from "../src/index";

function snapshotWithMessages(messages: TranscriptItem[]): SessionSnapshot {
  return {
    session: { id: "s1", workspaceId: "/tmp/ws", title: "Chat", updatedAt: "2026-09-01T00:00:00.000Z" },
    workspace: {
      id: "/tmp/ws",
      path: "/tmp/ws",
      displayName: "ws",
      lastOpenedAt: "2026-09-01T00:00:00.000Z",
      projectResourcesApproved: true,
    },
    messages,
    run: idleRunState(),
    compaction: idleAgentCompactionState(),
    models: [],
    sessions: [],
    features: { extensions: [], skills: [], prompts: [], packages: [], mcpServers: [] },
    thinkingLevel: "off",
    availableThinkingLevels: ["off"],
    supportsThinking: false,
  };
}

describe("compaction protocol", () => {
  test("exposes the three compaction commands", () => {
    expect(PROTOCOL_COMMANDS.compactSession).toBe("compactSession");
    expect(PROTOCOL_COMMANDS.cancelSessionCompaction).toBe("cancelSessionCompaction");
    expect(PROTOCOL_COMMANDS.getCompactionDetail).toBe("getCompactionDetail");
  });

  test("transcript items mix messages and compaction boundaries", () => {
    const items: TranscriptItem[] = [
      { id: "m1", role: "user", blocks: [{ type: "text", text: "hello" }] },
      {
        kind: "compaction",
        id: "c1",
        createdAt: "2026-09-01T01:00:00.000Z",
        reason: "manual",
        tokensBefore: 1_000,
        hasSummary: true,
        fromHook: false,
      },
      { id: "m2", role: "assistant", blocks: [{ type: "text", text: "after" }] },
    ];
    expect(isTranscriptCompactionBoundary(items[0])).toBe(false);
    expect(isTranscriptCompactionBoundary(items[1])).toBe(true);
    expect(isTranscriptCompactionBoundary(items[2])).toBe(false);
    const roundTripped = jsonRoundTrip(items);
    expect(isTranscriptCompactionBoundary(roundTripped[1])).toBe(true);
  });

  test("compactionStateChanged patches the snapshot compaction state", () => {
    const snapshot = snapshotWithMessages([]);
    let state = applyRuntimeEvent(emptyConversationState(), {
      protocolVersion: 1,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: snapshot,
      occurredAt: "2026-09-01T00:00:00.000Z",
    });
    const payload: CompactionStateChangedPayload = {
      workspaceId: "/tmp/ws",
      sessionId: "s1",
      compaction: {
        status: "compacting",
        reason: "manual",
        startedAt: "2026-09-01T00:00:01.000Z",
        cancelable: true,
      },
    };
    state = applyRuntimeEvent(state, {
      protocolVersion: 1,
      sequence: 2,
      workspaceId: "/tmp/ws",
      sessionId: "s1",
      type: RUNTIME_EVENT_TYPES.compactionStateChanged,
      payload,
      occurredAt: "2026-09-01T00:00:01.000Z",
    });
    expect(state.snapshot?.compaction).toEqual(payload.compaction);
    expect(isAgentCompactionState(state.snapshot?.compaction)).toBe(true);

    state = applyRuntimeEvent(state, {
      protocolVersion: 1,
      sequence: 3,
      workspaceId: "/tmp/ws",
      sessionId: "s1",
      type: RUNTIME_EVENT_TYPES.compactionStateChanged,
      payload: {
        workspaceId: "/tmp/ws",
        sessionId: "s1",
        compaction: idleAgentCompactionState(),
        outcome: "completed",
        reason: "manual",
        compactionId: "c1",
      } satisfies CompactionStateChangedPayload,
      occurredAt: "2026-09-01T00:00:02.000Z",
    });
    expect(state.snapshot?.compaction).toEqual({ status: "idle", cancelable: false });
  });

  test("compactionStateChanged for another session leaves the snapshot alone", () => {
    const snapshot = snapshotWithMessages([]);
    const state = applyRuntimeEvent(emptyConversationState(), {
      protocolVersion: 1,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: snapshot,
      occurredAt: "2026-09-01T00:00:00.000Z",
    });
    const next = applyRuntimeEvent(state, {
      protocolVersion: 1,
      sequence: 2,
      workspaceId: "/tmp/ws",
      sessionId: "other",
      type: RUNTIME_EVENT_TYPES.compactionStateChanged,
      payload: {
        workspaceId: "/tmp/ws",
        sessionId: "other",
        compaction: { status: "compacting", reason: "manual", startedAt: "x", cancelable: true },
      } satisfies CompactionStateChangedPayload,
      occurredAt: "2026-09-01T00:00:01.000Z",
    });
    expect(next.snapshot?.compaction).toEqual({ status: "idle", cancelable: false });
  });

  test("owner-facing copy stays honest about current vs cumulative usage", () => {
    expect(COMPACTION_COPY.action).toBe("Compact context");
    expect(COMPACTION_COPY.usageNote).toContain("cumulative");
  });
});
