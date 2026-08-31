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

  test("parses github repo urls as chips", () => {
    const segments = parseComposerSegments(
      "learn my repo https://github.com/vietfood/comtam tonight",
    );
    expect(segments).toEqual([
      { type: "text", text: "learn my repo " },
      {
        type: "github",
        url: "https://github.com/vietfood/comtam",
        owner: "vietfood",
        repo: "comtam",
      },
      { type: "text", text: " tonight" },
    ]);
  });

  test("parses github clone urls with a .git suffix as one chip", () => {
    const segments = parseComposerSegments(
      "Push commit e328b9c to https://github.com/vietfood/pho-code.git, branch dev",
    );
    expect(segments).toEqual([
      { type: "text", text: "Push commit e328b9c to " },
      {
        type: "github",
        url: "https://github.com/vietfood/pho-code.git",
        owner: "vietfood",
        repo: "pho-code",
      },
      { type: "text", text: ", branch dev" },
    ]);
  });
});
