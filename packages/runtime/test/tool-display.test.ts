import { describe, expect, test } from "bun:test";
import { APP_OWNED_TOOL_NAMES, displayToolName, displayToolNamesInText } from "../src/tool-display";

const EXPECTED = new Map([
  ["ls", "Browse"],
  ["read", "Read"],
  ["write", "Write"],
  ["edit", "Edit"],
  ["bash", "Run"],
  ["user_bash", "Run"],
  ["grep", "Search"],
  ["find", "Find"],
  ["web_search", "Web search"],
  ["fetch_content", "Fetch"],
  ["move_to_trash", "Trash"],
  ["read_skill", "Skill"],
  ["ask_user_question", "Ask"],
  ["update_plan_document", "Plan"],
  ["todo", "Todos"],
  ["execute_plan", "Execute"],
]);

describe("app-owned tool display names", () => {
  test("maps every canonical tool to its owner-facing label", () => {
    expect([...APP_OWNED_TOOL_NAMES]).toEqual([
      "web_search",
      "fetch_content",
      "move_to_trash",
      "read_skill",
      "ask_user_question",
      "update_plan_document",
      "execute_plan",
      "todo",
    ]);
    for (const [internalName, displayName] of EXPECTED) {
      expect(displayToolName(internalName)).toBe(displayName);
    }
    expect(displayToolName("github_get_file_contents")).toBe("GitHub get file contents");
    expect(displayToolName("mcp__list_issues")).toBe("List Issues");
    expect(displayToolName("harness_mark")).toBe("Harness Mark");
    expect(displayToolName("mystery_tool")).toBe("Mystery Tool");
  });

  test("sanitizes app-owned names in permission-dialog copy", () => {
    const displayed = displayToolNamesInText(
      "Permission Required\nAllow web_search, fetch_content, and move_to_trash?",
    );
    expect(displayed).toBe("Permission Required\nAllow Web search, Fetch, and Trash?");
  });
});
