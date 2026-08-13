/** Shorten a filesystem path for dense sidebar rows while keeping ends readable. */
export function compactPath(path: string, maxLength = 28): string {
  if (path.length <= maxLength) {
    return path;
  }
  const ellipsis = "...";
  const budget = maxLength - ellipsis.length;
  const head = Math.ceil(budget / 2);
  const tail = Math.floor(budget / 2);
  return `${path.slice(0, head)}${ellipsis}${path.slice(-tail)}`;
}
