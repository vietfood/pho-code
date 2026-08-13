import { describe, expect, test } from "bun:test";
import { previewToolResult, previewUnknown } from "../src/preview";

describe("previewToolResult", () => {
  test("extracts AgentToolResult content text instead of raw JSON", () => {
    const result = {
      content: [{ type: "text", text: "tracked files: 42" }],
      details: { exitCode: 0 },
    };
    expect(previewToolResult(result)).toBe("tracked files: 42");
    expect(previewUnknown(result)).toContain('"content"');
  });

  test("falls back to JSON for unknown shapes", () => {
    expect(previewToolResult({ ok: true })).toBe('{"ok":true}');
  });
});
