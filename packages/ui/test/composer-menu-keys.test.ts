import { describe, expect, test } from "bun:test";
import {
  clampComposerMenuIndex,
  isDismissedComposerToken,
  nextComposerMenuIndex,
  shouldSkipComposerTokenSyncOnKeyUp,
} from "../src/lib/composer-menu-keys";

describe("shouldSkipComposerTokenSyncOnKeyUp", () => {
  test("skips menu navigation keys while a picker is open", () => {
    expect(shouldSkipComposerTokenSyncOnKeyUp("ArrowDown", false, true)).toBe(true);
    expect(shouldSkipComposerTokenSyncOnKeyUp("ArrowUp", true, false)).toBe(true);
    expect(shouldSkipComposerTokenSyncOnKeyUp("Enter", true, true)).toBe(true);
  });

  test("skips Enter, Tab, and Escape after the picker has closed", () => {
    expect(shouldSkipComposerTokenSyncOnKeyUp("Enter", false, false)).toBe(true);
    expect(shouldSkipComposerTokenSyncOnKeyUp("Tab", false, false)).toBe(true);
    expect(shouldSkipComposerTokenSyncOnKeyUp("Escape", false, false)).toBe(true);
  });

  test("does not skip unrelated keys", () => {
    expect(shouldSkipComposerTokenSyncOnKeyUp("a", false, true)).toBe(false);
    expect(shouldSkipComposerTokenSyncOnKeyUp("ArrowDown", false, false)).toBe(false);
  });
});

describe("isDismissedComposerToken", () => {
  test("keeps the same token closed after Escape or accept", () => {
    expect(isDismissedComposerToken(0, 0)).toBe(true);
    expect(isDismissedComposerToken(4, 4)).toBe(true);
    expect(isDismissedComposerToken(0, 4)).toBe(false);
    expect(isDismissedComposerToken(0, null)).toBe(false);
  });
});

describe("nextComposerMenuIndex", () => {
  test("wraps around both directions", () => {
    expect(nextComposerMenuIndex(0, 1, 3)).toBe(1);
    expect(nextComposerMenuIndex(2, 1, 3)).toBe(0);
    expect(nextComposerMenuIndex(0, -1, 3)).toBe(2);
  });
});

describe("clampComposerMenuIndex", () => {
  test("keeps index within bounds", () => {
    expect(clampComposerMenuIndex(4, 3)).toBe(2);
    expect(clampComposerMenuIndex(0, 0)).toBe(0);
  });
});
