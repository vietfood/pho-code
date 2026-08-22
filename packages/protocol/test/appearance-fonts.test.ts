import { describe, expect, test } from "bun:test";
import {
  appearanceFontStack,
  cssQuotedFontFamily,
  isFontFamilyName,
  MAX_FONT_FAMILY_CHARS,
  sanitizeFontFamilyName,
} from "../src/index";

describe("font family sanitizer", () => {
  test("treats blank input as the system default", () => {
    expect(sanitizeFontFamilyName("")).toBe("");
    expect(sanitizeFontFamilyName("   ")).toBe("");
    expect(isFontFamilyName("")).toBe(true);
  });

  test("accepts a single installed family name", () => {
    expect(sanitizeFontFamilyName("  JetBrainsMono Nerd Font  ")).toBe("JetBrainsMono Nerd Font");
    expect(sanitizeFontFamilyName("Menlo")).toBe("Menlo");
    expect(isFontFamilyName("Menlo")).toBe(true);
  });

  test("rejects CSS or HTML injection and family lists", () => {
    expect(sanitizeFontFamilyName('Menlo"; background: url(https://x)')).toBeNull();
    expect(sanitizeFontFamilyName("Menlo, monospace")).toBeNull();
    expect(sanitizeFontFamilyName("url(https://evil)")).toBeNull();
    expect(sanitizeFontFamilyName("Menlo; color: red")).toBeNull();
    expect(sanitizeFontFamilyName("<script>")).toBeNull();
    expect(sanitizeFontFamilyName("Menlo\nMono")).toBeNull();
    expect(sanitizeFontFamilyName(1)).toBeNull();
    expect(isFontFamilyName("Menlo, monospace")).toBe(false);
  });

  test("rejects names over the character cap", () => {
    expect(sanitizeFontFamilyName("A".repeat(MAX_FONT_FAMILY_CHARS))).toBe("A".repeat(MAX_FONT_FAMILY_CHARS));
    expect(sanitizeFontFamilyName("A".repeat(MAX_FONT_FAMILY_CHARS + 1))).toBeNull();
  });

  test("quotes families that are not CSS idents and prepends the default stack", () => {
    expect(cssQuotedFontFamily("Menlo")).toBe("Menlo");
    expect(cssQuotedFontFamily("JetBrainsMono Nerd Font")).toBe('"JetBrainsMono Nerd Font"');
    expect(appearanceFontStack("", "Menlo, monospace")).toBeNull();
    expect(appearanceFontStack("Menlo", "ui-monospace, monospace")).toBe("Menlo, ui-monospace, monospace");
    expect(appearanceFontStack("JetBrainsMono Nerd Font", "ui-monospace, monospace")).toBe(
      '"JetBrainsMono Nerd Font", ui-monospace, monospace',
    );
  });
});
