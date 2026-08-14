import { describe, expect, test } from "bun:test";
import type { SessionActivitySummary } from "@pho-code/protocol";
import { sessionActivityLabel, sessionRowActivity } from "../src/lib/session-activity";

function summary(partial: Partial<SessionActivitySummary> = {}): SessionActivitySummary {
  return {
    workspaceId: "/tmp/ws",
    sessionId: "s1",
    phase: "idle",
    selected: false,
    archived: false,
    unread: false,
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...partial,
  };
}

describe("session activity presentation", () => {
  test("labels owner-facing phases", () => {
    expect(sessionActivityLabel("working")).toBe("Working");
    expect(sessionActivityLabel("attention")).toBe("Needs attention");
    expect(sessionActivityLabel("completed")).toBe("Completed");
    expect(sessionActivityLabel("failed")).toBe("Failed");
  });

  test("hides read completed and failed outcomes", () => {
    expect(sessionRowActivity(summary({ phase: "completed", unread: false }))).toBeUndefined();
    expect(sessionRowActivity(summary({ phase: "failed", unread: false }))).toBeUndefined();
    expect(sessionRowActivity(summary({ phase: "completed", unread: true }))).toEqual({
      phase: "completed",
      label: "Completed",
    });
    expect(sessionRowActivity(summary({ phase: "working" }))).toEqual({
      phase: "working",
      label: "Working",
    });
  });
});
