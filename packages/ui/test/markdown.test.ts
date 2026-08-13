import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ConservativeMarkdown } from "../src/markdown";
import { preferredShikiTheme } from "../src/shiki-highlight";

describe("sanitized markdown", () => {
  test("renders fenced code and headings without raw HTML", () => {
    const html = renderToStaticMarkup(
      createElement(ConservativeMarkdown, {
        text: "# Title\n\nUse `code` and **bold**.\n\n```ts\nconst ok = true;\n```\n\n<script>alert(1)</script>\n\n[safe](https://example.com) and [bad](javascript:alert(1))",
      }),
    );
    expect(html).toContain("Title");
    expect(html).toContain("const ok = true;");
    expect(html).toContain("<strong>");
    expect(html).toContain('href="https://example.com/');
    expect(html).toContain('data-testid="copy-code-block"');
    expect(html).toContain('aria-label="Copy"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("alert(1)");
  });

  test("renders safe https and data images with markdown-image chrome", () => {
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const html = renderToStaticMarkup(
      createElement(ConservativeMarkdown, {
        text: `![remote](https://example.com/shot.png)\n\n![embedded](${tinyPng})`,
      }),
    );
    expect(html).toContain('data-testid="markdown-image"');
    expect(html).toContain('src="https://example.com/shot.png"');
    expect(html).toContain(`src="${tinyPng}"`);
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).not.toContain("<script");
  });

  test("rejects file, javascript, and relative markdown images", () => {
    const html = renderToStaticMarkup(
      createElement(ConservativeMarkdown, {
        text: "![local](file:///tmp/a.png)\n\n![js](javascript:alert(1))\n\n![rel](./shot.png)",
      }),
    );
    expect(html).not.toContain('src="file:');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('src="./shot.png"');
    expect(html).not.toContain('data-testid="markdown-image"');
    expect(html).toContain('data-testid="markdown-image-fallback"');
  });

  test("renders KaTeX for inline and display math without scripts", () => {
    const html = renderToStaticMarkup(
      createElement(ConservativeMarkdown, {
        text: "Inline $E=mc^2$ and display:\n\n$$\\int_0^1 x\\,dx$$\n",
      }),
    );
    expect(html).toContain("katex");
    expect(html).not.toContain("<script");
  });

  test("keeps mermaid source while streaming", () => {
    const html = renderToStaticMarkup(
      createElement(ConservativeMarkdown, {
        isStreaming: true,
        text: "```mermaid\nflowchart LR\n  A-->B\n```\n",
      }),
    );
    expect(html).toContain("flowchart LR");
    expect(html).toContain("mermaid");
    expect(html).not.toContain('data-testid="mermaid-diagram"');
  });

  test("mounts mermaid diagram wrapper when settled", () => {
    const html = renderToStaticMarkup(
      createElement(ConservativeMarkdown, {
        text: "```mermaid\nflowchart LR\n  A-->B\n```\n",
      }),
    );
    expect(html).toContain('data-testid="mermaid-diagram"');
    expect(html).toMatch(/data-mermaid-theme="(dark|default)"/);
    expect(html).not.toContain("<script");
  });
});

describe("shiki theme helper", () => {
  test("maps prefers-color-scheme to github themes", () => {
    expect(preferredShikiTheme(true)).toBe("github-dark");
    expect(preferredShikiTheme(false)).toBe("github-light");
  });
});
