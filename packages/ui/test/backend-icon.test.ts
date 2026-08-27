import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BackendIcon, backendIconKind } from "../src/backend-icon";

describe("backendIconKind", () => {
  test("maps advertised backend ids to marks", () => {
    expect(backendIconKind("pi")).toBe("pi");
    expect(backendIconKind("codex")).toBe("codex");
    expect(backendIconKind("claude-acp")).toBe("claude");
    expect(backendIconKind("other")).toBe("unknown");
  });
});

describe("BackendIcon", () => {
  test("uses the Lobe Pi Agent mark", () => {
    const markup = renderToStaticMarkup(createElement(BackendIcon, { backendId: "pi" }));
    expect(markup).toContain('data-backend-kind="pi"');
    expect(markup).toContain('data-lobe-icon="pi"');
    expect(markup).toContain("pi.svg");
    expect(markup).not.toContain("<text");
  });

  test("uses the Lobe Codex mark", () => {
    const markup = renderToStaticMarkup(createElement(BackendIcon, { backendId: "codex" }));
    expect(markup).toContain('data-backend-kind="codex"');
    expect(markup).toContain('data-lobe-icon="codex"');
    expect(markup).toContain("codex.svg");
    expect(markup).not.toContain("codex-color.svg");
    expect(markup).not.toContain("<img");
  });

  test("uses the Lobe Claude mark", () => {
    const markup = renderToStaticMarkup(createElement(BackendIcon, { backendId: "claude-acp" }));
    expect(markup).toContain('data-backend-kind="claude"');
    expect(markup).toContain('data-lobe-icon="claude"');
    expect(markup).toContain("claude.svg");
    expect(markup).not.toContain("claude-color.svg");
    expect(markup).not.toContain("<img");
  });
});
