import { describe, expect, test } from "bun:test";
import {
  clampReviewSidebarWidth,
  DEFAULT_REVIEW_SIDEBAR_WIDTH_PX,
  MAX_REVIEW_SIDEBAR_WIDTH_PX,
  MIN_REVIEW_SIDEBAR_WIDTH_PX,
} from "../src/lib/review-sidebar-width";

describe("review sidebar width", () => {
  test("clamps to the documented min, max, and default", () => {
    expect(clampReviewSidebarWidth(100)).toBe(MIN_REVIEW_SIDEBAR_WIDTH_PX);
    expect(clampReviewSidebarWidth(2000)).toBe(MAX_REVIEW_SIDEBAR_WIDTH_PX);
    expect(clampReviewSidebarWidth(480)).toBe(480);
    expect(clampReviewSidebarWidth(Number.NaN)).toBe(DEFAULT_REVIEW_SIDEBAR_WIDTH_PX);
  });
});
