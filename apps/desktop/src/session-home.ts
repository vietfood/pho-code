/** Keep a deliberate Home view (no selected chat) across bootstrap refresh. */
export function keepWelcomeSelection(selectedKey: string | null, cachedCount: number): boolean {
  return selectedKey === null && cachedCount > 0;
}
