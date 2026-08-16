import { describe, expect, test } from "bun:test";
import {
  diffLineStat,
  fileChangeVerb,
  parseHunkHeader,
  splitSearchPieces,
  unmodifiedCountBeforeHunk,
  unmodifiedLabel,
  visibleWhitespace,
} from "../src/lib/change-review-diff";

describe("change-review unified diff helpers", () => {
  test("parses unified hunk headers and omitted-line counts", () => {
    expect(parseHunkHeader("@@ -12,4 +12,6 @@")).toEqual({
      beforeStart: 12,
      beforeCount: 4,
      afterStart: 12,
      afterCount: 6,
    });
    expect(unmodifiedCountBeforeHunk("@@ -1 +1 @@", undefined)).toBe(0);
    expect(unmodifiedCountBeforeHunk("@@ -12,4 +12,6 @@", undefined)).toBe(11);
    expect(unmodifiedLabel(1)).toBe("1 unmodified line");
    expect(unmodifiedLabel(11)).toBe("11 unmodified lines");
  });

  test("splits search hits and maps whitespace glyphs", () => {
    expect(splitSearchPieces("hello agent world", "agent")).toEqual([
      { text: "hello ", hit: false },
      { text: "agent", hit: true },
      { text: " world", hit: false },
    ]);
    expect(visibleWhitespace("a b\tc")).toBe("a·b→c");
  });

  test("counts additions and deletions and labels created vs edited", () => {
    expect(
      diffLineStat([
        {
          header: "@@ -1 +1 @@",
          lines: [
            { kind: "removed", text: "a", beforeLine: 1 },
            { kind: "added", text: "b", afterLine: 1 },
            { kind: "context", text: "c", beforeLine: 2, afterLine: 2 },
          ],
        },
      ]),
    ).toEqual({ additions: 1, deletions: 1 });
    expect(fileChangeVerb("created")).toBe("Created");
    expect(fileChangeVerb("modified")).toBe("Edited");
  });
});
