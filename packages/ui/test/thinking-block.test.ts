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
    expect(markup).toContain('data-testid="thought-chip"');
    expect(markup).toContain("truncate");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('data-testid="markdown"');
  });

  test("renders sanitized markdown when expanded", () => {
    const markup = renderToStaticMarkup(
      createElement(ThinkingBlock, {
        open: true,
        text: "Check **docs** and `tool-row.tsx`.\n\n- parse input\n- split output",
      }),
    );
    expect(markup).toContain('data-testid="markdown"');
    expect(markup).toContain("chat-markdown-dense");
    expect(markup).not.toContain('data-testid="thought-chip"');
    expect(markup).toContain("<strong>");
    expect(markup).toContain("<code>");
    expect(markup).toContain("<li>");
    expect(markup).not.toContain("<script");
  });

  test("shimmers the Thinking heading with a sparkle while live", () => {
    const markup = renderToStaticMarkup(
      createElement(ThinkingBlock, { text: "planning the next step", live: true }),
    );
    expect(markup).toContain("Thinking");
    expect(markup).toContain("working-shimmer");
    expect(markup).toContain('data-testid="thinking-status"');
    expect(markup).toContain('data-testid="working-star"');
    expect(markup).not.toContain("animate-pulse");
  });
});
