const HTTP_URL_PATTERN = /^(https?):\/\/([^/?#]+)([/?#].*)?$/i;

export function isSafeHttpUrl(url: string): boolean {
  if (typeof url !== "string" || url.trim() === "") {
    return false;
  }
  const match = HTTP_URL_PATTERN.exec(url.trim());
  if (!match) {
    return false;
  }
  const authority = match[2] ?? "";
  if (authority.length === 0 || authority.includes("@") || authority.includes("\\") || /\s/.test(authority)) {
    return false;
  }
  return hostnameFromAuthority(authority) !== undefined;
}

export function hostnameFromHttpUrl(url: string): string | undefined {
  if (!isSafeHttpUrl(url)) {
    return undefined;
  }
  const match = HTTP_URL_PATTERN.exec(url.trim());
  return hostnameFromAuthority(match?.[2] ?? "");
}

function hostnameFromAuthority(authority: string): string | undefined {
  const host = authority.startsWith("[")
    ? authority.slice(0, authority.indexOf("]") + 1)
    : authority.split(":")[0] ?? "";
  const hostname = host.trim();
  return hostname.length > 0 ? hostname : undefined;
}
