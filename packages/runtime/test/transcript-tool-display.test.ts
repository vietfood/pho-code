import { describe, expect, test } from "bun:test";
import { projectMessages } from "../src/transcript";
import { PLAN_EXECUTE_PROMPT } from "../src/plan-agent-state";

const EXPECTED = ["grep", "find", "web_search", "fetch_content", "move_to_trash"] as const;

describe("transcript tool names", () => {
  test("keeps canonical Pi ids on reopened transcript blocks", () => {
    const messages = [
      {
        role: "assistant",
        timestamp: 1,
        content: EXPECTED.map((name, index) => ({
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
    expect(names).toEqual([...EXPECTED]);
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
  });
});
