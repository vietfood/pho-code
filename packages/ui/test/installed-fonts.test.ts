import { describe, expect, test } from "bun:test";
import { uniqueFontFamilies } from "../src/lib/installed-fonts";

describe("uniqueFontFamilies", () => {
  test("dedupes, drops private macOS faces, and sorts", () => {
    expect(
      uniqueFontFamilies([
        { family: "Menlo" },
        { family: ".SF NS" },
        { family: "JetBrainsMono Nerd Font" },
        { family: "Menlo" },
        { family: "" },
      ]),
    ).toEqual(["JetBrainsMono Nerd Font", "Menlo"]);
  });
});
