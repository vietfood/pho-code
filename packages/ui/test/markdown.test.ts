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
    expect(html).toContain("chat-markdown-codeblock");
    expect(html).toContain("chat-markdown-codeblock-title");
    expect(html).toContain('data-testid="copy-code-block"');
    expect(html).toContain('aria-label="Copy"');
    expect(html).not.toContain("bg-secondary");
    expect(html).not.toContain("dark:border-transparent");
    expect(html).not.toContain(">Copy</span>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("katex");
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

  test("keeps mermaid source as a plain code block while streaming", () => {
    const html = renderToStaticMarkup(
      createElement(ConservativeMarkdown, {
        streaming: true,
        text: "```mermaid\nflowchart LR\n  A-->B\n```\n",
      }),
    );
    expect(html).toContain("flowchart LR");
    expect(html).toContain("mermaid");
    expect(html).not.toContain('data-testid="mermaid-diagram"');
  });

  test("does not run KaTeX while streaming", () => {
    const html = renderToStaticMarkup(
      createElement(ConservativeMarkdown, {
        streaming: true,
        text: "Inline $E=mc^2$ and **bold**.",
      }),
    );
    expect(html).toContain("<strong>");
    expect(html).not.toContain("katex");
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

  test("keeps svg source as a plain code block while streaming", () => {
    const html = renderToStaticMarkup(
      createElement(ConservativeMarkdown, {
        streaming: true,
        text: "```svg\n<svg xmlns=\"http://www.w3.org/2000/svg\"><circle r=\"4\"/></svg>\n```\n",
      }),
    );
    expect(html).toContain("circle");
    expect(html).toContain("svg");
    expect(html).not.toContain('data-testid="svg-diagram"');
    expect(html).not.toContain("data:image/svg+xml");
  });

  test("mounts svg as a data-url image when settled without injecting markup", () => {
    const html = renderToStaticMarkup(
      createElement(ConservativeMarkdown, {
        text: "```svg\n<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"><script>alert(1)</script><circle r=\"4\" fill=\"#fff\"/></svg>\n```\n",
      }),
    );
    expect(html).toContain('data-testid="svg-diagram"');
    expect(html).toContain('data-testid="markdown-image"');
    expect(html).toContain("data:image/svg+xml;charset=utf-8,");
    expect(html).toContain('aria-label="SVG diagram"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onload=");
    expect(html).not.toContain("javascript:");
  });

  test("falls back to source when a settled svg fence is not an svg root", () => {
    const html = renderToStaticMarkup(
      createElement(ConservativeMarkdown, {
        text: "```svg\nnot a diagram\n```\n",
      }),
    );
    expect(html).toContain("not a diagram");
    expect(html).not.toContain('data-testid="svg-diagram"');
    expect(html).not.toContain("data:image/svg+xml");
  });
});

describe("shiki theme helper", () => {
  test("maps palettes to bundled Shiki themes", () => {
    expect(preferredShikiTheme(true)).toBe("github-dark");
    expect(preferredShikiTheme(false)).toBe("github-light");
    expect(preferredShikiTheme(true, "github")).toBe("github-dark");
    expect(preferredShikiTheme(false, "github")).toBe("github-light");
    expect(preferredShikiTheme(true, "gruvbox")).toBe("gruvbox-dark-medium");
    expect(preferredShikiTheme(false, "gruvbox")).toBe("gruvbox-light-medium");
    expect(preferredShikiTheme(true, "catppuccin")).toBe("catppuccin-mocha");
    expect(preferredShikiTheme(false, "catppuccin")).toBe("catppuccin-latte");
    expect(preferredShikiTheme(true, "flexoki")).toBe("solarized-dark");
    expect(preferredShikiTheme(false, "flexoki")).toBe("solarized-light");
    expect(preferredShikiTheme(true, "one-dark")).toBe("one-dark-pro");
    expect(preferredShikiTheme(false, "one-dark")).toBe("one-dark-pro");
  });
});
