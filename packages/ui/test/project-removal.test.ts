import { describe, expect, test } from "bun:test";
import { projectRemovalWarning } from "../src/lib/project-removal";

describe("projectRemovalWarning", () => {
  test("warns that chats move to Trash when the project has sessions", () => {
    expect(projectRemovalWarning({ displayName: "Garden", sessionCount: 4 })).toContain("4 chats");
    expect(projectRemovalWarning({ displayName: "Garden", sessionCount: 4 })).toContain("Trash");
    expect(projectRemovalWarning({ displayName: "Garden", sessionCount: 1 })).toContain("1 chat");
  });

  test("skips Trash copy when there are no saved chats", () => {
    const copy = projectRemovalWarning({ displayName: "piui", sessionCount: 0 });
    expect(copy).toContain("piui");
    expect(copy).not.toContain("Trash");
  });
});
