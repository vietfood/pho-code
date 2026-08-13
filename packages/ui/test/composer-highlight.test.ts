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
  test("lets transient tokens override max thinking", () => {
    expect(composerHighlight({ mentionOpen: false, slashOpen: false, maxThinking: false })).toBe("none");
    expect(composerHighlight({ mentionOpen: false, slashOpen: false, maxThinking: true })).toBe("max");
    expect(composerHighlight({ mentionOpen: true, slashOpen: false, maxThinking: true })).toBe("mention");
    expect(composerHighlight({ mentionOpen: true, slashOpen: true, maxThinking: true })).toBe("slash");
  });
});
