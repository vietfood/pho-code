import { describe, expect, test } from "bun:test";
import { APP_OWNED_TOOL_NAMES, displayToolName, displayToolNamesInText } from "../src/tool-display";

const EXPECTED = new Map([
  ["ffgrep", "FFF grep"],
  ["fffind", "FFF find"],
  ["fff-multi-grep", "FFF multi-grep"],
  ["web_search", "web search"],
  ["fetch_content", "fetch"],
  ["move_to_trash", "move to trash"],
]);

describe("app-owned tool display names", () => {
  test("maps every canonical app tool to its owner-facing label", () => {
    expect(APP_OWNED_TOOL_NAMES).toEqual([...EXPECTED.keys()]);
    for (const [internalName, displayName] of EXPECTED) {
      expect(displayToolName(internalName)).toBe(displayName);
    }
    expect(displayToolName("bash")).toBe("bash");
  });

  test("sanitizes app-owned names in permission-dialog copy", () => {
    const displayed = displayToolNamesInText(
      "Permission Required\nAllow web_search, fetch_content, and move_to_trash?",
    );
    expect(displayed).toBe("Permission Required\nAllow web search, fetch, and move to trash?");
  });
});
