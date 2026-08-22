import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StreamCaret } from "../src/stream-text";

describe("StreamCaret", () => {
  test("renders a solid streaming caret", () => {
    const markup = renderToStaticMarkup(createElement(StreamCaret));
    expect(markup).toContain("stream-caret");
    expect(markup).toContain("is-streaming");
    expect(markup).not.toContain("stream-tail");
  });
});
