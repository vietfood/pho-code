const COMPOSER_MENU_NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]);

/** Skip token resync on keyup while a picker menu is handling navigation keys. */
export function shouldSkipComposerTokenSyncOnKeyUp(
  key: string,
  menuOpen: boolean,
  slashOpen: boolean,
): boolean {
  if (!COMPOSER_MENU_NAV_KEYS.has(key)) {
    return false;
  }
  return menuOpen || slashOpen;
}

export function nextComposerMenuIndex(current: number, delta: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return (current + delta + length) % length;
}

export function clampComposerMenuIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.min(index, length - 1);
}
