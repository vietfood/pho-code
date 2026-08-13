import {
  clampChatFontSize,
  clampUiFontSize,
  type AppearanceSettings,
} from "@pho-code/protocol";

/**
 * Apply typed appearance font sizes to the document root.
 * UI size sets the rem base; chat size is an absolute px token for transcript/composer.
 */
export function applyAppearanceFonts(appearance: AppearanceSettings, root: HTMLElement = document.documentElement): void {
  const ui = clampUiFontSize(appearance.uiFontSize);
  const chat = clampChatFontSize(appearance.chatFontSize);
  root.style.fontSize = `${ui}px`;
  root.style.setProperty("--font-size-ui", `${ui}px`);
  root.style.setProperty("--font-size-chat", `${chat}px`);
}
