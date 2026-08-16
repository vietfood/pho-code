import { describe, expect, test } from "bun:test";
import { keepWelcomeSelection } from "../../src/session-home";

describe("keepWelcomeSelection", () => {
  test("adopts bootstrap selection on first load", () => {
    expect(keepWelcomeSelection(null, 0)).toBe(false);
  });

  test("keeps Home when the cache already has conversations", () => {
    expect(keepWelcomeSelection(null, 2)).toBe(true);
  });

  test("still follows a selected chat", () => {
    expect(keepWelcomeSelection("ws:s1", 2)).toBe(false);
  });
});
