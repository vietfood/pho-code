import { describe, expect, test } from "bun:test";
import type { SessionCatalogEntry, SessionSummary } from "@pho-code/protocol";
import {
  idleCatalogActivity,
  mergeActivityIntoCatalog,
  removeCatalogSession,
  upsertCatalogSession,
} from "../../src/session-catalog-state";

function summary(partial: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s1",
    workspaceId: "/tmp/ws",
    title: "New session",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...partial,
  };
}

function entry(partial: Partial<SessionCatalogEntry> = {}): SessionCatalogEntry {
  const session = summary();
  return {
    workspaceId: session.workspaceId,
    sessionId: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    archived: false,
    activity: idleCatalogActivity(session),
    ...partial,
  };
}

describe("session catalog state", () => {
  test("inserts a new row at the front without copying unrelated workspaces", () => {
    const other: SessionCatalogEntry[] = [entry({ workspaceId: "/tmp/other", sessionId: "other" })];
    const current = { "/tmp/other": other };
    const next = upsertCatalogSession(current, summary({ title: "Hello" }));
    expect(next["/tmp/other"]).toBe(other);
    expect(next["/tmp/ws"]?.[0]?.title).toBe("Hello");
    expect(next["/tmp/ws"]?.[0]?.activity.phase).toBe("idle");
  });

  test("returns the same object when title, time, and preview are unchanged", () => {
    const current = { "/tmp/ws": [entry()] };
    expect(upsertCatalogSession(current, summary())).toBe(current);
  });

  test("patches title and preview in place and keeps activity", () => {
    const existing = entry({
      activity: { ...idleCatalogActivity(summary()), phase: "working", runId: "r1" },
    });
    const next = upsertCatalogSession({ "/tmp/ws": [existing] }, summary({ title: "Done", preview: "ok" }));
    expect(next["/tmp/ws"]?.[0]?.title).toBe("Done");
    expect(next["/tmp/ws"]?.[0]?.preview).toBe("ok");
    expect(next["/tmp/ws"]?.[0]?.activity.phase).toBe("working");
    expect(next["/tmp/ws"]?.[0]?.activity.runId).toBe("r1");
  });

  test("removes a row and no-ops when it is already gone", () => {
    const current = { "/tmp/ws": [entry(), entry({ sessionId: "s2", title: "Keep" })] };
    const removed = removeCatalogSession(current, "/tmp/ws", "s1");
    expect(removed["/tmp/ws"]?.map((row) => row.sessionId)).toEqual(["s2"]);
    expect(removeCatalogSession(removed, "/tmp/ws", "s1")).toBe(removed);
  });

  test("merges activity onto matching rows only", () => {
    const current = { "/tmp/ws": [entry(), entry({ sessionId: "s2" })] };
    const next = mergeActivityIntoCatalog(current, [
      { ...idleCatalogActivity(summary()), phase: "working", runId: "r1" },
    ]);
    expect(next["/tmp/ws"]?.[0]?.activity.phase).toBe("working");
    expect(next["/tmp/ws"]?.[1]?.activity.phase).toBe("idle");
  });
});
