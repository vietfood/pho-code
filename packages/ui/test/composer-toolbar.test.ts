import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerToolbar } from "../src/composer-toolbar";

describe("ComposerToolbar", () => {
  test("splits leading controls from trailing controls and usage", () => {
    const markup = renderToStaticMarkup(
      createElement(ComposerToolbar, {
        leading: createElement("span", { "data-testid": "mode-chip" }, "Agent"),
        trailing: createElement("span", { "data-testid": "model-chip" }, "Echo"),
        usage: {
          input: 7_600,
          output: 365,
          cacheRead: 6_700,
          cacheWrite: 0,
          total: 8_665,
          costUsd: 0.002,
        },
        contextUsage: { tokens: 10_600, contextWindow: 272_000, percent: 3.9 },
      }),
    );
    expect(markup).toContain('data-testid="composer-toolbar"');
    expect(markup).toContain('data-testid="mode-chip"');
    expect(markup).toContain('data-testid="model-chip"');
    expect(markup).toContain('data-testid="composer-usage-trigger"');
    expect(markup).toContain('data-testid="composer-context-ring"');
    expect(markup).toContain("context-usage-meter__label");
    // Breakdown rows stay behind the meter click, as in the retired meta strip.
    expect(markup).not.toContain("composer-usage-input");
    expect(markup).not.toContain("composer-usage-cost");
  });

  test("renders without usage when the session has none yet", () => {
    const markup = renderToStaticMarkup(
      createElement(ComposerToolbar, {
        leading: createElement("span", null, "Agent"),
      }),
    );
    expect(markup).toContain('data-testid="composer-toolbar"');
    expect(markup).not.toContain('data-testid="composer-usage-trigger"');
  });
});
