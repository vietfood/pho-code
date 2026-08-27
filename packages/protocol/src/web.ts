export const WEB_SEARCH_PROVIDERS = ["duckduckgo", "bing", "brave", "mojeek", "jina", "mixed"] as const;
export type WebSearchProvider = (typeof WEB_SEARCH_PROVIDERS)[number];

export const WEB_SOURCE_PROVIDERS = ["duckduckgo", "bing", "brave", "mojeek", "jina", "http", "youtube"] as const;
export type WebSourceProvider = (typeof WEB_SOURCE_PROVIDERS)[number];

/** Bounded citation projected from web_search / fetch_content. Never includes headers or cookies. */
export interface WebSourceRecord {
  title: string;
  url: string;
  provider: WebSourceProvider;
  publishedAt?: string;
}

export const MAX_WEB_SEARCH_RESULTS = 8;
export const MAX_WEB_SEARCH_QUERY = 500;
export const MAX_WEB_EXTRACTED_CHARS = 100_000;
export const MAX_WEB_RESPONSE_BYTES = 5 * 1024 * 1024;
export const MAX_WEB_REDIRECTS = 3;
export const WEB_REQUEST_TIMEOUT_MS = 15_000;
export const MAX_WEB_CONCURRENT_REQUESTS = 2;

export function isWebSourceProvider(value: unknown): value is WebSourceProvider {
  return typeof value === "string" && (WEB_SOURCE_PROVIDERS as readonly string[]).includes(value);
}
