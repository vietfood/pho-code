import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextUsageMeter } from "../src/context-usage-meter";

describe("ContextUsageMeter", () => {
  test("renders percent beside a strong ring", () => {
    const markup = renderToStaticMarkup(
      createElement(ContextUsageMeter, {
        percent: 3.9,
        tokens: 10_600,
        contextWindow: 272_000,
      }),
    );
    expect(markup).toContain('data-testid="composer-context-ring"');
    expect(markup).toContain("context-usage-meter__fill");
    expect(markup).toContain(">3.9%<");
    expect(markup).toContain('stroke-width="3.75"');
    expect(markup).toContain('width="16"');
    expect(markup).toContain('height="16"');
    expect(markup.indexOf(">3.9%<")).toBeLessThan(markup.indexOf("context-usage-meter__ring"));
  });

  test("keeps one decimal for higher usage", () => {
    const markup = renderToStaticMarkup(
      createElement(ContextUsageMeter, {
        percent: 62.4,
        tokens: 124_000,
        contextWindow: 200_000,
      }),
    );
    expect(markup).toContain(">62.4%<");
  });
});
