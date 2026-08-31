import { describe, expect, test } from "bun:test";
import { isPiCursorModel } from "../src/lib/cursor-model";

const cursorModel = {
  provider: "cursor",
  id: "composer-2-5",
  name: "Composer 2.5",
  contextWindow: 200_000,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

const echoModel = {
  provider: "deepseek",
  id: "echo",
  name: "Echo",
  contextWindow: 128_000,
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
};

describe("isPiCursorModel", () => {
  test("matches a Cursor model on the Pi backend, including the pre-V5 missing-backend default", () => {
    expect(isPiCursorModel(cursorModel, "pi")).toBe(true);
    expect(isPiCursorModel(cursorModel, undefined)).toBe(true);
    expect(isPiCursorModel({ ...cursorModel, provider: " Cursor " }, "pi")).toBe(true);
  });

  test("does not match Cursor models on external backends or non-Cursor models on Pi", () => {
    expect(isPiCursorModel(cursorModel, "codex")).toBe(false);
    expect(isPiCursorModel(cursorModel, "claude-acp")).toBe(false);
    expect(isPiCursorModel(echoModel, "pi")).toBe(false);
    expect(isPiCursorModel(echoModel, undefined)).toBe(false);
  });
});
