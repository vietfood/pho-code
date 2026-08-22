import { describe, expect, test } from "bun:test";
import { hunkChangedRanges, quickSimilarity, wordDiffRanges } from "../src/lib/change-review-word-diff";
import { buildLinePieces, searchRanges } from "../src/lib/change-review-diff";

describe("word-level diff", () => {
  test("marks only the tokens that moved", () => {
    const ranges = wordDiffRanges(
      "export const DEFAULT_CHAT_FONT_SIZE = 14;",
      "export const DEFAULT_CHAT_FONT_SIZE = 15;",
    );
    expect(ranges).not.toBeNull();
    const slice = (text: string, list: { start: number; end: number }[]) =>
      list.map((range) => text.slice(range.start, range.end));
    expect(slice("export const DEFAULT_CHAT_FONT_SIZE = 14;", ranges!.before)).toEqual(["14"]);
    expect(slice("export const DEFAULT_CHAT_FONT_SIZE = 15;", ranges!.after)).toEqual(["15"]);
  });

  test("marks several edits inside one line", () => {
    const before = 'hero ? "px-3.5 py-3" : "px-3 py-2.5"';
    const after = 'hero ? "px-4 py-3.5" : "px-4 py-3"';
    const ranges = wordDiffRanges(before, after);
    expect(ranges).not.toBeNull();
    expect(ranges!.after.length).toBeGreaterThan(1);
    for (const range of ranges!.after) {
      expect(after.slice(range.start, range.end).length).toBeGreaterThan(0);
      expect(range.end).toBeLessThanOrEqual(after.length);
    }
  });

  test("falls back to whole-line highlighting when the lines are rewrites", () => {
    expect(wordDiffRanges("before", "after from agent")).toBeNull();
    expect(wordDiffRanges("same", "same")).toBeNull();
  });

  test("pairs removed and added runs inside a hunk", () => {
    const ranges = hunkChangedRanges({
      header: "@@ -1,3 +1,3 @@",
      lines: [
        { kind: "context", text: "const a = 1;", beforeLine: 1, afterLine: 1 },
        { kind: "removed", text: "const b = 2;", beforeLine: 2 },
        { kind: "added", text: "const b = 3;", afterLine: 2 },
        { kind: "context", text: "const c = 4;", beforeLine: 3, afterLine: 3 },
      ],
    });
    expect(ranges[0]).toBeUndefined();
    expect(ranges[1]).toEqual([{ start: 10, end: 11 }]);
    expect(ranges[2]).toEqual([{ start: 10, end: 11 }]);
    expect(ranges[3]).toBeUndefined();
  });

  test("leaves pure insertions as whole-line highlights", () => {
    const ranges = hunkChangedRanges({
      header: "@@ -1 +1,2 @@",
      lines: [
        { kind: "context", text: "keep", beforeLine: 1, afterLine: 1 },
        { kind: "added", text: "brand new line", afterLine: 2 },
      ],
    });
    expect(ranges.every((entry) => entry === undefined)).toBe(true);
  });

  test("quick similarity scores shared tokens", () => {
    expect(quickSimilarity("alpha beta", "alpha beta")).toBe(1);
    // Only the shared space token overlaps, so the score stays far below the pairing threshold.
    expect(quickSimilarity("alpha beta", "gamma delta")).toBeLessThan(0.2);
  });
});

describe("diff line pieces", () => {
  test("flattens syntax, word-diff, and search layers into one span run", () => {
    const text = "const size = 15;";
    const pieces = buildLinePieces(
      text,
      [
        { content: "const", color: "#ff0000" },
        { content: " size = 15;" },
      ],
      [{ start: 13, end: 15 }],
      "size",
    );
    expect(pieces.map((piece) => piece.text).join("")).toBe(text);
    expect(pieces.find((piece) => piece.text === "const")?.color).toBe("#ff0000");
    expect(pieces.find((piece) => piece.text === "size")?.hit).toBe(true);
    expect(pieces.find((piece) => piece.text === "15")?.changed).toBe(true);
    expect(pieces.filter((piece) => piece.changed).map((piece) => piece.text)).toEqual(["15"]);
  });

  test("keeps text intact when syntax tokens do not cover the line", () => {
    const pieces = buildLinePieces("abc", [{ content: "ab", color: "#fff" }], undefined, "");
    expect(pieces).toEqual([{ text: "abc", changed: false, hit: false }]);
  });

  test("finds every search range without overlapping", () => {
    expect(searchRanges("aXaXa", "a")).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 4, end: 5 },
    ]);
    expect(searchRanges("abc", "  ")).toEqual([]);
  });
});
