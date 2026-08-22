import { describe, expect, test } from "bun:test";
import { wrapSkillBody } from "@pho-code/protocol";
import { projectMessages, firstUserPreview } from "../src/transcript";
import { PLAN_EXECUTE_PROMPT } from "../src/plan-agent-state";

const EXPECTED = ["ffgrep", "fffind", "fff-multi-grep", "web_search", "fetch_content", "move_to_trash"] as const;

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
    expect(firstUserPreview(messages)).toBe("go ahead");
  });

  test("session preview drops expanded skill bodies", () => {
    const dump = [
      "/pho-code:repository-investigation",
      "",
      wrapSkillBody(
        "pho-code",
        "repository-investigation",
        "---\nname: repository-investigation\ndescription: Investigate the repo.\n---\n\n# Dump\n",
      ),
    ].join("\n");
    const messages = [
      { role: "user", timestamp: 1, content: dump },
    ] as Parameters<typeof firstUserPreview>[0];
    expect(firstUserPreview(messages)).toBe("/pho-code:repository-investigation");
    expect(firstUserPreview(messages)?.includes("<<<pho-skill")).toBe(false);
  });
});
