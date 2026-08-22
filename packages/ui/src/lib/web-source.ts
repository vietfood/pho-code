export type WebToolKind = "search" | "fetch";

export interface WebSourceRow {
  title: string;
  url: string;
  host: string;
  displayHost: string;
}

export const WEB_SEARCH_PREVIEW_COUNT = 3;

const SITE_BADGE_COLORS = [
  "#3b82f6",
  "#f97316",
  "#16a34a",
  "#a855f7",
  "#e11d48",
  "#0891b2",
  "#ca8a04",
  "#db2777",
] as const;

export function webToolKind(name: string): WebToolKind | null {
  const key = name.trim().replace(/_/gu, " ").toLowerCase();
  if (key === "web search") {
    return "search";
  }
  if (key === "fetch" || key === "fetch content") {
    return "fetch";
  }
  return null;
}

export function parseWebSearchResults(output: string): WebSourceRow[] {
  const rows: WebSourceRow[] = [];
  const seen = new Set<string>();
  for (const block of output.split(/^\d+\.\s+/mu).slice(1)) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const title = lines[0];
    const urlLine = lines.find((line) => /^https?:\/\//u.test(line));
    if (!title || !urlLine) {
      continue;
    }
    const row = toSourceRow(title, urlLine);
    if (!row || seen.has(row.url)) {
      continue;
    }
    seen.add(row.url);
    rows.push(row);
  }
  return rows;
}

export function parseWebSearchQuery(inputPreview: string): string | null {
  return extractJsonStringField(inputPreview, "query");
}

export function parseWebFetchSource(inputPreview: string, outputPreview = ""): WebSourceRow | null {
  const url = extractJsonStringField(inputPreview, "url") ?? extractSourceLine(outputPreview);
  if (!url) {
    return null;
  }
  const title = extractMarkdownTitle(outputPreview);
  return toSourceRow(title ?? "", url);
}

export function uniqueWebHosts(rows: readonly WebSourceRow[], limit = WEB_SEARCH_PREVIEW_COUNT): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];
  for (const row of rows) {
    if (seen.has(row.displayHost)) {
      continue;
    }
    seen.add(row.displayHost);
    hosts.push(row.host);
    if (hosts.length >= limit) {
      break;
    }
  }
  return hosts;
}

export function siteBadgeColor(host: string): string {
  const key = stripWww(host).toLowerCase();
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash, 31) + key.charCodeAt(index);
  }
  return SITE_BADGE_COLORS[Math.abs(hash) % SITE_BADGE_COLORS.length] ?? "#3b82f6";
}

/** Google's public favicon image for a hostname. UI falls back to a hashed-color globe. */
export function siteFaviconSrc(host: string, size = 32): string | null {
  const trimmed = host.trim();
  if (!trimmed || /[^A-Za-z0-9.-]/.test(stripPort(trimmed))) {
    return null;
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(trimmed)}&sz=${size}`;
}

function toSourceRow(title: string, rawUrl: string): WebSourceRow | null {
  const parsed = parseHttpUrl(rawUrl);
  if (!parsed) {
    return null;
  }
  const displayHost = stripWww(parsed.hostname);
  const cleanedTitle = title.trim() || displayHost;
  return {
    title: cleanedTitle,
    url: parsed.href,
    host: parsed.hostname,
    displayHost,
  };
}

function extractJsonStringField(inputPreview: string, field: string): string | null {
  const trimmed = inputPreview.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const value = parsed[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  } catch {
    // Fall through to a quoted-field scan for truncated previews.
  }
  const match = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "u").exec(trimmed);
  const extracted = match?.[1];
  return extracted ? unescapeJsonString(extracted) : null;
}

function extractSourceLine(outputPreview: string): string | null {
  const match = /^Source:\s+(\S+)/mu.exec(outputPreview);
  return match?.[1] ?? null;
}

function extractMarkdownTitle(outputPreview: string): string | null {
  const match = /^#\s+(.+)$/mu.exec(outputPreview.trim());
  const title = match?.[1]?.trim();
  if (!title || /^https?:\/\//u.test(title)) {
    return null;
  }
  return title;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (parsed.username || parsed.password || !parsed.hostname) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function stripWww(host: string): string {
  return host.replace(/^www\./iu, "");
}

function stripPort(host: string): string {
  return host.replace(/:\d+$/u, "");
}

const JSON_ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

function unescapeJsonString(value: string): string {
  return value.replace(/\\(["\\/bfnrt])/gu, (_, ch: string) => JSON_ESCAPES[ch] ?? ch);
}
