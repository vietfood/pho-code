import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderIcon } from "../src/provider-icon";

describe("ProviderIcon", () => {
  test("uses the Codex cloud bitmaps for openai-codex", () => {
    const markup = renderToStaticMarkup(createElement(ProviderIcon, { provider: "openai-codex" }));
    expect(markup).toContain('data-provider="openai-codex"');
    expect(markup).toContain("openai-codex-light.png");
    expect(markup).toContain("openai-codex-dark.png");
    expect(markup).not.toContain("<text");
  });

  test("keeps the Simple Icons blossom for API-key openai", () => {
    const markup = renderToStaticMarkup(createElement(ProviderIcon, { provider: "openai" }));
    expect(markup).toContain('data-provider="openai"');
    expect(markup).toContain("<path");
    expect(markup).not.toContain("openai-codex-");
  });
});
