import { describe, expect, test } from "bun:test";
import { emptyFeatureSnapshot, idleRunState, type SessionSnapshot } from "@pho-code/protocol";
import { isEmptyConversation } from "../src/lib/empty-conversation";

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
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
      displayName: "piui",
      lastOpenedAt: "2026-08-13T00:00:00.000Z",
      projectResourcesApproved: true,
    },
    messages: [],
    run: idleRunState(),
    models: [],
    sessions: [],
    features: emptyFeatureSnapshot(),
    thinkingLevel: "off",
    availableThinkingLevels: ["off"],
    supportsThinking: false,
    ...overrides,
  };
}

describe("isEmptyConversation", () => {
  test("is true for a live session with no messages or run activity", () => {
    expect(isEmptyConversation(snapshot())).toBe(true);
  });

  test("is false once a user message exists", () => {
    expect(
      isEmptyConversation(
        snapshot({
          messages: [{ id: "m1", role: "user", blocks: [{ type: "text", text: "hello" }] }],
        }),
      ),
    ).toBe(false);
  });

  test("is false while a run is admitted or streaming", () => {
    expect(isEmptyConversation(snapshot({ run: { ...idleRunState(), status: "admitted", runId: "r1" } }))).toBe(false);
    expect(
      isEmptyConversation(snapshot({ run: { ...idleRunState(), status: "streaming", streamingText: "Hi" } })),
    ).toBe(false);
  });
});
