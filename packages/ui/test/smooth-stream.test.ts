import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConservativeMarkdown } from "../src/markdown";
import { applyStreamTail } from "../src/lib/rehype-stream-tail";
import {
  nextStreamingDisplay,
  splitStreamingTokens,
  streamingCatchUpCount,
} from "../src/lib/smooth-stream";

describe("streaming tokens", () => {
  test("splits words with following whitespace so join reconstructs the source", () => {
    expect(splitStreamingTokens("Hello world")).toEqual(["Hello ", "world"]);
    expect(splitStreamingTokens("Hello\n\nworld")).toEqual(["Hello\n\n", "world"]);
    expect(splitStreamingTokens("  Hi")).toEqual(["  ", "Hi"]);
    expect(splitStreamingTokens("")).toEqual([]);
    expect(splitStreamingTokens("Hello world").join("")).toBe("Hello world");
  });

  test("advances toward the target one or more tokens without skipping ahead of it", () => {
    expect(nextStreamingDisplay("Hello ", "Hello world", 1)).toBe("Hello world");
    expect(nextStreamingDisplay("", "One two three", 2)).toBe("One two ");
    expect(nextStreamingDisplay("Hello", "Hi", 1)).toBe("Hi");
    expect(nextStreamingDisplay("Hello world", "Hello world", 4)).toBe("Hello world");
  });

  test("catches up faster when many tokens are queued", () => {
    expect(streamingCatchUpCount(0)).toBe(0);
    expect(streamingCatchUpCount(3)).toBe(1);
    expect(streamingCatchUpCount(8)).toBe(2);
    expect(streamingCatchUpCount(40)).toBe(10);
    expect(streamingCatchUpCount(100)).toBe(12);
  });
});

describe("stream tail", () => {
  test("wraps the last word and can insert an inline caret", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          children: [{ type: "text", value: "Hello world" }],
        },
      ],
    };
    applyStreamTail(tree, { caret: true });
    const paragraph = tree.children[0];
    expect(paragraph?.children).toEqual([
      { type: "text", value: "Hello " },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["streaming-word"] },
        children: [{ type: "text", value: "world" }],
      },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["streaming-caret"], ariaHidden: true },
        children: [],
      },
    ]);
  });

  test("does not wrap words inside a trailing code block", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          children: [{ type: "text", value: "See" }],
        },
        {
          type: "element",
          tagName: "pre",
          children: [
            {
              type: "element",
              tagName: "code",
              children: [{ type: "text", value: "const ok = true;" }],
            },
          ],
        },
      ],
    };
    applyStreamTail(tree, { caret: true });
    expect(tree.children[0]).toEqual({
      type: "element",
      tagName: "p",
      children: [{ type: "text", value: "See" }],
    });
    expect(tree.children.at(-1)).toEqual({
      type: "element",
      tagName: "span",
      properties: { className: ["streaming-caret"], ariaHidden: true },
      children: [],
    });
  });
});

describe("streaming markdown", () => {
  test("keeps live markdown and marks the newest word for stream-in", () => {
    const html = renderToStaticMarkup(
      createElement(ConservativeMarkdown, {
        text: "Hello **world**",
        isStreaming: true,
        streamTail: true,
        streamCaret: true,
      }),
    );
    expect(html).toContain("<strong>");
    expect(html).toContain("streaming-word");
    expect(html).toContain("world");
    expect(html).toContain("streaming-caret");
    expect(html).toContain("aria-hidden");
  });
});
