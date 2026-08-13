import { describe, expect, test } from "bun:test";
import {
  formatContextPercent,
  formatRatePerMillion,
  formatTokenCount,
  formatUsd,
} from "../src/lib/format-tokens";
import { contextBarFillColor } from "../src/lib/context-bar-color";

describe("formatTokenCount", () => {
  test("formats Pi-style compact counts", () => {
    expect(formatTokenCount(842)).toBe("842");
    expect(formatTokenCount(1_200)).toBe("1.2k");
    expect(formatTokenCount(12_000)).toBe("12k");
    expect(formatTokenCount(1_200_000)).toBe("1.2M");
  });
});

describe("formatContextPercent", () => {
  test("formats known and unknown percents", () => {
    expect(formatContextPercent(12.4)).toBe("12.4");
    expect(formatContextPercent(null)).toBe("?");
  });
});

describe("formatUsd", () => {
  test("formats session costs", () => {
    expect(formatUsd(0)).toBe("$0.000");
    expect(formatUsd(0.042)).toBe("$0.042");
  });
});

describe("formatRatePerMillion", () => {
  test("formats catalog rates", () => {
    expect(formatRatePerMillion(3)).toBe("$3");
    expect(formatRatePerMillion(0.25)).toBe("$0.25");
  });
});

describe("contextBarFillColor", () => {
  test("shifts hue toward red as usage rises", () => {
    const low = contextBarFillColor(5);
    const mid = contextBarFillColor(50);
    const high = contextBarFillColor(95);
    const hue = (value: string) => Number(value.match(/hsl\(([-\d.]+)/)?.[1]);
    expect(hue(low)).toBeGreaterThan(hue(mid));
    expect(hue(mid)).toBeGreaterThan(hue(high));
    expect(hue(high)).toBeLessThan(20);
  });
});
