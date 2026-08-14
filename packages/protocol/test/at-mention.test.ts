import { describe, expect, test } from "bun:test";
import {
  extractAtMentionPaths,
  findCompletedAtMentions,
  formatAtMentionToken,
} from "../src/at-mention";

describe("at-mention tokens", () => {
  test("keeps simple paths unquoted and quotes whitespace", () => {
    expect(formatAtMentionToken("src/composer.tsx")).toBe("@src/composer.tsx");
    expect(formatAtMentionToken("KL divergence.md")).toBe('@"KL divergence.md"');
    expect(formatAtMentionToken('notes/My "File".md')).toBe('@"notes/My \\"File\\".md"');
  });

  test("extracts quoted and unquoted paths and skips emails", () => {
    expect(extractAtMentionPaths("read @src/main.ts and @packages/ui")).toEqual([
      "src/main.ts",
      "packages/ui",
    ]);
    expect(extractAtMentionPaths('summarize @"KL divergence.md" please')).toEqual(["KL divergence.md"]);
    expect(extractAtMentionPaths("email a@b.com then @file.ts")).toEqual(["file.ts"]);
    expect(extractAtMentionPaths('see @"notes/My \\"File\\".md"')).toEqual(['notes/My "File".md']);
    expect(
      extractAtMentionPaths(
        'Read @"6. Sources/KL Divergence for Machine Learning.md" and give me your assessment',
      ),
    ).toEqual(["6. Sources/KL Divergence for Machine Learning.md"]);
  });

  test("does not treat an unclosed quote as a completed mention", () => {
    expect(findCompletedAtMentions('draft @"KL divergence.md')).toEqual([]);
    expect(findCompletedAtMentions("@")).toEqual([]);
  });
});
