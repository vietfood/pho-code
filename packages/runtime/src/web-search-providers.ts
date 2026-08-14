import { parseHTML } from "linkedom";
import { MAX_WEB_SEARCH_RESULTS, type WebSearchProvider, type WebSourceProvider } from "@pho-code/protocol";

export const DUCKDUCKGO_HTML_ENDPOINT = "https://html.duckduckgo.com/html/";
export const DUCKDUCKGO_LITE_ENDPOINT = "https://lite.duckduckgo.com/lite/";
export const BING_SEARCH_ENDPOINT = "https://www.bing.com/search";
export const BRAVE_SEARCH_ENDPOINT = "https://search.brave.com/search";
export const MOJEEK_SEARCH_ENDPOINT = "https://www.mojeek.com/search";
export const JINA_SEARCH_ORIGIN = "https://s.jina.ai";

export type WebEngineProvider = Exclude<WebSearchProvider, "mixed">;

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface RankedSearchHit extends WebSearchHit {
  provider: WebEngineProvider;
}

export interface SearchEngineSpec {
  provider: WebEngineProvider;
  url: (query: string) => string;
  parse: (body: string, limit: number) => WebSearchHit[];
  headers?: Record<string, string>;
}

const HTML_HEADERS = {
  Accept: "text/html",
  "Accept-Language": "en",
} as const;

export function searchEngineSpecs(): SearchEngineSpec[] {
  return [
    {
      provider: "duckduckgo",
      url: (query) => withQuery(DUCKDUCKGO_HTML_ENDPOINT, query),
      parse: parseDuckDuckGoResults,
      headers: HTML_HEADERS,
    },
    {
      provider: "duckduckgo",
      url: (query) => withQuery(DUCKDUCKGO_LITE_ENDPOINT, query),
      parse: parseDuckDuckGoResults,
      headers: HTML_HEADERS,
    },
    {
      provider: "bing",
      url: (query) => withQuery(BING_SEARCH_ENDPOINT, query),
      parse: parseBingResults,
      headers: HTML_HEADERS,
    },
    {
      provider: "brave",
      url: (query) => withQuery(BRAVE_SEARCH_ENDPOINT, query),
      parse: parseBraveResults,
      headers: HTML_HEADERS,
    },
    {
      provider: "mojeek",
      url: (query) => withQuery(MOJEEK_SEARCH_ENDPOINT, query),
      parse: parseMojeekResults,
      headers: HTML_HEADERS,
    },
    {
      provider: "jina",
      url: (query) => `${JINA_SEARCH_ORIGIN}/${encodeURIComponent(query)}`,
      parse: parseJinaSearchResults,
      headers: {
        Accept: "application/json, text/plain;q=0.8",
        "X-Respond-With": "no-content",
      },
    },
  ];
}

function withQuery(endpoint: string, query: string): string {
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  return url.toString();
}

// DuckDuckGo HTML result parsing adapted from pi-web-access 0.22.0 duckduckgo.ts
// (MIT, Nico Bailon). Ads skipped; uddg redirect URLs decoded. Lite table rows are
// an application-owned addition because the classic `.result` markup is often absent.
export function parseDuckDuckGoResults(
  html: string,
  limit = MAX_WEB_SEARCH_RESULTS,
): WebSearchHit[] {
  const { document } = parseHTML(html);
  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();

  const push = (title: string, href: string, snippet: string) => {
    const url = decodeDuckDuckGoUrl(href);
    if (!title || !url || seen.has(url) || isBlockedHost(url, ["duckduckgo.com", "duck.com"])) {
      return;
    }
    seen.add(url);
    hits.push({ title, url, snippet });
  };

  for (const container of document.querySelectorAll(".result, .web-result")) {
    if (container.classList.contains("result--ad") || container.classList.contains("web-result--ad")) {
      continue;
    }
    const anchor = container.querySelector(".result__a");
    const title = anchor?.textContent?.trim() ?? "";
    const href = anchor?.getAttribute("href")?.trim() ?? "";
    const snippet = container.querySelector(".result__snippet")?.textContent?.trim() ?? "";
    push(title, href, snippet);
    if (hits.length >= limit) {
      return hits;
    }
  }

  for (const row of document.querySelectorAll("tr.result-link")) {
    const anchor = row.querySelector("a[href]");
    const title = anchor?.textContent?.trim() ?? "";
    const href = anchor?.getAttribute("href")?.trim() ?? "";
    const snippetRow = row.nextElementSibling;
    const snippet =
      snippetRow?.classList.contains("result-snippet") || snippetRow?.querySelector(".result-snippet")
        ? (snippetRow.textContent?.trim() ?? "")
        : "";
    push(title, href, snippet);
    if (hits.length >= limit) {
      return hits;
    }
  }

  if (hits.length === 0) {
    for (const anchor of document.querySelectorAll("a.result-link[href], a.result__a[href]")) {
      const title = anchor.textContent?.trim() ?? "";
      const href = anchor.getAttribute("href")?.trim() ?? "";
      push(title, href, "");
      if (hits.length >= limit) {
        break;
      }
    }
  }

  return hits.slice(0, limit);
}

export function parseBingResults(html: string, limit = MAX_WEB_SEARCH_RESULTS): WebSearchHit[] {
  const { document } = parseHTML(html);
  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();
  for (const item of document.querySelectorAll("li.b_algo")) {
    const anchor = item.querySelector("h2 a[href], a[href]");
    const title = anchor?.textContent?.trim() ?? "";
    const href = resolveBingUrl(
      anchor?.getAttribute("href")?.trim() ?? "",
      item.querySelector("cite")?.textContent?.trim() ?? "",
    );
    const snippet = item.querySelector(".b_caption p, p")?.textContent?.trim() ?? "";
    if (!title || !href || seen.has(href) || isBlockedHost(href, ["bing.com", "microsoft.com", "msn.com"])) {
      continue;
    }
    seen.add(href);
    hits.push({ title, url: href, snippet });
    if (hits.length >= limit) {
      break;
    }
  }
  return hits;
}

export function parseBraveResults(html: string, limit = MAX_WEB_SEARCH_RESULTS): WebSearchHit[] {
  const { document } = parseHTML(html);
  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();
  const cards = document.querySelectorAll(
    ".snippet[data-type='web'], .snippet, .organic-result, [data-type='web']",
  );
  for (const card of cards) {
    const anchor = card.querySelector("a.heading-serpresult[href], a.result-header[href], a[href]");
    const title = anchor?.textContent?.trim() ?? "";
    const href = absoluteHttpUrl(anchor?.getAttribute("href")?.trim() ?? "", BRAVE_SEARCH_ENDPOINT);
    const snippet =
      card.querySelector(".snippet-description, .snippet-content, p")?.textContent?.trim() ?? "";
    if (!title || !href || seen.has(href) || isBlockedHost(href, ["brave.com", "search.brave.com"])) {
      continue;
    }
    seen.add(href);
    hits.push({ title, url: href, snippet });
    if (hits.length >= limit) {
      break;
    }
  }
  return hits;
}

export function parseMojeekResults(html: string, limit = MAX_WEB_SEARCH_RESULTS): WebSearchHit[] {
  const { document } = parseHTML(html);
  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();
  for (const item of document.querySelectorAll("ul.results-standard li, .results-standard li")) {
    const anchor = item.querySelector("a.title[href], a.ob[href], a[href]");
    if (!anchor) {
      continue;
    }
    const title = anchor.textContent?.trim() ?? "";
    const href = absoluteHttpUrl(anchor.getAttribute("href")?.trim() ?? "", MOJEEK_SEARCH_ENDPOINT);
    const snippet = item.querySelector("p.s, p.snippet, p")?.textContent?.trim() ?? "";
    if (!title || !href || seen.has(href) || isBlockedHost(href, ["mojeek.com"])) {
      continue;
    }
    seen.add(href);
    hits.push({ title, url: href, snippet });
    if (hits.length >= limit) {
      break;
    }
  }
  return hits;
}

export function parseJinaSearchResults(body: string, limit = MAX_WEB_SEARCH_RESULTS): WebSearchHit[] {
  const trimmed = body.trim();
  if (trimmed === "") {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const rows = jinaSearchRows(parsed);
    const hits: WebSearchHit[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (hits.length >= limit) {
        break;
      }
      const title = readString(row, ["title", "name"]) ?? "";
      const url = readString(row, ["url", "link", "href"]) ?? "";
      const snippet = readString(row, ["description", "snippet", "content"]) ?? "";
      if (!title || !url || seen.has(url) || !isHttpUrl(url)) {
        continue;
      }
      seen.add(url);
      hits.push({ title, url, snippet });
    }
    if (hits.length > 0) {
      return hits;
    }
  } catch {
    // Fall through to markdown link parsing.
  }
  return parseMarkdownSearchHits(trimmed, limit);
}

export function mergeSearchHits(groups: Array<{ provider: WebEngineProvider; hits: WebSearchHit[] }>, limit = MAX_WEB_SEARCH_RESULTS): RankedSearchHit[] {
  const merged: RankedSearchHit[] = [];
  const seen = new Set<string>();
  const maxRank = Math.max(0, ...groups.map((group) => group.hits.length));
  for (let rank = 0; rank < maxRank; rank += 1) {
    for (const group of groups) {
      const hit = group.hits[rank];
      if (!hit) {
        continue;
      }
      const key = canonicalizeSearchUrl(hit.url);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push({ ...hit, provider: group.provider });
      if (merged.length >= limit) {
        return merged;
      }
    }
  }
  return merged;
}

export function summarizeSearchProviders(providers: readonly WebSourceProvider[]): WebSearchProvider {
  const unique = [...new Set(providers)];
  return unique.length === 1 && unique[0] !== "http" && unique[0] !== "youtube"
    ? (unique[0] as WebEngineProvider)
    : "mixed";
}

function decodeDuckDuckGoUrl(href: string): string | null {
  try {
    const link = new URL(href, DUCKDUCKGO_HTML_ENDPOINT);
    const destination = link.searchParams.get("uddg") ?? link.href;
    const url = new URL(destination);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function resolveBingUrl(href: string, cite: string): string | null {
  const direct = absoluteHttpUrl(href, BING_SEARCH_ENDPOINT);
  if (direct && !isBlockedHost(direct, ["bing.com", "microsoft.com", "msn.com"])) {
    return direct;
  }
  const trimmed = cite.replace(/\s+/gu, "").replace(/^›/u, "");
  if (trimmed === "") {
    return null;
  }
  try {
    const fromCite = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return fromCite.protocol === "http:" || fromCite.protocol === "https:" ? fromCite.href : null;
  } catch {
    return null;
  }
}

function absoluteHttpUrl(href: string, base: string): string | null {
  if (href === "") {
    return null;
  }
  try {
    const url = new URL(href, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function isBlockedHost(url: string, hosts: readonly string[]): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return true;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function canonicalizeSearchUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./u, "");
    if (url.pathname.endsWith("/") && url.pathname !== "/") {
      url.pathname = url.pathname.slice(0, -1);
    }
    const params = new URLSearchParams(url.search);
    for (const key of [...params.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || key.toLowerCase() === "fbclid") {
        params.delete(key);
      }
    }
    url.search = params.toString();
    return url.toString();
  } catch {
    return value;
  }
}

function jinaSearchRows(parsed: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(parsed)) {
    return parsed.filter(isPlainRecord);
  }
  if (!isPlainRecord(parsed)) {
    return [];
  }
  if (Array.isArray(parsed.data)) {
    return parsed.data.filter(isPlainRecord);
  }
  if (isPlainRecord(parsed.data) && Array.isArray(parsed.data.results)) {
    return parsed.data.results.filter(isPlainRecord);
  }
  if (Array.isArray(parsed.results)) {
    return parsed.results.filter(isPlainRecord);
  }
  return [];
}

function parseMarkdownSearchHits(body: string, limit: number): WebSearchHit[] {
  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gu;
  for (const match of body.matchAll(pattern)) {
    const title = match[1]?.trim() ?? "";
    const url = match[2]?.trim() ?? "";
    if (!title || !url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    hits.push({ title, url, snippet: "" });
    if (hits.length >= limit) {
      break;
    }
  }
  return hits;
}

function readString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
