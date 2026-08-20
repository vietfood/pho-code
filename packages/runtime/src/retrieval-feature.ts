import { Type, defineTool, type InlineExtension } from "@pho-agent/runtime/feature-api";
import type { HarnessFeature } from "./features";
import type { LocalRetrievalRuntime } from "./local-retrieval";

export const RETRIEVAL_FEATURE_ID = "local-retrieval";
export const RETRIEVAL_FEATURE_VERSION = "1.0.0";

export function createRetrievalFeature(retrieval: LocalRetrievalRuntime): HarnessFeature {
  return {
    id: RETRIEVAL_FEATURE_ID,
    version: RETRIEVAL_FEATURE_VERSION,
    extensionFactories: [createRetrievalExtension(retrieval)],
    expected: { extensions: 1 },
  };
}

function createRetrievalExtension(retrieval: LocalRetrievalRuntime): InlineExtension {
  return {
    name: RETRIEVAL_FEATURE_ID,
    factory(pi) {
      pi.registerTool(
        defineTool({
          name: "fffind",
          label: "FFF find",
          description:
            "Fuzzy file-name search over the active workspace using the local FFF index. Prefer this over shell find/rg for locating files. Results are workspace-relative.",
          promptSnippet: "Fuzzy-find workspace files.",
          promptGuidelines: [
            "Use fffind for file names; keep Pi find/grep available for exact typed searches.",
            "Pass a directory constraint with path when you already know the folder.",
          ],
          parameters: Type.Object({
            pattern: Type.String({ description: "Fuzzy file-name query" }),
            path: Type.Optional(Type.String({ description: "Optional workspace-relative directory constraint" })),
            limit: Type.Optional(Type.Number({ description: "Max results (default 30)" })),
          }),
          async execute(_toolCallId, params, signal) {
            if (signal?.aborted) {
              throw new Error("Operation aborted");
            }
            const text = await retrieval.fileSearch({
              pattern: params.pattern,
              ...(params.path ? { path: params.path } : {}),
              ...(params.limit !== undefined ? { limit: params.limit } : {}),
            });
            return {
              content: [{ type: "text", text }],
              details: { pattern: params.pattern },
            };
          },
        }),
      );
      pi.registerTool(
        defineTool({
          name: "ffgrep",
          label: "FFF grep",
          description:
            "Search file contents in the active workspace using the local FFF index. Smart-case, git-aware, and paginated. Prefer this over shell rg/grep for routine content search.",
          promptSnippet: "Search workspace file contents.",
          promptGuidelines: [
            "Prefer identifiers and literal substrings.",
            "Use path to constrain to a folder or glob.",
            "After one or two greps, read the top match instead of repeating searches.",
          ],
          parameters: Type.Object({
            pattern: Type.String({ description: "Search text or regex" }),
            path: Type.Optional(Type.String({ description: "Optional workspace-relative path or glob constraint" })),
            context: Type.Optional(Type.Number({ description: "Context lines before and after each match" })),
            limit: Type.Optional(Type.Number({ description: "Max matches (default 20)" })),
            cursor: Type.Optional(Type.String({ description: "Pagination cursor from a previous result" })),
            caseSensitive: Type.Optional(Type.Boolean({ description: "Force case-sensitive matching" })),
          }),
          async execute(_toolCallId, params, signal) {
            if (signal?.aborted) {
              throw new Error("Operation aborted");
            }
            const text = await retrieval.grep({
              pattern: params.pattern,
              ...(params.path ? { path: params.path } : {}),
              ...(params.context !== undefined ? { context: params.context } : {}),
              ...(params.limit !== undefined ? { limit: params.limit } : {}),
              ...(params.cursor ? { cursor: params.cursor } : {}),
              ...(params.caseSensitive !== undefined ? { caseSensitive: params.caseSensitive } : {}),
            });
            return {
              content: [{ type: "text", text }],
              details: { pattern: params.pattern },
            };
          },
        }),
      );
      pi.registerTool(
        defineTool({
          name: "fff-multi-grep",
          label: "FFF multi-grep",
          description:
            "OR-logic multi-pattern content search over the active workspace using the local FFF index.",
          promptSnippet: "Search workspace contents for any of several literal patterns.",
          parameters: Type.Object({
            patterns: Type.Array(Type.String(), { description: "Literal patterns; a line matches if it contains any of them" }),
            constraints: Type.Optional(Type.String({ description: "Optional file constraint such as *.ts or src/" })),
            context: Type.Optional(Type.Number({ description: "Context lines before and after each match" })),
            limit: Type.Optional(Type.Number({ description: "Max matches (default 20)" })),
            cursor: Type.Optional(Type.String({ description: "Pagination cursor from a previous result" })),
          }),
          async execute(_toolCallId, params, signal) {
            if (signal?.aborted) {
              throw new Error("Operation aborted");
            }
            const text = await retrieval.multiGrep({
              patterns: params.patterns,
              ...(params.constraints ? { constraints: params.constraints } : {}),
              ...(params.context !== undefined ? { context: params.context } : {}),
              ...(params.limit !== undefined ? { limit: params.limit } : {}),
              ...(params.cursor ? { cursor: params.cursor } : {}),
            });
            return {
              content: [{ type: "text", text }],
              details: { patterns: params.patterns },
            };
          },
        }),
      );
    },
  };
}
