import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import {
  MAX_WEB_CONCURRENT_REQUESTS,
  MAX_WEB_EXTRACTED_CHARS,
  MAX_WEB_SEARCH_QUERY,
  MAX_WEB_SEARCH_RESULTS,
  type WebSearchProvider,
  type WebSourceRecord,
} from "@pho-code/protocol";
import {
  mergeSearchHits,
  searchEngineSpecs,
  summarizeSearchProviders,
  type RankedSearchHit,
  type WebSearchHit,
} from "./web-search-providers";
import { extractYouTubeContent, parseYouTubeVideoId } from "./web-youtube";
import {
  combineAbortSignals,
  fetchPublicHttpUrl,
  isPlainRecord,
  readBoundedResponseText,
  readString,
  validatePublicHttpUrl,
  WebResearchError,
  type DnsLookup,
  type WebPageRequest,
} from "./web-url";

export {
  BING_SEARCH_ENDPOINT,
  BRAVE_SEARCH_ENDPOINT,
  DUCKDUCKGO_HTML_ENDPOINT,
  DUCKDUCKGO_LITE_ENDPOINT,
  JINA_SEARCH_ORIGIN,
  MOJEEK_SEARCH_ENDPOINT,
  parseBingResults,
  parseBraveResults,
  parseDuckDuckGoResults,
  parseJinaSearchResults,
  parseMojeekResults,
} from "./web-search-providers";
export { parseYouTubeVideoId } from "./web-youtube";
export const JINA_READER_ORIGIN = "https://r.jina.ai";

const USER_AGENT = "Mozilla/5.0 (compatible; Pho-Code/1.2)";
const MIN_USEFUL_EXTRACT_CHARS = 160;
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

export type { WebSearchHit } from "./web-search-providers";

export interface WebSearchPage {
  provider: WebSearchProvider;
  sources: WebSourceRecord[];
  text: string;
}

export interface WebFetchPage {
  source: WebSourceRecord;
  text: string;
  contentType: string;
}

export type { WebPageRequest };

export interface WebResearchRuntimeOptions {
  fetchPage?: WebPageRequest;
  lookup?: DnsLookup;
}

export interface WebResearchRuntime {
  search(input: { query: string; signal?: AbortSignal }): Promise<WebSearchPage>;
  fetchContent(input: { url: string; signal?: AbortSignal }): Promise<WebFetchPage>;
  dispose(): Promise<void>;
}

export function createWebResearchRuntime(options: WebResearchRuntimeOptions = {}): WebResearchRuntime {
  const gate = createConcurrencyGate(MAX_WEB_CONCURRENT_REQUESTS);
  const inflight = new Set<AbortController>();
  let disposed = false;
  const fetchPage: WebPageRequest =
    options.fetchPage ??
    ((url, init, requestOptions) =>
      fetchPublicHttpUrl(url, init, {
        stage: requestOptions.stage,
        signal: requestOptions.signal,
        ...(options.lookup ? { lookup: options.lookup } : {}),
      }));

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
      return track(input.signal, (signal) => searchPublicWeb(input.query, signal, fetchPage, options.lookup));
    },
    fetchContent(input) {
      return track(input.signal, (signal) => fetchExtractedContent(input.url, signal, fetchPage));
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

async function searchPublicWeb(
  query: string,
  signal: AbortSignal,
  fetchPage: WebPageRequest,
  lookup: DnsLookup | undefined,
): Promise<WebSearchPage> {
  const trimmed = query.trim().slice(0, MAX_WEB_SEARCH_QUERY);
  if (trimmed === "") {
    throw new WebResearchError("web_search/query", "A search query is required.", false);
  }

  const settled = await Promise.allSettled(
    searchEngineSpecs().map(async (engine) => {
      const { response } = await fetchPage(
        engine.url(trimmed),
        {
          method: "GET",
          headers: {
            "User-Agent": USER_AGENT,
            ...engine.headers,
          },
          credentials: "omit",
        },
        { stage: "web_search/provider", signal },
      );
      assertOk(response, "web_search/provider", `${engine.provider} returned HTTP ${response.status}.`);
      const body = await readBoundedResponseText(response, "web_search/provider");
      return { provider: engine.provider, hits: engine.parse(body, MAX_WEB_SEARCH_RESULTS) };
    }),
  );

  if (signal.aborted) {
    throw new WebResearchError("web_search/provider", "The request was aborted.", false);
  }

  const groups: Array<{ provider: RankedSearchHit["provider"]; hits: WebSearchHit[] }> = [];
  const errors: string[] = [];
  let retryable = false;
  for (const result of settled) {
    if (result.status === "fulfilled") {
      groups.push(result.value);
      continue;
    }
    const reason = result.reason;
    if (reason instanceof WebResearchError) {
      errors.push(reason.message);
      retryable = retryable || reason.retryable;
    } else {
      errors.push(reason instanceof Error ? reason.message : String(reason));
      retryable = true;
    }
  }

  const merged = mergeSearchHits(groups, MAX_WEB_SEARCH_RESULTS);
  const page = await toSearchPage(merged, lookup);
  if (page.sources.length > 0) {
    return page;
  }
  throw new WebResearchError(
    "web_search/provider",
    errors.length > 0
      ? `No usable public search results. ${errors.slice(0, 3).join(" ")}`
      : "No usable public search results.",
    retryable || errors.length > 0,
  );
}

async function toSearchPage(hits: RankedSearchHit[], lookup: DnsLookup | undefined): Promise<WebSearchPage> {
  const sources: WebSourceRecord[] = [];
  const lines: string[] = [];
  for (const hit of hits) {
    try {
      const safe = await validatePublicHttpUrl(hit.url, {
        stage: "web_search/result",
        ...(lookup ? { lookup } : {}),
      });
      const url = safe.toString();
      sources.push({ title: hit.title, url, provider: hit.provider });
      lines.push(
        hit.snippet
          ? `${sources.length}. ${hit.title}\n   ${url}\n   ${hit.snippet}\n   [${hit.provider}]`
          : `${sources.length}. ${hit.title}\n   ${url}\n   [${hit.provider}]`,
      );
    } catch {
      continue;
    }
    if (sources.length >= MAX_WEB_SEARCH_RESULTS) {
      break;
    }
  }
  const provider = summarizeSearchProviders(sources.map((source) => source.provider));
  return {
    provider,
    sources,
    text: sources.length === 0 ? "" : `Search results (${provider}):\n\n${lines.join("\n\n")}`,
  };
}

async function fetchExtractedContent(
  url: string,
  signal: AbortSignal,
  fetchPage: WebPageRequest,
): Promise<WebFetchPage> {
  if (parseYouTubeVideoId(url)) {
    try {
      const page = await extractYouTubeContent(url, signal, fetchPage);
      return {
        source: { title: page.title, url: page.url, provider: "youtube" },
        text: page.text,
        contentType: "text/markdown",
      };
    } catch (error) {
      if (error instanceof WebResearchError && !error.retryable) {
        throw error;
      }
    }
  }

  const { response, finalUrl } = await fetchPage(
    url,
    {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain,text/markdown,application/json;q=0.9,*/*;q=0.1",
        "User-Agent": USER_AGENT,
      },
      credentials: "omit",
    },
    { stage: "fetch_content/ssrf", signal },
  );
  assertOk(response, "fetch_content/http", `Fetch returned HTTP ${response.status} for ${finalUrl}.`);
  const contentType =
    (response.headers.get("content-type") ?? "application/octet-stream").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!isAllowedContentType(contentType)) {
    throw new WebResearchError(
      "fetch_content/mime",
      `Unsupported content type: ${contentType || "unknown"}.`,
      false,
    );
  }
  const body = await readBoundedResponseText(response, "fetch_content/body");
  const extracted = extractReadableText(body, contentType, finalUrl);
  if (extracted && isUsefulExtract(extracted.text)) {
    return toFetchPage(extracted, finalUrl, contentType, "http");
  }
  if (isHtmlContentType(contentType)) {
    try {
      return await fetchJinaReader(finalUrl, signal, fetchPage);
    } catch (error) {
      if (extracted) {
        return toFetchPage(extracted, finalUrl, contentType, "http");
      }
      if (error instanceof WebResearchError) {
        throw error;
      }
      throw extractFailure();
    }
  }
  if (extracted) {
    return toFetchPage(extracted, finalUrl, contentType, "http");
  }
  throw extractFailure();
}

async function fetchJinaReader(
  targetUrl: string,
  signal: AbortSignal,
  fetchPage: WebPageRequest,
): Promise<WebFetchPage> {
  const endpoint = `${JINA_READER_ORIGIN}/${encodeURI(targetUrl)}`;
  const { response } = await fetchPage(
    endpoint,
    {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain;q=0.8",
        "User-Agent": USER_AGENT,
        "X-Retain-Images": "none",
        "X-Timeout": "15",
      },
      credentials: "omit",
    },
    { stage: "fetch_content/jina", signal },
  );
  assertOk(response, "fetch_content/jina", `Jina Reader returned HTTP ${response.status} for ${targetUrl}.`);
  const body = await readBoundedResponseText(response, "fetch_content/jina");
  const extracted = parseJinaReaderBody(body, targetUrl);
  if (!extracted || extracted.text.trim() === "") {
    throw new WebResearchError("fetch_content/jina", "Jina Reader returned empty content.", true);
  }
  return toFetchPage(extracted, targetUrl, "text/markdown", "jina");
}

export function extractReadableText(
  body: string,
  contentType: string,
  url: string,
): { title: string; text: string } | null {
  if (isHtmlContentType(contentType)) {
    const parsed = parseHTML(body);
    const documentTitle = parsed.document.title?.trim() ?? "";
    try {
      const reader = new Readability(parsed.document as never);
      const article = reader.parse();
      if (article && typeof article.content === "string") {
        const markdown = turndown.turndown(article.content).trim();
        if (markdown !== "") {
          const title = (article.title || documentTitle || url).trim();
          return { title, text: formatExtractedPage(title, url, markdown) };
        }
      }
    } catch {
      // Fall through to structural extraction on a fresh parse.
    }
    return extractStructuralHtml(parseHTML(body).document, documentTitle, url);
  }
  const title = url;
  const trimmed = body.trim();
  return trimmed === "" ? null : { title, text: `Source: ${url}\n\n${trimmed}` };
}

function extractStructuralHtml(
  document: ReturnType<typeof parseHTML>["document"],
  documentTitle: string,
  url: string,
): { title: string; text: string } | null {
  for (const node of document.querySelectorAll("script, style, noscript, svg")) {
    node.remove();
  }
  const ogTitle = metaContent(document, "og:title") ?? metaContent(document, "twitter:title");
  const description =
    metaContent(document, "description") ??
    metaContent(document, "og:description") ??
    metaContent(document, "twitter:description") ??
    "";
  const title = (ogTitle || documentTitle || url).trim();
  const main = document.querySelector("article, main, [role='main']") ?? document.body;
  const raw = main?.textContent?.replace(/\s+/gu, " ").trim() ?? "";
  const parts = [description, raw].filter((part) => part !== "");
  if (parts.length === 0) {
    return null;
  }
  return { title, text: formatExtractedPage(title, url, parts.join("\n\n")) };
}

function parseJinaReaderBody(body: string, url: string): { title: string; text: string } | null {
  const trimmed = body.trim();
  if (trimmed === "") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const record = jinaReaderRecord(parsed);
    const content = readString(record, ["content", "text", "markdown"]) ?? "";
    const title = readString(record, ["title", "name"]) ?? url;
    if (content.trim() !== "") {
      return { title, text: formatExtractedPage(title, url, content.trim()) };
    }
  } catch {
    // Plain markdown from Jina Reader.
  }
  return { title: url, text: formatExtractedPage(url, url, trimmed) };
}

function toFetchPage(
  extracted: { title: string; text: string },
  url: string,
  contentType: string,
  provider: WebSourceRecord["provider"],
): WebFetchPage {
  return {
    source: { title: extracted.title, url, provider },
    text: extracted.text.slice(0, MAX_WEB_EXTRACTED_CHARS),
    contentType,
  };
}

function formatExtractedPage(title: string, url: string, body: string): string {
  return `# ${title}\n\nSource: ${url}\n\n${body}`.trim();
}

function isUsefulExtract(text: string): boolean {
  const body = text.replace(/^# .+\n\nSource: \S+\n\n/u, "").trim();
  if (body.length < MIN_USEFUL_EXTRACT_CHARS) {
    return false;
  }
  if (body.length < 400 && /enable javascript|checking your browser|just a moment|cookie (consent|settings|policy)|cf-browser/iu.test(body)) {
    return false;
  }
  return true;
}

function isAllowedContentType(contentType: string): boolean {
  return ALLOWED_FETCH_TYPES.some((allowed) => contentType === allowed || contentType.startsWith(`${allowed}+`));
}

function isHtmlContentType(contentType: string): boolean {
  return contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
}

function assertOk(response: Response, stage: string, message: string): void {
  if (!response.ok) {
    throw new WebResearchError(stage, message, response.status >= 500 || response.status === 429);
  }
}

function extractFailure(): WebResearchError {
  return new WebResearchError("fetch_content/extract", "Could not extract readable content from that page.", false);
}

function jinaReaderRecord(parsed: unknown): Record<string, unknown> {
  if (!isPlainRecord(parsed)) {
    return {};
  }
  if (isPlainRecord(parsed.data)) {
    return parsed.data;
  }
  return parsed;
}

function metaContent(document: ReturnType<typeof parseHTML>["document"], name: string): string | undefined {
  const property = document.querySelector(`meta[property="${name}"]`)?.getAttribute("content")?.trim();
  if (property) {
    return property;
  }
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content")?.trim() || undefined;
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
