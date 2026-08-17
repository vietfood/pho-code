import { describe, expect, test } from "bun:test";
import { coerceAppearance, glassCssTokens, paletteSupportsMode, resolveAppearanceMode } from "@pho-code/protocol";
import { applyAppearanceTheme, readAppearancePalette } from "../src/lib/appearance-theme";

function fakeRoot() {
  const dataset: Record<string, string> = {};
  const properties = new Map<string, string>();
  return {
    dataset,
    style: {
      colorScheme: "",
      setProperty(name: string, value: string) {
        properties.set(name, value);
      },
      properties,
    },
  };
}

describe("appearance theme helpers", () => {
  test("coerceAppearance forces one-dark to dark mode", () => {
    expect(coerceAppearance({ palette: "one-dark", mode: "system" })).toEqual({
      palette: "one-dark",
      mode: "dark",
    });
    expect(paletteSupportsMode("one-dark", "light")).toBe(false);
    expect(paletteSupportsMode("gruvbox", "light")).toBe(true);
  });

  test("resolveAppearanceMode follows system preference", () => {
    expect(resolveAppearanceMode("system", true)).toBe("dark");
    expect(resolveAppearanceMode("system", false)).toBe("light");
    expect(resolveAppearanceMode("light", true)).toBe("light");
  });

  test("applyAppearanceTheme sets palette appearance and glass tokens", () => {
    const root = fakeRoot();
    const resolved = applyAppearanceTheme(
      {
        palette: "gruvbox",
        mode: "dark",
        glassEnabled: true,
        glassStrength: 80,
        uiFontSize: 16,
        chatFontSize: 14,
      },
      root as unknown as HTMLElement,
      { prefersDark: false },
    );

    expect(resolved).toBe("dark");
    expect(root.dataset.palette).toBe("gruvbox");
    expect(root.dataset.appearance).toBe("dark");
    expect(root.dataset.glass).toBe("on");
    const tokens = glassCssTokens(80);
    expect(root.style.properties.get("--glass-blur")).toBe(`${tokens.blurPx}px`);
    expect(root.style.properties.get("--sidebar-glass-blur")).toBe(`${tokens.sidebarBlurPx}px`);
    expect(root.style.properties.get("--composer-glass-opacity")).toBe(`${tokens.composerOpacityPercent}%`);
    expect(Number.parseInt(root.style.properties.get("--sidebar-glass-opacity") ?? "100", 10)).toBeLessThan(
      Number.parseInt(root.style.properties.get("--glass-opacity") ?? "100", 10),
    );
    expect(Number.parseInt(root.style.properties.get("--glass-opacity") ?? "100", 10)).toBeLessThan(
      Number.parseInt(root.style.properties.get("--composer-glass-opacity") ?? "100", 10),
    );
  });

  test("applyAppearanceTheme clears glass when disabled", () => {
    const root = fakeRoot();
    applyAppearanceTheme(
      {
        palette: "default",
        mode: "light",
        glassEnabled: false,
        glassStrength: 55,
        uiFontSize: 16,
        chatFontSize: 14,
      },
      root as unknown as HTMLElement,
      { prefersDark: true },
    );
    expect(root.dataset.appearance).toBe("light");
    expect(root.dataset.glass).toBe("off");
    expect(root.style.properties.get("--glass-opacity")).toBe("100%");
    expect(root.style.properties.get("--composer-glass-opacity")).toBe("100%");
  });

  test("shell dividers mix from foreground so dark palettes stay visible", async () => {
    const css = await Bun.file(new URL("../src/theme.css", import.meta.url)).text();
    expect(css).toContain("--shell-divider: color-mix(in srgb, var(--foreground) 18%, transparent)");
    expect(css).toContain(".app-sidebar-panel {\n  border-right: 1px solid var(--shell-divider);");
    expect(css).toContain(".right-sidebar-host {\n  border-left: 1px solid var(--shell-divider);");
    expect(css).toContain(".transcript-scroller,\n.transcript-scroller * {");
    expect(css).toContain(".chat-column {");
    expect(css).toContain('[data-chat-fill="true"] .chat-column,\n[data-chat-fill="true"] .empty-session-column {');
    expect(css).toContain("max-width: none;");
    expect(css).toContain(".composer-mode-chip.is-agent {\n  color: var(--destructive-foreground);");
    expect(css).toContain(".composer-thinking-select {\n  width: fit-content;");
    expect(css).toContain(".composer-model-picker-toolbar {\n  z-index: 2;\n  flex-shrink: 0;");
    expect(css).toContain(".composer-model-picker-list {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow: auto;\n  margin: 0;\n  padding: 0 0.35rem 0.4rem;");
    expect(css).toContain(".composer-model-picker-group-title {\n  position: sticky;\n  top: 0;\n  z-index: 1;");
    expect(css).toContain("background: var(--popover);");
  });

  test("readAppearancePalette falls back to default", () => {
    const root = fakeRoot();
    expect(readAppearancePalette(root as unknown as HTMLElement)).toBe("default");
    root.dataset.palette = "gruvbox";
    expect(readAppearancePalette(root as unknown as HTMLElement)).toBe("gruvbox");
    root.dataset.palette = "sepia";
    expect(readAppearancePalette(root as unknown as HTMLElement)).toBe("default");
  });
});
