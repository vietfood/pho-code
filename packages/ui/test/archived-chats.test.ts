import { describe, expect, test } from "bun:test";
import type { RecentWorkspaceRecord, SessionCatalogEntry } from "@pho-code/protocol";
import { groupArchivedChatsByProject } from "../src/lib/archived-chats";

function project(id: string, name: string): RecentWorkspaceRecord {
  return {
    id,
    path: `/tmp/${id}`,
    displayName: name,
    lastOpenedAt: "2026-08-14T00:00:00.000Z",
  };
}

function chat(
  workspaceId: string,
  sessionId: string,
  title: string,
  archived: boolean,
  updatedAt: string,
): SessionCatalogEntry {
  return {
    workspaceId,
    sessionId,
    title,
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

describe("groupArchivedChatsByProject", () => {
  test("groups archived chats by project and skips empty folders", () => {
    const alpha = project("/tmp/a", "alpha");
    const beta = project("/tmp/b", "beta");
    const groups = groupArchivedChatsByProject([alpha, beta], {
      [alpha.id]: [
        chat(alpha.id, "s2", "later", true, "2026-08-14T02:00:00.000Z"),
        chat(alpha.id, "s1", "earlier", true, "2026-08-14T01:00:00.000Z"),
        chat(alpha.id, "live", "open", false, "2026-08-14T03:00:00.000Z"),
      ],
      [beta.id]: [
        chat(beta.id, "s3", "active", false, "2026-08-14T04:00:00.000Z"),
        chat(beta.id, "s4", "stashed", true, "2026-08-14T05:00:00.000Z"),
      ],
    });
    expect(groups.map((group) => group.project.displayName)).toEqual(["alpha", "beta"]);
    expect(groups[0]?.sessions.map((session) => session.sessionId)).toEqual(["s2", "s1"]);
    expect(groups[1]?.sessions.map((session) => session.sessionId)).toEqual(["s4"]);
  });
});
