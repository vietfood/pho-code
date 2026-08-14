import { describe, expect, test } from "bun:test";
import { sessionRowTooltip } from "../src/lib/session-row-tooltip";

describe("sessionRowTooltip", () => {
  test("uses the title when preview is missing or duplicated", () => {
    expect(sessionRowTooltip({ title: "Garden notes" })).toBe("Garden notes");
    expect(sessionRowTooltip({ title: "Garden notes", preview: "Garden notes" })).toBe("Garden notes");
  });

  test("appends a distinct preview on a second line", () => {
    expect(sessionRowTooltip({ title: "Garden notes", preview: "Water the tomatoes" })).toBe(
      "Garden notes\nWater the tomatoes",
    );
  });
});
