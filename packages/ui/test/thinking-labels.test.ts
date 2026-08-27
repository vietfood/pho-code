import { describe, expect, test } from "bun:test";
import {
  isMaxThinkingLevel,
  thinkingLevelLabel,
} from "../src/lib/thinking-labels";

describe("thinking labels", () => {
  test("formats Pi levels for display", () => {
    expect(thinkingLevelLabel("off")).toBe("Off");
    expect(thinkingLevelLabel("xhigh")).toBe("Extra high");
    expect(thinkingLevelLabel("max")).toBe("Max");
  });

  test("identifies the max step", () => {
    expect(isMaxThinkingLevel("max", ["off", "high", "max"])).toBe(true);
    expect(isMaxThinkingLevel("high", ["off", "high", "max"])).toBe(false);
  });
});
