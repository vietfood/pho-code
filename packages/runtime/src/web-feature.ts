import { Type, defineTool, type InlineExtension } from "@pho-agent/runtime/feature-api";
import type { HarnessFeature } from "./features";
import { createWebResearchRuntime, type WebResearchRuntime } from "./web-client";
import { WebResearchError } from "./web-url";

export const WEB_FEATURE_ID = "pho-web";
export const WEB_FEATURE_VERSION = "1.2.0";

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
            "Search the public web across DuckDuckGo, Bing, Brave, Mojeek, and Jina in parallel, then merge unique titled URLs. Do not use this for local files or private hosts. Jina discloses the query to jina.ai; the HTML engines are keyless and may be incomplete.",
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
                details: { provider: page.provider, sources: page.sources },
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
            "GET a public http: or https: URL and extract readable text. YouTube watch/shorts/live URLs return title, channel, description, and captions when they are public. Thin JS pages retry through Jina Reader, which discloses the URL to jina.ai. Private, loopback, and credentialed destinations are denied. Visual frame analysis and Gemini cookie/API video understanding are unavailable.",
          promptSnippet: "Fetch a public web page or YouTube transcript.",
          promptGuidelines: [
            "Pass a literal public URL.",
            "For YouTube, pass a watch, shorts, live, embed, or youtu.be URL to get captions and metadata.",
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
                  provider: page.source.provider,
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
