import { describe, expect, test } from "bun:test";
import { markdownUrlTransform, safeMarkdownImageSrc } from "../src/lib/safe-markdown-image-src";

describe("safeMarkdownImageSrc", () => {
  test("accepts credential-less http(s) and image data URLs", () => {
    expect(safeMarkdownImageSrc("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(safeMarkdownImageSrc("http://example.com/a.png")).toBe("http://example.com/a.png");
    expect(safeMarkdownImageSrc("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
    expect(safeMarkdownImageSrc("data:image/svg+xml;utf8,<svg></svg>")).toBe("data:image/svg+xml;utf8,<svg></svg>");
  });

  test("rejects unsafe or relative sources", () => {
    expect(safeMarkdownImageSrc("file:///tmp/a.png")).toBeNull();
    expect(safeMarkdownImageSrc("javascript:alert(1)")).toBeNull();
    expect(safeMarkdownImageSrc("./shot.png")).toBeNull();
    expect(safeMarkdownImageSrc("/abs/shot.png")).toBeNull();
    expect(safeMarkdownImageSrc("https://user:pass@example.com/a.png")).toBeNull();
    expect(safeMarkdownImageSrc("data:text/html,<script>")).toBeNull();
    expect(safeMarkdownImageSrc("")).toBeNull();
    expect(safeMarkdownImageSrc(null)).toBeNull();
  });
});

describe("markdownUrlTransform", () => {
  test("allows data images only on src, not href", () => {
    const data = "data:image/png;base64,abc";
    expect(markdownUrlTransform(data, "src")).toBe(data);
    expect(markdownUrlTransform(data, "href")).toBe("");
    expect(markdownUrlTransform("https://example.com/a.png", "href")).toBe("https://example.com/a.png");
    expect(markdownUrlTransform("javascript:alert(1)", "href")).toBe("");
  });
});
