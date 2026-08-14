import { describe, expect, test } from "bun:test";
import {
  BING_SEARCH_ENDPOINT,
  BRAVE_SEARCH_ENDPOINT,
  createWebResearchRuntime,
  DUCKDUCKGO_HTML_ENDPOINT,
  DUCKDUCKGO_LITE_ENDPOINT,
  extractReadableText,
  JINA_READER_ORIGIN,
  JINA_SEARCH_ORIGIN,
  MOJEEK_SEARCH_ENDPOINT,
  parseBingResults,
  parseBraveResults,
  parseJinaSearchResults,
  parseMojeekResults,
  parseYouTubeVideoId,
} from "../src/web-client";
import { mergeSearchHits } from "../src/web-search-providers";
import type { LookupAddress } from "../src/web-url";

const PUBLIC_LOOKUP = async (): Promise<LookupAddress[]> => [{ address: "93.184.216.34", family: 4 }];

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HTML search parsers", () => {
  test("reads Bing b_algo results and cite fallbacks", () => {
    expect(
      parseBingResults(`
        <ol id="b_results">
          <li class="b_algo">
            <h2><a href="https://example.com/docs">Example docs</a></h2>
            <div class="b_caption"><p>Public documentation</p></div>
          </li>
          <li class="b_algo">
            <h2><a href="https://www.bing.com/ck/a?u=x">Tracked</a></h2>
            <cite>example.com/cu</cite>
            <p>SO(3) kernels</p>
          </li>
        </ol>
      `),
    ).toEqual([
      { title: "Example docs", url: "https://example.com/docs", snippet: "Public documentation" },
      { title: "Tracked", url: "https://example.com/cu", snippet: "SO(3) kernels" },
    ]);
  });

  test("reads Brave snippet cards", () => {
    expect(
      parseBraveResults(`
        <div class="snippet" data-type="web">
          <a class="heading-serpresult" href="https://example.com/cu">cuEquivariance</a>
          <p class="snippet-description">NVIDIA kernels</p>
        </div>
      `),
    ).toEqual([{ title: "cuEquivariance", url: "https://example.com/cu", snippet: "NVIDIA kernels" }]);
  });

  test("reads Mojeek standard results", () => {
    expect(
      parseMojeekResults(`
        <ul class="results-standard">
          <li>
            <a class="ob" href="https://example.com/nim">Boltz-2</a>
            <p class="s">NVIDIA NIM</p>
          </li>
        </ul>
      `),
    ).toEqual([{ title: "Boltz-2", url: "https://example.com/nim", snippet: "NVIDIA NIM" }]);
  });
});

describe("Jina search parse", () => {
  test("reads JSON result rows", () => {
    expect(
      parseJinaSearchResults(
        JSON.stringify({
          data: [
            { title: "Boltz-2", url: "https://example.com/boltz", description: "NIM page" },
            { title: "Skip", url: "not-a-url" },
          ],
        }),
      ),
    ).toEqual([{ title: "Boltz-2", url: "https://example.com/boltz", snippet: "NIM page" }]);
  });
});

describe("search merge", () => {
  test("round-robins unique URLs across providers", () => {
    expect(
      mergeSearchHits(
        [
          {
            provider: "duckduckgo",
            hits: [
              { title: "A", url: "https://example.com/a", snippet: "" },
              { title: "B", url: "https://example.com/b", snippet: "" },
            ],
          },
          {
            provider: "bing",
            hits: [
              { title: "C", url: "https://example.com/c", snippet: "" },
              { title: "A dup", url: "https://www.example.com/a", snippet: "" },
            ],
          },
        ],
        3,
      ),
    ).toEqual([
      { title: "A", url: "https://example.com/a", snippet: "", provider: "duckduckgo" },
      { title: "C", url: "https://example.com/c", snippet: "", provider: "bing" },
      { title: "B", url: "https://example.com/b", snippet: "", provider: "duckduckgo" },
    ]);
  });
});

describe("local HTML extract", () => {
  test("extracts a titled article locally", () => {
    const filler = "NVIDIA publishes Boltz-2 as a hosted NIM with model cards, licensing, and API notes. ".repeat(4);
    const extracted = extractReadableText(
      `<html><head><title>Boltz-2</title><meta name="description" content="NIM overview"></head>
       <body><main><p>${filler}</p></main></body></html>`,
      "text/html",
      "https://example.com/boltz",
    );
    expect(extracted?.title).toBe("Boltz-2");
    expect(extracted?.text).toContain("hosted NIM");
  });
});

describe("web research cascade", () => {
  test("fans out across search engines and merges surviving hits", async () => {
    const requested: string[] = [];
    const web = createWebResearchRuntime({
      lookup: PUBLIC_LOOKUP,
      fetchPage: async (url) => {
        requested.push(url);
        if (url.startsWith(DUCKDUCKGO_HTML_ENDPOINT)) {
          return {
            response: htmlResponse(`
              <div class="result">
                <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">Example docs</a>
                <a class="result__snippet">Public documentation</a>
              </div>
            `),
            finalUrl: url,
          };
        }
        if (url.startsWith(BING_SEARCH_ENDPOINT)) {
          return {
            response: htmlResponse(`
              <li class="b_algo">
                <h2><a href="https://example.com/bing">Bing hit</a></h2>
                <p>From Bing</p>
              </li>
            `),
            finalUrl: url,
          };
        }
        if (url.startsWith(JINA_SEARCH_ORIGIN)) {
          return {
            response: jsonResponse({
              data: [{ title: "Jina hit", url: "https://example.com/jina", description: "From Jina" }],
            }),
            finalUrl: url,
          };
        }
        return { response: htmlResponse("<html><body>no results</body></html>"), finalUrl: url };
      },
    });
    const page = await web.search({ query: "cuEquivariance NVIDIA" });
    expect(page.provider).toBe("mixed");
    expect(page.sources.map((source) => source.provider).sort()).toEqual(["bing", "duckduckgo", "jina"]);
    expect(requested.some((url) => url.startsWith(DUCKDUCKGO_HTML_ENDPOINT))).toBe(true);
    expect(requested.some((url) => url.startsWith(DUCKDUCKGO_LITE_ENDPOINT))).toBe(true);
    expect(requested.some((url) => url.startsWith(BING_SEARCH_ENDPOINT))).toBe(true);
    expect(requested.some((url) => url.startsWith(BRAVE_SEARCH_ENDPOINT))).toBe(true);
    expect(requested.some((url) => url.startsWith(MOJEEK_SEARCH_ENDPOINT))).toBe(true);
    expect(requested.some((url) => url.startsWith(JINA_SEARCH_ORIGIN))).toBe(true);
  });

  test("keeps a single provider label when only one engine hits", async () => {
    const web = createWebResearchRuntime({
      lookup: PUBLIC_LOOKUP,
      fetchPage: async (url) => {
        if (url.startsWith(BING_SEARCH_ENDPOINT)) {
          return {
            response: htmlResponse(`
              <li class="b_algo">
                <h2><a href="https://example.com/only">Only Bing</a></h2>
                <p>Survived</p>
              </li>
            `),
            finalUrl: url,
          };
        }
        return { response: htmlResponse("<html><body>no results</body></html>"), finalUrl: url };
      },
    });
    const page = await web.search({ query: "only bing" });
    expect(page.provider).toBe("bing");
    expect(page.sources).toEqual([{ title: "Only Bing", url: "https://example.com/only", provider: "bing" }]);
  });

  test("retries thin SPA HTML through Jina Reader", async () => {
    const requested: string[] = [];
    const web = createWebResearchRuntime({
      lookup: PUBLIC_LOOKUP,
      fetchPage: async (url) => {
        requested.push(url);
        if (url.startsWith(JINA_READER_ORIGIN)) {
          return {
            response: jsonResponse({
              data: { title: "Boltz-2", content: "Boltz-2 is available as an NVIDIA NIM with weights and an API." },
            }),
            finalUrl: url,
          };
        }
        return {
          response: htmlResponse(`<html><head><title>App</title></head><body><div id="root"></div></body></html>`),
          finalUrl: "https://example.com/boltz2",
        };
      },
    });
    const page = await web.fetchContent({ url: "https://example.com/boltz2" });
    expect(page.source).toEqual({
      title: "Boltz-2",
      url: "https://example.com/boltz2",
      provider: "jina",
    });
    expect(page.text).toContain("NVIDIA NIM");
    expect(requested.some((url) => url.startsWith(JINA_READER_ORIGIN))).toBe(true);
  });

  test("does not call Jina Reader when local extraction is useful", async () => {
    const requested: string[] = [];
    const filler = "This article explains how Pho Code fetches public HTML and converts it to markdown. ".repeat(5);
    const web = createWebResearchRuntime({
      lookup: PUBLIC_LOOKUP,
      fetchPage: async (url) => {
        requested.push(url);
        return {
          response: htmlResponse(
            `<html><head><title>Guide</title></head><body><article><p>${filler}</p></article></body></html>`,
          ),
          finalUrl: "https://example.com/guide",
        };
      },
    });
    const page = await web.fetchContent({ url: "https://example.com/guide" });
    expect(page.source.provider).toBe("http");
    expect(page.text).toContain("converts it to markdown");
    expect(requested.some((url) => url.startsWith(JINA_READER_ORIGIN))).toBe(false);
  });

  test("extracts YouTube metadata and captions instead of scraping the watch SPA", async () => {
    expect(parseYouTubeVideoId("https://youtu.be/abcdefghijk")).toBe("abcdefghijk");
    const web = createWebResearchRuntime({
      lookup: PUBLIC_LOOKUP,
      fetchPage: async (url) => {
        if (url.includes("oembed")) {
          return {
            response: jsonResponse({ title: "Ignored", author_name: "Fallback" }),
            finalUrl: url,
          };
        }
        if (url.includes("/captions") || url.includes("timedtext")) {
          return {
            response: new Response(`<transcript><text start="1.5" dur="2">Hello from captions</text></transcript>`, {
              status: 200,
              headers: { "content-type": "text/xml" },
            }),
            finalUrl: url,
          };
        }
        if (url.includes("watch?v=abcdefghijk")) {
          const player = {
            videoDetails: {
              title: "Talk",
              author: "Channel",
              shortDescription: "A conference talk.",
              lengthSeconds: "90",
            },
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [{ baseUrl: "https://example.com/captions", languageCode: "en" }],
              },
            },
          };
          return {
            response: htmlResponse(`<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script>`),
            finalUrl: url,
          };
        }
        throw new Error(`unexpected url ${url}`);
      },
    });
    const page = await web.fetchContent({ url: "https://www.youtube.com/watch?v=abcdefghijk" });
    expect(page.source.provider).toBe("youtube");
    expect(page.source.title).toBe("Talk");
    expect(page.text).toContain("Channel: Channel");
    expect(page.text).toContain("Duration: 1:30");
    expect(page.text).toContain("[0:01] Hello from captions");
  });
});
