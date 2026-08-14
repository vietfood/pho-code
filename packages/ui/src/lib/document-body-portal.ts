export function documentBodyPortalTarget(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.body ?? null;
}
