import { describe, expect, test } from "bun:test";
import { coerceAppearance, emptyAppearanceSettings, glassCssTokens, paletteSupportsMode, resolveAppearanceMode } from "@pho-code/protocol";
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
        ...emptyAppearanceSettings(),
        palette: "gruvbox",
        mode: "dark",
        workEntryIcons: "pho",
        glassEnabled: true,
        glassStrength: 80,
      },
      root as unknown as HTMLElement,
      { prefersDark: false },
    );

    expect(resolved).toBe("dark");
    expect(root.dataset.palette).toBe("gruvbox");
    expect(root.dataset.appearance).toBe("dark");
    expect(root.dataset.workIcons).toBe("pho");
    expect(root.dataset.brandIcons).toBe("mono");
    expect(root.dataset.glass).toBe("on");
    const tokens = glassCssTokens(80);
    expect(root.style.properties.get("--glass-blur")).toBe(`${tokens.blurPx}px`);
    expect(root.style.properties.get("--sidebar-glass-blur")).toBe(`${tokens.sidebarBlurPx}px`);
    expect(root.style.properties.get("--composer-glass-opacity")).toBe(`${tokens.composerOpacityPercent}%`);
    expect(Number.parseInt(root.style.properties.get("--sidebar-glass-opacity") ?? "100", 10)).toBeLessThanOrEqual(
      Number.parseInt(root.style.properties.get("--composer-glass-opacity") ?? "100", 10),
    );
    expect(Number.parseInt(root.style.properties.get("--composer-glass-opacity") ?? "100", 10)).toBeLessThanOrEqual(
      Number.parseInt(root.style.properties.get("--glass-opacity") ?? "100", 10),
    );
  });

  test("applyAppearanceTheme clears glass when disabled", () => {
    const root = fakeRoot();
    applyAppearanceTheme(
      {
        ...emptyAppearanceSettings(),
        palette: "default",
        mode: "light",
        workEntryIcons: "pho",
        glassEnabled: false,
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
    expect(css).toContain(".transcript-scroller,\n.transcript-scroller * {");
    expect(css).toContain(".chat-column {");
    expect(css).toContain(".empty-session-column {\n  width: 100%;\n  min-width: 0;\n  margin-inline: auto;\n  max-width: 42rem;");
    expect(css).not.toContain("data-chat-fill");
    expect(css).toContain(".composer-context-button.is-agent {\n  color: var(--destructive-foreground);");
    expect(css).toContain(".composer-thinking-select {\n  width: fit-content;");
    expect(css).toContain(".composer-toolbar-group.is-trailing {\n  margin-left: auto;\n  min-width: 0;\n  flex: 1 1 0;\n  justify-content: flex-end;");
    expect(css).toContain(".composer-toolbar-group.is-trailing .composer-model-picker-panel,\n.composer-thinking-menu {\n  left: auto;\n  right: 0;");
    expect(css).toContain("max-width: min(22rem, 100cqi);");
    expect(css).toContain(".composer-model-picker-toolbar {\n  z-index: 2;\n  flex-shrink: 0;");
    expect(css).toContain(".composer-model-picker-list {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow: auto;\n  margin: 0;\n  padding: 0 0.35rem 0.4rem;");
    expect(css).toContain(".composer-model-picker-group-title {\n  position: sticky;\n  top: 0;\n  z-index: 1;");
    expect(css).toContain("background: var(--popover);");
    expect(css).toContain("--composer-radius: 0.5rem;");
    expect(css).toContain("--composer-outline: color-mix(in srgb, var(--foreground) 28%, transparent);");
    expect(css).toContain(".chat-composer-host::after {\n  pointer-events: none;\n  position: absolute;\n  z-index: 1;\n  inset: 0;\n  border: 1px solid var(--composer-outline);");
    expect(css).toContain(
      'html[data-appearance="dark"] .chat-composer-host::after {\n  border-color: color-mix(in srgb, var(--foreground) 15%, transparent);',
    );
  });

  test("glass chrome tints chat and right bar; composer gets CSS frost when glass is on", async () => {
    const css = await Bun.file(new URL("../src/theme.css", import.meta.url)).text();
    expect(css).toContain("html[data-glass=\"on\"] .app-shell-chat,\nhtml[data-glass=\"on\"] .right-sidebar-host {");
    expect(css).toContain("html[data-glass=\"on\"] .app-sidebar-panel {");
    expect(css).toContain("html[data-glass=\"on\"] .plan-document-panel,");
    expect(css).toContain("html[data-glass=\"on\"] .change-window,");
    expect(css).not.toContain("html[data-glass=\"on\"] .change-window-file-head");
    expect(css).toContain(".empty-session[data-left-overlay=\"true\"] .empty-session-center {");
    expect(css).toContain("html[data-glass=\"on\"] .chat-composer-shell::before {");
    expect(css).toContain(
      "html[data-glass=\"on\"] .chat-composer-shell::before {\n  background: color-mix(in srgb, var(--background) var(--composer-glass-opacity), transparent);\n  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturation));",
    );
    expect(css).toContain(".chat-composer-shell::before {\n  pointer-events: none;\n  position: absolute;\n  z-index: 0;\n  inset: 0;\n  border-radius: var(--composer-radius);\n  background: var(--background);");
    expect(css).toContain("html[data-appearance=\"dark\"] .chat-composer-shell::before {\n  background: var(--card);");
    expect(css).not.toContain("isolation: isolate;");
    expect(css).toContain("html[data-glass=\"on\"] .chat-composer-host {\n  box-shadow: 0 10px 28px -20px rgb(0 0 0 / 28%);\n}");
  });

  test("readAppearancePalette falls back to default", () => {
    const root = fakeRoot();
    expect(readAppearancePalette(root as unknown as HTMLElement)).toBe("default");
    root.dataset.palette = "gruvbox";
    expect(readAppearancePalette(root as unknown as HTMLElement)).toBe("gruvbox");
    root.dataset.palette = "sepia";
    expect(readAppearancePalette(root as unknown as HTMLElement)).toBe("default");
  });

  test("applyAppearanceTheme writes the work-entry icon pack", () => {
    const root = fakeRoot();
    applyAppearanceTheme(
      {
        ...emptyAppearanceSettings(),
        workEntryIcons: "lucide",
        mode: "light",
      },
      root as unknown as HTMLElement,
      { prefersDark: false },
    );
    expect(root.dataset.workIcons).toBe("lucide");
  });

  test("applyAppearanceTheme writes the brand icon style", () => {
    const root = fakeRoot();
    applyAppearanceTheme(
      {
        ...emptyAppearanceSettings(),
        brandIcons: "color",
        mode: "light",
      },
      root as unknown as HTMLElement,
      { prefersDark: false },
    );
    expect(root.dataset.brandIcons).toBe("color");
  });

  test("color brand marks sit on a light contrast plate", async () => {
    const css = await Bun.file(new URL("../src/theme.css", import.meta.url)).text();
    expect(css).toContain(".brand-mark.is-color {");
    expect(css).toContain("box-shadow: 0 0 0 1px color-mix(in srgb, var(--foreground) 32%, transparent);");
    expect(css).toContain('html[data-appearance="dark"] .brand-mark.is-color {\n  background: #f4f4f5;');
  });
});
