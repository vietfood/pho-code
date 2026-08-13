const FOCUSABLE_SELECTOR = "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])";

export function shouldWrapDialogTab(activeIndex: number, count: number, shiftKey: boolean): boolean {
  if (count === 0) {
    return false;
  }
  if (shiftKey) {
    return activeIndex <= 0;
  }
  return activeIndex >= count - 1;
}

export function nextDialogTabIndex(activeIndex: number, count: number, shiftKey: boolean): number {
  if (count === 0) {
    return -1;
  }
  if (shiftKey) {
    return activeIndex <= 0 ? count - 1 : activeIndex - 1;
  }
  return activeIndex >= count - 1 ? 0 : activeIndex + 1;
}

export function queryDialogFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function handleDialogTab(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== "Tab") {
    return;
  }
  const focusables = queryDialogFocusables(root);
  const activeIndex = focusables.findIndex((node) => node === document.activeElement);
  if (!shouldWrapDialogTab(activeIndex, focusables.length, event.shiftKey)) {
    return;
  }
  event.preventDefault();
  const next = focusables[nextDialogTabIndex(activeIndex, focusables.length, event.shiftKey)];
  next?.focus();
}
