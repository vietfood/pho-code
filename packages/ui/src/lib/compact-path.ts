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

/** Split a workspace-relative path into directory + basename for file-list rows. */
export function splitRelativePath(path: string): { directory: string; name: string } {
  const normalized = path.replaceAll("\\", "/");
  const slash = normalized.lastIndexOf("/");
  if (slash < 0) {
    return { directory: "", name: normalized };
  }
  return { directory: normalized.slice(0, slash), name: normalized.slice(slash + 1) };
}
