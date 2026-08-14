const COMPOSER_MENU_NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]);
const COMPOSER_MENU_COMMIT_KEYS = new Set(["Enter", "Tab", "Escape"]);

/** Skip token resync on keyup while a picker menu is handling navigation keys. */
export function shouldSkipComposerTokenSyncOnKeyUp(
  key: string,
  menuOpen: boolean,
  slashOpen: boolean,
): boolean {
  if (!COMPOSER_MENU_NAV_KEYS.has(key)) {
    return false;
  }
  // Enter/Tab/Escape still fire keyup after the menu closes on the next render.
  // Skipping them avoids immediately reopening the same @ or / token.
  if (COMPOSER_MENU_COMMIT_KEYS.has(key)) {
    return true;
  }
  return menuOpen || slashOpen;
}

/** True when this @ or / token was dismissed and should stay closed. */
export function isDismissedComposerToken(
  tokenStart: number,
  dismissedStart: number | null,
): boolean {
  return dismissedStart !== null && dismissedStart === tokenStart;
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
