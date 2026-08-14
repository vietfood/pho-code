import { describe, expect, test } from "bun:test";
import { clampMenuPosition } from "../src/lib/clamp-menu-position";

describe("clampMenuPosition", () => {
  test("keeps a menu that already fits", () => {
    expect(
      clampMenuPosition({ x: 80, y: 40 }, { width: 184, height: 96 }, { width: 1200, height: 800 }),
    ).toEqual({ x: 80, y: 40 });
  });

  test("pulls a menu back inside the right and bottom edges", () => {
    expect(
      clampMenuPosition({ x: 1100, y: 760 }, { width: 184, height: 96 }, { width: 1200, height: 800 }),
    ).toEqual({ x: 1012, y: 700 });
  });

  test("does not place a menu off the top or left", () => {
    expect(
      clampMenuPosition({ x: -20, y: -8 }, { width: 184, height: 96 }, { width: 1200, height: 800 }),
    ).toEqual({ x: 4, y: 4 });
  });
});
