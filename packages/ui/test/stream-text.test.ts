import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { splitMarkdownStreamTail, splitStreamTail } from "../src/lib/stream-text";
import { StreamText } from "../src/stream-text";

describe("splitStreamTail", () => {
  test("keeps short strings entirely in the tail", () => {
    expect(splitStreamTail("hi")).toEqual({ head: "", tail: "hi" });
    expect(splitStreamTail("")).toEqual({ head: "", tail: "" });
  });

  test("splits on the last whitespace inside the tail window", () => {
    const text = "Finalizing UI source and test staging";
    const { head, tail } = splitStreamTail(text);
    expect(head + tail).toBe(text);
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.length).toBeLessThanOrEqual(20);
    expect(head.endsWith(" ") || head.length === 0).toBe(true);
  });

  test("does not peel markdown markers into the blur tail", () => {
    expect(splitMarkdownStreamTail("**bold** and `code`")).toEqual({
      head: "**bold** and `code`",
      tail: "",
    });
    const prose = "Here is a longer streaming sentence that ends cleanly.";
    const { head, tail } = splitMarkdownStreamTail(prose);
    expect(head + tail).toBe(prose);
    expect(tail.length).toBeGreaterThan(0);
    expect(head.startsWith("Here")).toBe(true);
  });
});

describe("StreamText", () => {
  test("renders a blur tail and a solid streaming caret", () => {
    const markup = renderToStaticMarkup(
      createElement(StreamText, { text: "Planning composer component commits" }),
    );
    expect(markup).toContain('data-testid="stream-tail"');
    expect(markup).toContain("stream-caret");
    expect(markup).toContain("is-streaming");
    expect(markup).toContain("Planning");
  });
});
