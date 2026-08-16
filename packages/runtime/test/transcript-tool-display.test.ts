import { describe, expect, test } from "bun:test";
import { projectMessages, firstUserPreview } from "../src/transcript";
import { PLAN_EXECUTE_PROMPT } from "../src/plan-agent-state";

const EXPECTED = new Map([
  ["ffgrep", "FFF grep"],
  ["fffind", "FFF find"],
  ["fff-multi-grep", "FFF multi-grep"],
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

  test("hides the Execute kickoff user bubble from the transcript and session preview", () => {
    const messages = [
      {
        role: "user",
        timestamp: 1,
        content: PLAN_EXECUTE_PROMPT,
      },
      {
        role: "user",
        timestamp: 2,
        content: "go ahead",
      },
    ] as Parameters<typeof projectMessages>[0];
    const projected = projectMessages(messages);
    expect(projected).toHaveLength(1);
    expect(projected[0]?.blocks).toEqual([{ type: "text", text: "go ahead" }]);
    expect(firstUserPreview(messages)).toBe("go ahead");
  });
});
