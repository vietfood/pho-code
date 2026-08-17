import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThinkingLevelChip } from "../src/thinking-level-chip";

describe("ThinkingLevelChip", () => {
  test("sizes to the current label and omits a chevron", () => {
    const highMarkup = renderToStaticMarkup(
      createElement(ThinkingLevelChip, {
        level: "high",
        availableLevels: ["off", "low", "high", "xhigh", "max"],
        disabled: false,
        onChange: () => undefined,
      }),
    );
    expect(highMarkup).toContain('data-testid="thinking-selector"');
    expect(highMarkup).toContain(">High<");
    expect(highMarkup).not.toContain("Extra high");
    expect(highMarkup).not.toContain("lucide-chevron-down");
    expect(highMarkup).not.toContain("background-image");

    const maxMarkup = renderToStaticMarkup(
      createElement(ThinkingLevelChip, {
        level: "max",
        availableLevels: ["off", "low", "high", "xhigh", "max"],
        disabled: false,
        onChange: () => undefined,
      }),
    );
    expect(maxMarkup).toContain("composer-thinking-select is-max");
    expect(maxMarkup).toContain(">Max<");
  });
});
