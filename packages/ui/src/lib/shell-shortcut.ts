export function isPrimaryModShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  key: string,
  options: { shift?: boolean } = {},
): boolean {
  const wantsShift = options.shift === true;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey !== wantsShift) {
    return false;
  }
  return event.key.toLowerCase() === key.toLowerCase();
}
