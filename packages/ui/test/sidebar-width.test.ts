import { describe, expect, test } from "bun:test";
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH_PX,
  MAX_SIDEBAR_WIDTH_PX,
  MIN_SIDEBAR_WIDTH_PX,
} from "../src/lib/sidebar-width";

describe("sidebar width", () => {
  test("clamps to the documented min, max, and default", () => {
    expect(clampSidebarWidth(100)).toBe(MIN_SIDEBAR_WIDTH_PX);
    expect(clampSidebarWidth(500)).toBe(MAX_SIDEBAR_WIDTH_PX);
    expect(clampSidebarWidth(300)).toBe(300);
    expect(clampSidebarWidth(Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH_PX);
  });
});
