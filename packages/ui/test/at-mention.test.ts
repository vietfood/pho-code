import { describe, expect, test } from "bun:test";
import {
  findAtQuery,
  inferMentionKind,
  insertAtMention,
  mentionLabel,
  parseMentionSegments,
} from "../src/lib/at-mention";

describe("composer @ mentions", () => {
  test("finds an @ query at the start or after whitespace", () => {
    expect(findAtQuery("@src", 4)).toEqual({ start: 0, query: "src" });
    expect(findAtQuery("see @pack", 9)).toEqual({ start: 4, query: "pack" });
    expect(findAtQuery("email a@b.com", 13)).toBeNull();
  });

  test("inserts the chosen path inline and leaves a trailing space", () => {
    expect(insertAtMention("read @pack", { start: 5, query: "pack" }, 10, "src/pack.ts")).toEqual({
      text: "read @src/pack.ts ",
      cursor: 18,
    });
    expect(insertAtMention("read @pack more", { start: 5, query: "pack" }, 10, "src/pack.ts")).toEqual({
      text: "read @src/pack.ts more",
      cursor: 17,
    });
  });

  test("parses mention segments and skips emails", () => {
    expect(parseMentionSegments("Can you read @AGENTS.md")).toEqual([
      { type: "text", text: "Can you read " },
      { type: "mention", path: "AGENTS.md" },
    ]);
    expect(parseMentionSegments("email a@b.com then @file.ts")).toEqual([
      { type: "text", text: "email a@b.com then " },
      { type: "mention", path: "file.ts" },
    ]);
    expect(parseMentionSegments("plain")).toEqual([{ type: "text", text: "plain" }]);
  });

  test("mentionLabel uses the basename and inferMentionKind uses trailing slash", () => {
    expect(mentionLabel("AGENTS.md")).toBe("AGENTS.md");
    expect(mentionLabel("packages/ui/src/composer.tsx")).toBe("composer.tsx");
    expect(mentionLabel("src/lib/")).toBe("lib");
    expect(inferMentionKind("AGENTS.md")).toBe("file");
    expect(inferMentionKind("src/")).toBe("folder");
  });
});
