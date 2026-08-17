import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerMetaStrip } from "../src/composer-meta-strip";

describe("ComposerMetaStrip", () => {
  test("shows folder and slim usage together", () => {
    const markup = renderToStaticMarkup(
      createElement(ComposerMetaStrip, {
        metaHint: "piui",
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
    expect(markup).toContain('data-testid="composer-meta-strip"');
    expect(markup).toContain("piui");
    expect(markup).not.toContain('data-testid="composer-meta-todo"');
    expect(markup).toContain('data-testid="composer-usage-info"');
    expect(markup).toContain('data-testid="composer-context-ring"');
    expect(markup).toContain("context-usage-meter__label");
    expect(markup).not.toContain("composer-usage-input");
    expect(markup).not.toContain("composer-usage-cost");
  });
});
