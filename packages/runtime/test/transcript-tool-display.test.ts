import { describe, expect, test } from "bun:test";
import { projectMessages } from "../src/transcript";

const EXPECTED = new Map([
  ["ffgrep", "grep"],
  ["fffind", "find"],
  ["fff-multi-grep", "multi-grep"],
  ["web_search", "web search"],
  ["fetch_content", "fetch"],
  ["move_to_trash", "move to trash"],
]);

describe("transcript tool display names", () => {
  test("projects only display labels into reopened transcript blocks", () => {
    const messages = [
      {
        role: "assistant",
        timestamp: 1,
        content: [...EXPECTED.keys()].map((name, index) => ({
          type: "toolCall",
          id: `call-${index}`,
          name,
          arguments: {},
        })),
      },
    ] as Parameters<typeof projectMessages>[0];
    const projected = projectMessages(messages);
    const names = projected[0]?.blocks
      .filter((block) => block.type === "tool")
      .map((block) => block.name);
    expect(names).toEqual([...EXPECTED.values()]);
    expect(JSON.stringify(projected)).not.toMatch(/fffind|ffgrep|fff-multi-grep|web_search|fetch_content|move_to_trash/u);
  });
});
