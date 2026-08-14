import { describe, expect, test } from "bun:test";
import type { RecentWorkspaceRecord, SessionCatalogEntry } from "@pho-code/protocol";
import {
  collectJumpBackSessions,
  lastOpenedProject,
  timeOfDayGreeting,
} from "../src/lib/welcome-recents";

function project(id: string, lastOpenedAt: string): RecentWorkspaceRecord {
  return {
    id,
    path: `/tmp/${id}`,
    displayName: id,
    lastOpenedAt,
  };
}

function session(
  workspaceId: string,
  sessionId: string,
  updatedAt: string,
  archived = false,
): SessionCatalogEntry {
  return {
    workspaceId,
    sessionId,
    title: sessionId,
    updatedAt,
    archived,
    activity: {
      workspaceId,
      sessionId,
      phase: "idle",
      selected: false,
      archived,
      unread: false,
      updatedAt,
    },
  };
}

describe("welcome recents", () => {
  test("greets by local hour", () => {
    expect(timeOfDayGreeting(new Date(2026, 7, 14, 8))).toBe("Good morning");
    expect(timeOfDayGreeting(new Date(2026, 7, 14, 15))).toBe("Good afternoon");
    expect(timeOfDayGreeting(new Date(2026, 7, 14, 21))).toBe("Good evening");
  });

  test("picks the most recently opened project without sorting a copy", () => {
    expect(
      lastOpenedProject([
        project("older", "2026-08-01T00:00:00.000Z"),
        project("newer", "2026-08-14T00:00:00.000Z"),
        project("mid", "2026-08-10T00:00:00.000Z"),
      ])?.id,
    ).toBe("newer");
    expect(lastOpenedProject([])).toBeUndefined();
  });

  test("collects the latest non-archived sessions across projects", () => {
    const rows = collectJumpBackSessions(
      [project("alpha", "2026-08-14T00:00:00.000Z"), project("beta", "2026-08-13T00:00:00.000Z")],
      {
        alpha: [
          session("alpha", "old", "2026-08-01T00:00:00.000Z"),
          session("alpha", "archived", "2026-08-20T00:00:00.000Z", true),
        ],
        beta: [session("beta", "fresh", "2026-08-14T12:00:00.000Z")],
      },
      3,
    );
    expect(rows.map((row) => row.session.sessionId)).toEqual(["fresh", "old"]);
    expect(rows[0]?.workspaceName).toBe("beta");
  });
});
