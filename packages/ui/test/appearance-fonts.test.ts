import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CHAT_FONT_SIZE,
  DEFAULT_UI_FONT_SIZE,
  emptyAppearanceSettings,
} from "@pho-code/protocol";
import { applyAppearanceFonts, DEFAULT_MONO_FONT_STACK, DEFAULT_SANS_FONT_STACK } from "../src/lib/appearance-fonts";

function fakeRoot() {
  const properties = new Map<string, string>();
  return {
    style: {
      fontSize: "",
      properties,
      setProperty(name: string, value: string) {
        properties.set(name, value);
      },
      removeProperty(name: string) {
        properties.delete(name);
      },
    },
  };
}

describe("applyAppearanceFonts", () => {
  test("writes clamped UI and chat font CSS variables", () => {
    const root = fakeRoot();
    applyAppearanceFonts({ ...emptyAppearanceSettings(), uiFontSize: 18, chatFontSize: 16 }, root as unknown as HTMLElement);
    expect(root.style.fontSize).toBe("18px");
    expect(root.style.properties.get("--font-size-ui")).toBe("18px");
    expect(root.style.properties.get("--font-size-chat")).toBe("16px");
  });

  test("clamps out-of-range values", () => {
    const root = fakeRoot();
    applyAppearanceFonts({ ...emptyAppearanceSettings(), uiFontSize: 99, chatFontSize: 1 }, root as unknown as HTMLElement);
    expect(root.style.fontSize).toBe("20px");
    expect(root.style.properties.get("--font-size-chat")).toBe("12px");
  });

  test("prepends custom families and can restore the stylesheet default", () => {
    const root = fakeRoot();
    applyAppearanceFonts(
      { ...emptyAppearanceSettings(), uiFontFamily: "Lucida Grande", codeFontFamily: "JetBrainsMono Nerd Font" },
      root as unknown as HTMLElement,
    );
    expect(root.style.properties.get("--font-sans")).toBe(`"Lucida Grande", ${DEFAULT_SANS_FONT_STACK}`);
    expect(root.style.properties.get("--font-mono")).toBe(`"JetBrainsMono Nerd Font", ${DEFAULT_MONO_FONT_STACK}`);
    applyAppearanceFonts(emptyAppearanceSettings(), root as unknown as HTMLElement);
    expect(root.style.properties.has("--font-sans")).toBe(false);
    expect(root.style.properties.has("--font-mono")).toBe(false);
  });

  test("applies grayscale smoothing and can restore the platform default", () => {
    const root = fakeRoot();
    applyAppearanceFonts(emptyAppearanceSettings(), root as unknown as HTMLElement);
    expect(root.style.properties.get("-webkit-font-smoothing")).toBe("antialiased");
    expect(root.style.properties.get("-moz-osx-font-smoothing")).toBe("grayscale");
    applyAppearanceFonts({ ...emptyAppearanceSettings(), fontSmoothing: false }, root as unknown as HTMLElement);
    expect(root.style.properties.has("-webkit-font-smoothing")).toBe(false);
    expect(root.style.properties.has("-moz-osx-font-smoothing")).toBe(false);
  });

  test("defaults stay within the supported range", () => {
    expect(DEFAULT_UI_FONT_SIZE).toBe(16);
    expect(DEFAULT_CHAT_FONT_SIZE).toBe(15);
  });

  test("default stacks in JS match the stylesheet tokens", async () => {
    const css = await Bun.file(new URL("../src/theme.css", import.meta.url)).text();
    expect(css).toContain(`--font-sans: ${DEFAULT_SANS_FONT_STACK};`);
    expect(css).toContain(`--font-mono: ${DEFAULT_MONO_FONT_STACK};`);
    expect(css).not.toContain("-webkit-font-smoothing: antialiased;");
    expect(css).toContain("font-variant-ligatures: none;");
  });
});
