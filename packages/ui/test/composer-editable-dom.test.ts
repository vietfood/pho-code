import { describe, expect, test } from "bun:test";
import { insertComposerPlainText, normalizePastedPlainText } from "../src/lib/composer-editable-dom";

describe("composer paste", () => {
  test("normalizes Windows and legacy Mac newlines", () => {
    expect(normalizePastedPlainText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  test("inserts at the caret", () => {
    expect(insertComposerPlainText("hello world", { start: 6, end: 6 }, "there ")).toEqual({
      text: "hello there world",
      cursor: 12,
    });
  });

  test("replaces the current selection", () => {
    expect(insertComposerPlainText("keep THIS gone", { start: 5, end: 9 }, "that")).toEqual({
      text: "keep that gone",
      cursor: 9,
    });
  });

  test("keeps a long multiline paste as one value", () => {
    const pasted = Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`).join("\n");
    const result = insertComposerPlainText("prefix\n", { start: 7, end: 7 }, pasted);
    expect(result.text.startsWith("prefix\nLine 1\n")).toBe(true);
    expect(result.text.endsWith("Line 80")).toBe(true);
    expect(result.text.split("\n")).toHaveLength(81);
    expect(result.cursor).toBe(result.text.length);
  });

  test("clamps a selection that runs past the current value", () => {
    expect(insertComposerPlainText("ab", { start: 8, end: 20 }, "z")).toEqual({
      text: "abz",
      cursor: 3,
    });
  });
});
