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
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("alert(1)");
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
