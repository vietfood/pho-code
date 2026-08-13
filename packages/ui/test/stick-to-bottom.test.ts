import { describe, expect, test } from "bun:test";
import { isNearBottom, STICK_TO_BOTTOM_THRESHOLD_PX } from "../src/lib/stick-to-bottom";

describe("stick-to-bottom", () => {
  test("treats the exact bottom as near", () => {
    expect(isNearBottom(400, 1000, 600)).toBe(true);
  });

  test("treats values within the threshold as near", () => {
    expect(isNearBottom(400 - STICK_TO_BOTTOM_THRESHOLD_PX, 1000, 600)).toBe(true);
  });

  test("unpins when scrolled farther than the threshold", () => {
    expect(isNearBottom(400 - STICK_TO_BOTTOM_THRESHOLD_PX - 1, 1000, 600)).toBe(false);
  });
});
