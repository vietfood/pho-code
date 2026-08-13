import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ThinkingBlock } from "../src/thinking-block";

describe("thinking block", () => {
  test("renders a collapsed work-entry style thought row", () => {
    const markup = renderToStaticMarkup(
      createElement(ThinkingBlock, { text: "I should inspect the docs first.", open: false }),
    );
    expect(markup).toContain("Thought");
    expect(markup).toContain("I should inspect the docs first.");
    expect(markup).toContain('data-testid="thinking-block"');
    expect(markup).toContain('aria-expanded="false"');
  });
});
