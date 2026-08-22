import {
  appearanceFontStack,
  clampChatFontSize,
  clampUiFontSize,
  type AppearanceSettings,
} from "@pho-code/protocol";

/** Must match `@theme` stacks in theme.css. */
export const DEFAULT_SANS_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
export const DEFAULT_MONO_FONT_STACK =
  'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace';

/**
 * Apply typed appearance font sizes, families, and smoothing to the document root.
 * UI size sets the rem base; chat size is an absolute px token for transcript/composer.
 * Empty family names clear the override so the stylesheet default stack stays in charge.
 */
export function applyAppearanceFonts(appearance: AppearanceSettings, root: HTMLElement = document.documentElement): void {
  const ui = clampUiFontSize(appearance.uiFontSize);
  const chat = clampChatFontSize(appearance.chatFontSize);
  root.style.fontSize = `${ui}px`;
  root.style.setProperty("--font-size-ui", `${ui}px`);
  root.style.setProperty("--font-size-chat", `${chat}px`);
  applyFontFamily(root, "--font-sans", appearance.uiFontFamily, DEFAULT_SANS_FONT_STACK);
  applyFontFamily(root, "--font-mono", appearance.codeFontFamily, DEFAULT_MONO_FONT_STACK);
  if (appearance.fontSmoothing) {
    root.style.setProperty("-webkit-font-smoothing", "antialiased");
    root.style.setProperty("-moz-osx-font-smoothing", "grayscale");
  } else {
    root.style.removeProperty("-webkit-font-smoothing");
    root.style.removeProperty("-moz-osx-font-smoothing");
  }
}

function applyFontFamily(root: HTMLElement, variable: string, custom: string, fallback: string): void {
  const stack = appearanceFontStack(custom, fallback);
  if (stack === null) {
    root.style.removeProperty(variable);
  } else {
    root.style.setProperty(variable, stack);
  }
}
