import { describe, expect, test } from "bun:test";
import { sanitizePublicHttpUrl, validatePublicHttpUrl, fetchPublicHttpUrl, WebResearchError } from "../src/web-url";
import { parseDuckDuckGoResults } from "../src/web-client";

describe("web URL policy", () => {
  test("rejects non-http, credentials, and localhost hostnames", () => {
    expect(() => sanitizePublicHttpUrl("file:///etc/passwd", "test")).toThrow(WebResearchError);
    expect(() => sanitizePublicHttpUrl("https://user:secret@example.com/", "test")).toThrow(WebResearchError);
    expect(() => sanitizePublicHttpUrl("http://localhost/admin", "test")).toThrow(WebResearchError);
    const url = sanitizePublicHttpUrl("https://example.com/path#frag", "test");
    expect(url.hash).toBe("");
    expect(url.pathname).toBe("/path");
  });

  test("rejects private, loopback, link-local, and metadata addresses", async () => {
    await expect(validatePublicHttpUrl("http://127.0.0.1/")).rejects.toBeInstanceOf(WebResearchError);
    await expect(validatePublicHttpUrl("http://10.0.0.4/")).rejects.toBeInstanceOf(WebResearchError);
    await expect(validatePublicHttpUrl("http://169.254.169.254/latest")).rejects.toBeInstanceOf(WebResearchError);
    await expect(validatePublicHttpUrl("http://192.168.1.1/")).rejects.toBeInstanceOf(WebResearchError);
    await expect(validatePublicHttpUrl("http://[::1]/")).rejects.toBeInstanceOf(WebResearchError);
    await expect(
      validatePublicHttpUrl("https://internal.example/", {
        lookup: async () => [{ address: "10.1.2.3", family: 4 }],
      }),
    ).rejects.toBeInstanceOf(WebResearchError);
  });

  test("denies redirects onto private addresses", async () => {
    const request = async () =>
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } });
    await expect(
      fetchPublicHttpUrl(
        "https://example.com/",
        { method: "GET" },
        {
          request,
          lookup: async (hostname) =>
            hostname === "example.com" ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }],
        },
      ),
    ).rejects.toBeInstanceOf(WebResearchError);
  });

  test("passes only the validated DNS addresses to the network request", async () => {
    let lookups = 0;
    const requested: Array<{ hostname: string; addresses: string[] }> = [];
    const result = await fetchPublicHttpUrl(
      "https://public.example/docs",
      { method: "GET" },
      {
        lookup: async () => {
          lookups += 1;
          return [{ address: "93.184.216.34", family: 4 }];
        },
        request: async (url, _init, addresses) => {
          requested.push({ hostname: url.hostname, addresses: addresses.map((entry) => entry.address) });
          return new Response("ok", { status: 200 });
        },
      },
    );
    expect(result.finalUrl).toBe("https://public.example/docs");
    expect(lookups).toBe(1);
    expect(requested).toEqual([{ hostname: "public.example", addresses: ["93.184.216.34"] }]);
  });
});

describe("DuckDuckGo HTML parse", () => {
  test("reads result titles and decodes uddg destinations", () => {
    const html = `
      <div class="results">
        <div class="result result--ad"><a class="result__a" href="https://ads.example">Ad</a></div>
        <div class="result">
          <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">Example docs</a>
          <a class="result__snippet">Public documentation</a>
        </div>
      </div>
    `;
    expect(parseDuckDuckGoResults(html)).toEqual([
      { title: "Example docs", url: "https://example.com/docs", snippet: "Public documentation" },
    ]);
  });
});
