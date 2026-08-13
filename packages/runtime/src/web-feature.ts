import { Type } from "@earendil-works/pi-ai";
import { defineTool, type InlineExtension } from "@earendil-works/pi-coding-agent";
import type { HarnessFeature } from "./features";
import { createWebResearchRuntime, type WebResearchRuntime } from "./web-client";
import { WebResearchError } from "./web-url";

export const WEB_FEATURE_ID = "pho-web";
export const WEB_FEATURE_VERSION = "1.0.0";

export function createWebFeature(web: WebResearchRuntime = createWebResearchRuntime()): HarnessFeature {
  return {
    id: WEB_FEATURE_ID,
    version: WEB_FEATURE_VERSION,
    extensionFactories: [createWebExtension(web)],
    expected: { extensions: 1 },
  };
}

function createWebExtension(web: WebResearchRuntime): InlineExtension {
  return {
    name: WEB_FEATURE_ID,
    factory(pi) {
      pi.registerTool(
        defineTool({
          name: "web_search",
          label: "Web search",
          description:
            "Search the public web with DuckDuckGo. Returns a small set of titled URLs. Do not use this for local files or private hosts.",
          promptSnippet: "Search the public web.",
          promptGuidelines: [
            "Use web_search for current public information.",
            "Prefer fetch_content on a specific result URL instead of repeating searches.",
            "Never search for secrets, credentials, or internal hostnames.",
          ],
          parameters: Type.Object({
            query: Type.String({ description: "Public web search query" }),
          }),
          async execute(_toolCallId, params, signal) {
            if (signal?.aborted) {
              throw new Error("Operation aborted");
            }
            try {
              const page = await web.search({
                query: params.query,
                ...(signal ? { signal } : {}),
              });
              return {
                content: [{ type: "text" as const, text: page.text }],
                details: { provider: "duckduckgo", sources: page.sources },
              };
            } catch (error) {
              throw toToolError(error);
            }
          },
        }),
      );
      pi.registerTool(
        defineTool({
          name: "fetch_content",
          label: "Fetch content",
          description:
            "GET a public http: or https: URL and extract readable text. Private, loopback, and credentialed destinations are denied.",
          promptSnippet: "Fetch a public web page as text.",
          promptGuidelines: [
            "Pass a literal public URL.",
            "Do not fetch file paths, localhost, or metadata endpoints.",
            "Images, PDFs, and binary downloads are unsupported.",
          ],
          parameters: Type.Object({
            url: Type.String({ description: "Public http: or https: URL" }),
          }),
          async execute(_toolCallId, params, signal) {
            if (signal?.aborted) {
              throw new Error("Operation aborted");
            }
            try {
              const page = await web.fetchContent({
                url: params.url,
                ...(signal ? { signal } : {}),
              });
              return {
                content: [{ type: "text" as const, text: page.text }],
                details: {
                  provider: "http",
                  sources: [page.source],
                  contentType: page.contentType,
                },
              };
            } catch (error) {
              throw toToolError(error);
            }
          },
        }),
      );
    },
  };
}

function toToolError(error: unknown): Error {
  if (error instanceof WebResearchError) {
    return error;
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("The web request failed.");
}
