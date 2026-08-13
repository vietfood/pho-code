import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import {
  MAX_WEB_CONCURRENT_REQUESTS,
  MAX_WEB_EXTRACTED_CHARS,
  MAX_WEB_RESPONSE_BYTES,
  MAX_WEB_SEARCH_QUERY,
  MAX_WEB_SEARCH_RESULTS,
  type WebSourceRecord,
} from "@pho-code/protocol";
import {
  combineAbortSignals,
  fetchPublicHttpUrl,
  validatePublicHttpUrl,
  WebResearchError,
} from "./web-url";

const SEARCH_ENDPOINT = "https://html.duckduckgo.com/html/";
const USER_AGENT = "Pho-Code/1.0 (personal desktop harness)";
const ALLOWED_FETCH_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/markdown",
  "application/json",
  "application/xml",
  "text/xml",
];

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

export interface WebSearchPage {
  sources: WebSourceRecord[];
  text: string;
}

export interface WebFetchPage {
  source: WebSourceRecord;
  text: string;
  contentType: string;
}

export interface WebResearchRuntime {
  search(input: { query: string; signal?: AbortSignal }): Promise<WebSearchPage>;
  fetchContent(input: { url: string; signal?: AbortSignal }): Promise<WebFetchPage>;
  diagnostics(): Array<{ type: "warning" | "error"; message: string; path: string }>;
  dispose(): Promise<void>;
}

export function createWebResearchRuntime(): WebResearchRuntime {
  const gate = createConcurrencyGate(MAX_WEB_CONCURRENT_REQUESTS);
  const inflight = new Set<AbortController>();
  let disposed = false;

  function track<T>(signal: AbortSignal | undefined, run: (combined: AbortSignal) => Promise<T>): Promise<T> {
    if (disposed) {
      throw new WebResearchError("web", "Web research is disposed.", false);
    }
    const local = new AbortController();
    inflight.add(local);
    const combined = combineAbortSignals(signal ? AbortSignal.any([signal, local.signal]) : local.signal);
    return gate
      .run(() => run(combined))
      .finally(() => {
        inflight.delete(local);
      });
  }

  return {
    search(input) {
      return track(input.signal, (signal) => searchDuckDuckGo(input.query, signal));
    },
    fetchContent(input) {
      return track(input.signal, (signal) => fetchExtractedContent(input.url, signal));
    },
    diagnostics() {
      return [];
    },
    async dispose() {
      disposed = true;
      for (const controller of inflight) {
        controller.abort();
      }
      inflight.clear();
    },
  };
}

// DuckDuckGo HTML result parsing adapted from pi-web-access 0.22.0 duckduckgo.ts
// (MIT, Nico Bailon). Ads skipped; uddg redirect URLs decoded.
export function parseDuckDuckGoResults(
  html: string,
  limit = MAX_WEB_SEARCH_RESULTS,
): Array<{ title: string; url: string; snippet: string }> {
  const { document } = parseHTML(html);
  const hits: Array<{ title: string; url: string; snippet: string }> = [];
  for (const container of document.querySelectorAll(".result")) {
    if (container.classList.contains("result--ad")) {
      continue;
    }
    const anchor = container.querySelector(".result__a");
    const title = anchor?.textContent?.trim() ?? "";
    const href = anchor?.getAttribute("href")?.trim() ?? "";
    const url = href ? decodeDuckDuckGoUrl(href) : null;
    if (!title || !url) {
      continue;
    }
    const snippet = container.querySelector(".result__snippet")?.textContent?.trim() ?? "";
    hits.push({ title, url, snippet });
    if (hits.length >= limit) {
      break;
    }
  }
  return hits;
}

async function searchDuckDuckGo(query: string, signal: AbortSignal): Promise<WebSearchPage> {
  const trimmed = query.trim().slice(0, MAX_WEB_SEARCH_QUERY);
  if (trimmed === "") {
    throw new WebResearchError("web_search/query", "A search query is required.", false);
  }
  const endpoint = new URL(SEARCH_ENDPOINT);
  endpoint.searchParams.set("q", trimmed);
  const { response } = await fetchPublicHttpUrl(
    endpoint.toString(),
    {
      method: "GET",
      headers: {
        Accept: "text/html",
        "User-Agent": USER_AGENT,
      },
      credentials: "omit",
      signal,
    },
    { stage: "web_search/provider", signal },
  );
  if (!response.ok) {
    throw new WebResearchError(
      "web_search/provider",
      `DuckDuckGo returned HTTP ${response.status}.`,
      response.status >= 500 || response.status === 429,
    );
  }
  const html = await readLimitedText(response, "web_search/provider");
  const sources: WebSourceRecord[] = [];
  const lines: string[] = [];
  for (const hit of parseDuckDuckGoResults(html)) {
    try {
      const safe = await validatePublicHttpUrl(hit.url, { stage: "web_search/result" });
      const url = safe.toString();
      sources.push({ title: hit.title, url, provider: "duckduckgo" });
      lines.push(hit.snippet ? `${sources.length}. ${hit.title}\n   ${url}\n   ${hit.snippet}` : `${sources.length}. ${hit.title}\n   ${url}`);
    } catch {
      continue;
    }
    if (sources.length >= MAX_WEB_SEARCH_RESULTS) {
      break;
    }
  }
  if (sources.length === 0) {
    throw new WebResearchError("web_search/provider", "DuckDuckGo returned no usable public results.", true);
  }
  return { sources, text: lines.join("\n\n") };
}

async function fetchExtractedContent(url: string, signal: AbortSignal): Promise<WebFetchPage> {
  const { response, finalUrl } = await fetchPublicHttpUrl(
    url,
    {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain,text/markdown,application/json;q=0.9,*/*;q=0.1",
        "User-Agent": USER_AGENT,
      },
      credentials: "omit",
      signal,
    },
    { stage: "fetch_content/ssrf", signal },
  );
  if (!response.ok) {
    throw new WebResearchError(
      "fetch_content/http",
      `Fetch returned HTTP ${response.status} for ${finalUrl}.`,
      response.status >= 500 || response.status === 429,
    );
  }
  const contentType = (response.headers.get("content-type") ?? "application/octet-stream").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!isAllowedContentType(contentType)) {
    throw new WebResearchError(
      "fetch_content/mime",
      `Unsupported content type: ${contentType || "unknown"}.`,
      false,
    );
  }
  const body = await readLimitedText(response, "fetch_content/body");
  const extracted = extractReadableText(body, contentType, finalUrl);
  const clipped = extracted.text.slice(0, MAX_WEB_EXTRACTED_CHARS);
  return {
    source: { title: extracted.title, url: finalUrl, provider: "http" },
    text: clipped,
    contentType,
  };
}

function extractReadableText(
  body: string,
  contentType: string,
  url: string,
): { title: string; text: string } {
  if (
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml")
  ) {
    const { document } = parseHTML(body);
    const documentTitle = document.title?.trim() ?? "";
    const reader = new Readability(document as never);
    const article = reader.parse();
    if (!article || typeof article.content !== "string") {
      throw new WebResearchError(
        "fetch_content/extract",
        "Could not extract readable content from that page.",
        false,
      );
    }
    const markdown = turndown.turndown(article.content).trim();
    if (markdown === "") {
      throw new WebResearchError(
        "fetch_content/extract",
        "Extracted content was empty.",
        false,
      );
    }
    const title = (article.title || documentTitle || url).trim();
    return { title, text: `# ${title}\n\nSource: ${url}\n\n${markdown}` };
  }
  const title = url;
  return { title, text: `Source: ${url}\n\n${body.trim()}` };
}

function isAllowedContentType(contentType: string): boolean {
  return ALLOWED_FETCH_TYPES.some((allowed) => contentType === allowed || contentType.startsWith(`${allowed}+`));
}

async function readLimitedText(response: Response, stage: string): Promise<string> {
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    total += next.value.byteLength;
    if (total > MAX_WEB_RESPONSE_BYTES) {
      await reader.cancel();
      throw new WebResearchError(stage, "Response exceeded the 5 MiB size limit.", false);
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function decodeDuckDuckGoUrl(href: string): string | null {
  try {
    const link = new URL(href, SEARCH_ENDPOINT);
    const destination = link.searchParams.get("uddg") ?? link.href;
    const url = new URL(destination);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function createConcurrencyGate(limit: number): { run<T>(fn: () => Promise<T>): Promise<T> } {
  let active = 0;
  const waiters: Array<() => void> = [];
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (active >= limit) {
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
      }
      active += 1;
      try {
        return await fn();
      } finally {
        active -= 1;
        waiters.shift()?.();
      }
    },
  };
}
