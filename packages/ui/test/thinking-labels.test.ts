import { describe, expect, test } from "bun:test";
import {
  isMaxThinkingLevel,
  thinkingHint,
  thinkingIntensity,
  thinkingLevelLabel,
} from "../src/lib/thinking-labels";

describe("thinking labels", () => {
  test("formats Pi levels for display", () => {
    expect(thinkingLevelLabel("off")).toBe("Off");
    expect(thinkingLevelLabel("xhigh")).toBe("Extra high");
    expect(thinkingLevelLabel("max")).toBe("Max");
  });

  test("maps intensity across the available ladder", () => {
    const levels = ["off", "low", "high", "max"] as const;
    expect(thinkingIntensity("off", levels)).toBe(0);
    expect(thinkingIntensity("high", levels)).toBeCloseTo(2 / 3);
    expect(thinkingIntensity("max", levels)).toBe(1);
  });

  test("uses a dramatic hint at the max step", () => {
    expect(thinkingHint(1, true)).toBe("Consumes usage limits faster");
    expect(thinkingHint(0.5, false)).toBe("Balanced reasoning");
    expect(isMaxThinkingLevel("max", ["off", "high", "max"])).toBe(true);
    expect(isMaxThinkingLevel("high", ["off", "high", "max"])).toBe(false);
  });
});
