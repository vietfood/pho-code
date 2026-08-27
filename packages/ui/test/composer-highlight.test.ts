import { describe, expect, test } from "bun:test";
import { composerHighlight } from "../src/lib/composer-highlight";
import { findSlashQuery } from "../src/lib/slash-query";

describe("findSlashQuery", () => {
  test("finds a / token at the start or after whitespace", () => {
    expect(findSlashQuery("/", 1)).toEqual({ start: 0, query: "" });
    expect(findSlashQuery("/plan", 5)).toEqual({ start: 0, query: "plan" });
    expect(findSlashQuery("use /draft", 10)).toEqual({ start: 4, query: "draft" });
  });

  test("ignores slashes inside words and URLs mid-token", () => {
    expect(findSlashQuery("https://example.com", 19)).toBeNull();
    expect(findSlashQuery("src/lib", 7)).toBeNull();
  });
});

describe("composerHighlight", () => {
  test("colors the outline for @ and / tokens only", () => {
    expect(composerHighlight({ mentionOpen: false, slashOpen: false })).toBe("none");
    expect(composerHighlight({ mentionOpen: true, slashOpen: false })).toBe("mention");
    expect(composerHighlight({ mentionOpen: true, slashOpen: true })).toBe("slash");
  });
});
