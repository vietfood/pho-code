import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveModelIconId, resolveProviderIconId } from "../src/lib/lobe-brand-icons";
import { ModelBrandIcon, ProviderIcon } from "../src/provider-icon";

describe("resolveProviderIconId", () => {
  test("maps Pi provider ids and aliases onto Lobe marks", () => {
    expect(resolveProviderIconId("openai")).toBe("openai");
    expect(resolveProviderIconId("openai-codex")).toBe("codex");
    expect(resolveProviderIconId("google-gemini")).toBe("gemini");
    expect(resolveProviderIconId("google-vertex")).toBe("vertexai");
    expect(resolveProviderIconId("amazon-bedrock")).toBe("bedrock");
    expect(resolveProviderIconId("baseten")).toBe("baseten");
    expect(resolveProviderIconId("cloudflare-ai-gateway")).toBe("cloudflare");
    expect(resolveProviderIconId("cloudflare-workers-ai")).toBe("workersai");
    expect(resolveProviderIconId("qwen-token-plan-cn")).toBe("qwen");
    expect(resolveProviderIconId("xiaomi-token-plan-ams")).toBe("xiaomimimo");
    expect(resolveProviderIconId("kimi-coding")).toBe("kimi");
    expect(resolveProviderIconId("moonshotai")).toBe("moonshot");
    expect(resolveProviderIconId("opencode")).toBe("opencode");
    expect(resolveProviderIconId("unknown-lab")).toBeUndefined();
  });
});

describe("resolveModelIconId", () => {
  test("keeps every OpenRouter catalog id on the OpenRouter mark", () => {
    expect(resolveModelIconId("ai21/jamba", "openrouter")).toBe("openrouter");
    expect(resolveModelIconId("anthropic/claude-sonnet", "openrouter")).toBe("openrouter");
    expect(resolveModelIconId("openai/gpt-4o", "openrouter")).toBe("openrouter");
  });

  test("prefers the model brand over the hosting provider for other catalogs", () => {
    expect(resolveModelIconId("claude-sonnet", "anthropic")).toBe("claude");
    expect(resolveModelIconId("gpt-4o", "openai")).toBe("openai");
    expect(resolveModelIconId("v4-flash", "deepseek")).toBe("deepseek");
    expect(resolveModelIconId("kimi-k2", "moonshot")).toBe("kimi");
    expect(resolveModelIconId("v1", "moonshot")).toBe("moonshot");
    expect(resolveModelIconId("glm-4.6", "zai")).toBe("zai");
  });
});

describe("ProviderIcon", () => {
  test("uses the Lobe Codex mark for openai-codex", () => {
    const markup = renderToStaticMarkup(createElement(ProviderIcon, { provider: "openai-codex" }));
    expect(markup).toContain('data-provider="openai-codex"');
    expect(markup).toContain('data-lobe-icon="codex"');
    expect(markup).toContain("codex.svg");
    expect(markup).not.toContain("codex-color.svg");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<text");
  });

  test("keeps the Lobe OpenAI blossom for API-key openai", () => {
    const markup = renderToStaticMarkup(createElement(ProviderIcon, { provider: "openai" }));
    expect(markup).toContain('data-provider="openai"');
    expect(markup).toContain('data-lobe-icon="openai"');
    expect(markup).toContain("openai.svg");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("codex.svg");
  });

  test("uses the Lobe Cursor mark for the cursor provider", () => {
    const markup = renderToStaticMarkup(createElement(ProviderIcon, { provider: "cursor" }));
    expect(markup).toContain('data-provider="cursor"');
    expect(markup).toContain('data-lobe-icon="cursor"');
    expect(markup).not.toContain("<text");
  });

  test("falls back to a letter for unknown providers", () => {
    const markup = renderToStaticMarkup(createElement(ProviderIcon, { provider: "acme-lab" }));
    expect(markup).toContain('data-provider="acme-lab"');
    expect(markup).not.toContain("data-lobe-icon");
    expect(markup).toContain("<text");
    expect(markup).toContain("A");
  });

  test("uses the Lobe Baseten and Cloudflare marks", () => {
    const baseten = renderToStaticMarkup(createElement(ProviderIcon, { provider: "baseten" }));
    expect(baseten).toContain('data-lobe-icon="baseten"');
    expect(baseten).toContain("baseten.svg");
    const cloudflare = renderToStaticMarkup(createElement(ProviderIcon, { provider: "cloudflare-ai-gateway" }));
    expect(cloudflare).toContain('data-provider="cloudflare-ai-gateway"');
    expect(cloudflare).toContain('data-lobe-icon="cloudflare"');
    expect(cloudflare).toContain("cloudflare.svg");
  });
});

describe("ModelBrandIcon", () => {
  test("uses the OpenRouter mark for every OpenRouter catalog id", () => {
    const markup = renderToStaticMarkup(
      createElement(ModelBrandIcon, { provider: "openrouter", modelId: "ai21/jamba" }),
    );
    expect(markup).toContain('data-provider="openrouter"');
    expect(markup).toContain('data-lobe-icon="openrouter"');
    expect(markup).toContain("openrouter.svg");
    expect(markup).not.toContain("openrouter-color.svg");
    expect(markup).not.toContain("<img");
  });

  test("uses the Lobe color mark on a contrast plate when variant is color", () => {
    const markup = renderToStaticMarkup(
      createElement(ModelBrandIcon, { provider: "openrouter", modelId: "ai21/jamba", variant: "color" }),
    );
    expect(markup).toContain('data-brand-style="color"');
    expect(markup).toContain("openrouter-color.svg");
    expect(markup).toContain("<img");
    expect(markup).toContain("brand-mark is-color");
  });

  test("keeps the mono mask when a brand has no color SVG", () => {
    const markup = renderToStaticMarkup(createElement(ProviderIcon, { provider: "openai", variant: "color" }));
    expect(markup).toContain('data-brand-style="color"');
    expect(markup).toContain("openai.svg");
    expect(markup).not.toContain("<img");
  });
});
