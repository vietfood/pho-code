import { describe, expect, test } from "bun:test";
import {
  createMemoryMetadataStore,
  emptyMetadata,
  rememberWorkspace,
  reorderRecentWorkspaces,
} from "../src/metadata";

function workspace(id: string, lastOpenedAt = "2026-08-13T00:00:00.000Z") {
  return {
    id,
    path: `/tmp/${id}`,
    displayName: id,
    lastOpenedAt,
  };
}

describe("rememberWorkspace order", () => {
  test("updates an existing workspace in place without bumping it to the top", () => {
    const base = emptyMetadata();
    const withA = rememberWorkspace(base, workspace("a", "2026-08-13T01:00:00.000Z"));
    const withB = rememberWorkspace(withA, workspace("b", "2026-08-13T02:00:00.000Z"));
    const reopenedA = rememberWorkspace(withB, workspace("a", "2026-08-13T03:00:00.000Z"));

    expect(reopenedA.recentWorkspaces.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(reopenedA.recentWorkspaces[0]?.lastOpenedAt).toBe("2026-08-13T03:00:00.000Z");
    expect(reopenedA.selectedWorkspaceId).toBe("a");
  });

  test("appends newly remembered workspaces", () => {
    const base = emptyMetadata();
    const withA = rememberWorkspace(base, workspace("a"));
    const withB = rememberWorkspace(withA, workspace("b"));

    expect(withB.recentWorkspaces.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});

describe("reorderRecentWorkspaces", () => {
  test("rewrites order for a full permutation and persists through the metadata store", async () => {
    const initial = rememberWorkspace(
      rememberWorkspace(emptyMetadata(), workspace("a")),
      workspace("b"),
    );
    const reordered = reorderRecentWorkspaces(initial, ["b", "a"]);
    expect(reordered.recentWorkspaces.map((entry) => entry.id)).toEqual(["b", "a"]);

    const store = createMemoryMetadataStore(reordered);
    await store.save(reordered);
    expect(store.load().recentWorkspaces.map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  test("rejects incomplete or unknown id lists", () => {
    const initial = rememberWorkspace(
      rememberWorkspace(emptyMetadata(), workspace("a")),
      workspace("b"),
    );
    expect(reorderRecentWorkspaces(initial, ["a"])).toBe(initial);
    expect(reorderRecentWorkspaces(initial, ["a", "missing"])).toBe(initial);
    expect(reorderRecentWorkspaces(initial, ["a", "a"])).toBe(initial);
  });
});
