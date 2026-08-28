import { describe, expect, test } from "bun:test";
import { displayToolName } from "../src/tool-display";

const EXPECTED = new Map([
  ["ls", "Browse"],
  ["Ls", "Browse"],
  ["List", "Browse"],
  ["Browse", "Browse"],
  ["read", "Read"],
  ["write", "Write"],
  ["edit", "Edit"],
  ["bash", "Run"],
  ["Bash", "Run"],
  ["user_bash", "Run"],
  ["run", "Run"],
  ["grep", "Search"],
  ["find", "Find"],
  ["web_search", "Web search"],
  ["Web search", "Web search"],
  ["fetch_content", "Fetch"],
  ["Fetch", "Fetch"],
  ["move_to_trash", "Trash"],
  ["read_skill", "Skill"],
  ["ask_user_question", "Ask"],
  ["update_plan_document", "Plan"],
  ["todo", "Todos"],
  ["execute_plan", "Execute"],
]);

describe("displayToolName", () => {
  test("maps canonical ids, mixed case, and already-mapped titles", () => {
    for (const [internalName, displayName] of EXPECTED) {
      expect(displayToolName(internalName)).toBe(displayName);
    }
    expect(displayToolName("github_get_file_contents")).toBe("GitHub get file contents");
    expect(displayToolName("mcp__list_issues")).toBe("List Issues");
    expect(displayToolName("harness_mark")).toBe("Harness Mark");
    expect(displayToolName("mystery_tool")).toBe("Mystery Tool");
  });
});
