import { describe, expect, test } from "bun:test";
import { isJsonSafeValue, jsonRoundTrip } from "@pho-code/protocol";
import {
  archiveSessionMetadata,
  emptyMetadata,
  getSessionLifecycle,
  markSessionViewed,
  parseMetadata,
  pruneOrphanSessionLifecycle,
  recordSessionOutcome,
  rememberWorkspace,
  restoreSessionMetadata,
  forgetSessionLifecycle,
  setAppearance,
  setSessionApprovalModeMetadata,
} from "../src/metadata";

function workspace(id: string) {
  return {
    id,
    path: `/tmp/${id}`,
    displayName: id,
    lastOpenedAt: "2026-08-14T00:00:00.000Z",
  };
}

const sessionA = { workspaceId: "/tmp/a", sessionId: "s1" };
const sessionB = { workspaceId: "/tmp/b", sessionId: "s1" };

describe("session lifecycle metadata", () => {
  test("migrates v4 metadata with no archived records and preserves unrelated settings", () => {
    const migrated = parseMetadata({
      version: 4,
      recentWorkspaces: [workspace("a")],
      palette: "gruvbox",
      mode: "dark",
      glassEnabled: true,
      glassStrength: 40,
      uiFontSize: 16,
      chatFontSize: 15,
      trustedPermissionWorkspaceIds: ["/tmp/a"],
      selectedWorkspaceId: "/tmp/a",
      selectedSessionId: "s1",
    });
    expect(migrated.version).toBe(8);
    expect(migrated.sessionLifecycle).toEqual([]);
    expect(migrated.palette).toBe("gruvbox");
    expect(migrated.mode).toBe("dark");
    expect(migrated.trustedPermissionWorkspaceIds).toEqual(["/tmp/a"]);
    expect(migrated.selectedSessionId).toBe("s1");
    expect(migrated.recentWorkspaces).toHaveLength(1);
  });

  test("archives and restores without changing unrelated appearance or workspace order", () => {
    const base = rememberWorkspace(emptyMetadata(), workspace("a"));
    const themed = setAppearance(base, { palette: "catppuccin", mode: "dark" });
    const archived = archiveSessionMetadata(themed, sessionA, "2026-08-14T01:00:00.000Z");
    expect(getSessionLifecycle(archived, sessionA)?.archivedAt).toBe("2026-08-14T01:00:00.000Z");
    expect(archived.palette).toBe("catppuccin");
    expect(archived.recentWorkspaces.map((entry) => entry.id)).toEqual(["a"]);

    const again = archiveSessionMetadata(archived, sessionA, "2026-08-14T02:00:00.000Z");
    expect(getSessionLifecycle(again, sessionA)?.archivedAt).toBe("2026-08-14T01:00:00.000Z");

    const restored = restoreSessionMetadata(again, sessionA);
    expect(getSessionLifecycle(restored, sessionA)?.archivedAt).toBeUndefined();
    expect(restored.palette).toBe("catppuccin");
  });

  test("persists only contained Ask/Auto choices through archive and restore", () => {
    const auto = setSessionApprovalModeMetadata(emptyMetadata(), sessionA, "auto");
    const restored = restoreSessionMetadata(
      archiveSessionMetadata(auto, sessionA, "2026-08-14T03:00:00.000Z"),
      sessionA,
    );
    expect(getSessionLifecycle(restored, sessionA)?.approvalMode).toBe("auto");
    expect(JSON.stringify(restored)).not.toContain("full");
  });

  test("preserves last-viewed and outcome across archive/restore and clears unread on view", () => {
    const viewed = markSessionViewed(emptyMetadata(), sessionA, "2026-08-14T01:00:00.000Z");
    const failed = recordSessionOutcome(viewed, sessionA, "failed", "2026-08-14T02:00:00.000Z");
    expect(getSessionLifecycle(failed, sessionA)).toEqual({
      workspaceId: sessionA.workspaceId,
      sessionId: sessionA.sessionId,
      lastViewedAt: "2026-08-14T01:00:00.000Z",
      lastOutcome: "failed",
      lastOutcomeAt: "2026-08-14T02:00:00.000Z",
    });
    const archived = archiveSessionMetadata(failed, sessionA, "2026-08-14T03:00:00.000Z");
    const restored = restoreSessionMetadata(archived, sessionA);
    expect(getSessionLifecycle(restored, sessionA)?.archivedAt).toBeUndefined();
    expect(getSessionLifecycle(restored, sessionA)?.lastOutcome).toBe("failed");
    const reread = markSessionViewed(restored, sessionA, "2026-08-14T04:00:00.000Z");
    expect(getSessionLifecycle(reread, sessionA)?.lastOutcome).toBeUndefined();
    expect(getSessionLifecycle(reread, sessionA)?.lastViewedAt).toBe("2026-08-14T04:00:00.000Z");
  });

  test("ignores malformed lifecycle records individually and prunes orphans", () => {
    const parsed = parseMetadata({
      version: 5,
      recentWorkspaces: [],
      sessionLifecycle: [
        sessionA,
        { workspaceId: "/tmp/a" },
        { workspaceId: "/tmp/a", sessionId: "s2", title: "secret prompt", path: "/tmp/a/s2.jsonl" },
        "nope",
        sessionB,
      ],
    });
    expect(parsed.sessionLifecycle).toEqual([
      sessionA,
      { workspaceId: "/tmp/a", sessionId: "s2" },
      sessionB,
    ]);
    expect(JSON.stringify(parsed.sessionLifecycle)).not.toContain("secret prompt");
    expect(JSON.stringify(parsed.sessionLifecycle)).not.toContain(".jsonl");

    const pruned = pruneOrphanSessionLifecycle(parsed, [sessionA]);
    expect(pruned.sessionLifecycle).toEqual([sessionA]);
  });

  test("lifecycle records stay JSON-safe and omit transcript text", () => {
    const metadata = archiveSessionMetadata(emptyMetadata(), sessionA, "2026-08-14T01:00:00.000Z");
    expect(isJsonSafeValue(metadata)).toBe(true);
    expect(jsonRoundTrip(metadata)).toEqual(metadata);
    expect(JSON.stringify(metadata.sessionLifecycle)).not.toContain("You are");
  });

  test("forgets a removed session without resetting unrelated lifecycle records", () => {
    const archived = archiveSessionMetadata(emptyMetadata(), sessionA, "2026-08-14T01:00:00.000Z");
    const both = archiveSessionMetadata(archived, sessionB, "2026-08-14T01:00:00.000Z");
    const forgotten = forgetSessionLifecycle(both, sessionA);
    expect(getSessionLifecycle(forgotten, sessionA)).toBeUndefined();
    expect(getSessionLifecycle(forgotten, sessionB)?.archivedAt).toBe("2026-08-14T01:00:00.000Z");
  });

  test("forgetting a colliding session id in another workspace keeps the selected chat", () => {
    const selected = {
      ...archiveSessionMetadata(
        archiveSessionMetadata(emptyMetadata(), sessionA, "2026-08-14T01:00:00.000Z"),
        sessionB,
        "2026-08-14T01:00:00.000Z",
      ),
      selectedWorkspaceId: sessionA.workspaceId,
      selectedSessionId: sessionA.sessionId,
    };
    const forgotten = forgetSessionLifecycle(selected, sessionB);
    expect(forgotten.selectedWorkspaceId).toBe(sessionA.workspaceId);
    expect(forgotten.selectedSessionId).toBe(sessionA.sessionId);
    expect(getSessionLifecycle(forgotten, sessionB)).toBeUndefined();
  });
});
