import { describe, expect, test } from "bun:test";
import { DEFAULT_CHAT_FONT_SIZE, DEFAULT_UI_FONT_SIZE } from "@pho-code/protocol";
import { applyAppearanceFonts } from "../src/lib/appearance-fonts";

describe("applyAppearanceFonts", () => {
  test("writes clamped UI and chat font CSS variables", () => {
    const root = {
      style: {
        fontSize: "",
        properties: new Map<string, string>(),
        setProperty(name: string, value: string) {
          this.properties.set(name, value);
        },
      },
    };

    applyAppearanceFonts(
      {
        palette: "default",
        mode: "system",
        glassEnabled: false,
        glassStrength: 55,
        uiFontSize: 18,
        chatFontSize: 16,
      },
      root as unknown as HTMLElement,
    );

    expect(root.style.fontSize).toBe("18px");
    expect(root.style.properties.get("--font-size-ui")).toBe("18px");
    expect(root.style.properties.get("--font-size-chat")).toBe("16px");
  });

  test("clamps out-of-range values", () => {
    const root = {
      style: {
        fontSize: "",
        properties: new Map<string, string>(),
        setProperty(name: string, value: string) {
          this.properties.set(name, value);
        },
      },
    };

    applyAppearanceFonts(
      {
        palette: "default",
        mode: "dark",
        glassEnabled: false,
        glassStrength: 55,
        uiFontSize: 99,
        chatFontSize: 1,
      },
      root as unknown as HTMLElement,
    );

    expect(root.style.fontSize).toBe("20px");
    expect(root.style.properties.get("--font-size-chat")).toBe("12px");
  });

  test("defaults stay within the supported range", () => {
    expect(DEFAULT_UI_FONT_SIZE).toBe(16);
    expect(DEFAULT_CHAT_FONT_SIZE).toBe(14);
  });
});
