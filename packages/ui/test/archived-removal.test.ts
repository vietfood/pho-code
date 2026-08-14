import { describe, expect, test } from "bun:test";
import { archivedRemovalWarning } from "../src/lib/archived-removal";

describe("archivedRemovalWarning", () => {
  test("warns that archived chats move to Trash", () => {
    expect(archivedRemovalWarning({ displayName: "Garden", sessionCount: 3 })).toContain("3 archived chats");
    expect(archivedRemovalWarning({ displayName: "Garden", sessionCount: 3 })).toContain("Trash");
    expect(archivedRemovalWarning({ displayName: "Garden", sessionCount: 1 })).toContain("1 archived chat");
    expect(archivedRemovalWarning({ displayName: "Garden", sessionCount: 3 })).toContain("Active chats");
  });
});
