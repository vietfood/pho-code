import { describe, expect, test } from "bun:test";
import {
  parseWebFetchSource,
  parseWebSearchQuery,
  parseWebSearchResults,
  siteBadgeColor,
  siteFaviconSrc,
  uniqueWebHosts,
  WEB_SEARCH_PREVIEW_COUNT,
  webToolKind,
} from "../src/lib/web-source";

const SEARCH_OUTPUT = `Search results (mixed):

1. Top 50 Interesting Unknown Facts about Programming
   https://www.geeksforgeeks.org/top-50-interesting-unknown-facts-about-programming/
   A list of facts.
   [duckduckgo]

2. neal.fun
   https://neal.fun/
   [bing]

3. Joy Cone
   https://joycone.com/
   [brave]

4. Extra One
   https://example.com/one
   [jina]

5. Extra Two
   https://example.com/two
   [mojeek]
`;

describe("web source parsing", () => {
  test("recognizes projected web search and fetch names", () => {
    expect(webToolKind("web search")).toBe("search");
    expect(webToolKind("web_search")).toBe("search");
    expect(webToolKind("fetch")).toBe("fetch");
    expect(webToolKind("fetch_content")).toBe("fetch");
    expect(webToolKind("grep")).toBeNull();
    expect(webToolKind("bash")).toBeNull();
  });

  test("parses titled search hits and strips www from the display host", () => {
    const rows = parseWebSearchResults(SEARCH_OUTPUT);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({
      title: "Top 50 Interesting Unknown Facts about Programming",
      url: "https://www.geeksforgeeks.org/top-50-interesting-unknown-facts-about-programming/",
      host: "www.geeksforgeeks.org",
      displayHost: "geeksforgeeks.org",
    });
    expect(rows[1]).toMatchObject({ title: "neal.fun", displayHost: "neal.fun" });
    expect(WEB_SEARCH_PREVIEW_COUNT).toBe(3);
    expect(uniqueWebHosts(rows)).toEqual([
      "www.geeksforgeeks.org",
      "neal.fun",
      "joycone.com",
    ]);
  });

  test("ignores malformed or credentialed search URLs", () => {
    expect(
      parseWebSearchResults(`1. Secret
   https://user:pass@example.com/x
   [bing]

2. File
   file:///etc/passwd
   [duckduckgo]
`),
    ).toEqual([]);
  });

  test("reads the search query from tool input", () => {
    expect(parseWebSearchQuery('{"query":"best waffle cone supplier"}')).toBe("best waffle cone supplier");
    expect(parseWebSearchQuery("")).toBeNull();
  });

  test("reads a fetch URL and page title", () => {
    const url = "https://www.geeksforgeeks.org/top-50-interesting-unknown-facts-about-programming/";
    expect(
      parseWebFetchSource(
        JSON.stringify({ url }),
        `# Top 50 Interesting Unknown Facts about Programming - GeeksforGeeks\n\nSource: ${url}\n\nBody`,
      ),
    ).toEqual({
      title: "Top 50 Interesting Unknown Facts about Programming - GeeksforGeeks",
      url,
      host: "www.geeksforgeeks.org",
      displayHost: "geeksforgeeks.org",
    });
  });

  test("hashes www and bare hosts to the same badge color", () => {
    expect(siteBadgeColor("www.geeksforgeeks.org")).toBe(siteBadgeColor("geeksforgeeks.org"));
    expect(siteFaviconSrc("geeksforgeeks.org")).toBe(
      "https://www.google.com/s2/favicons?domain=geeksforgeeks.org&sz=32",
    );
    expect(siteFaviconSrc("evil.com/x")).toBeNull();
  });
});
