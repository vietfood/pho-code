import { describe, expect, test } from "bun:test";
import { nextDialogTabIndex, shouldWrapDialogTab } from "../src/lib/dialog-focus";

describe("dialog focus loop", () => {
  test("wraps Tab from the last control to the first", () => {
    expect(shouldWrapDialogTab(1, 2, false)).toBe(true);
    expect(nextDialogTabIndex(1, 2, false)).toBe(0);
  });

  test("wraps Shift+Tab from the first control to the last", () => {
    expect(shouldWrapDialogTab(0, 2, true)).toBe(true);
    expect(nextDialogTabIndex(0, 2, true)).toBe(1);
  });

  test("does not wrap Tab between the first and last control", () => {
    expect(shouldWrapDialogTab(0, 2, false)).toBe(false);
    expect(nextDialogTabIndex(0, 2, false)).toBe(1);
  });
});
