import { describe, expect, test } from "bun:test";
import { insertSkillToken, parseComposerSegments } from "../src/lib/composer-tokens";

describe("composer skill tokens", () => {
  test("inserts a source-qualified skill token and trailing space", () => {
    expect(insertSkillToken("/", { start: 0, query: "" }, 1, "pho-code", "repository-investigation")).toEqual({
      text: "/pho-code:repository-investigation ",
      cursor: 35,
    });
  });

  test("parses mention and skill chips in order", () => {
    const segments = parseComposerSegments("See @src/app.ts and /cursor:demo-skill please.");
    expect(segments).toEqual([
      { type: "text", text: "See " },
      { type: "mention", path: "src/app.ts" },
      { type: "text", text: " and " },
      { type: "skill", sourceId: "cursor", skillName: "demo-skill" },
      { type: "text", text: " please." },
    ]);
  });
});
