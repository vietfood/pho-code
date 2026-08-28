import { Type, defineTool, type InlineExtension } from "@pho-agent/runtime/feature-api";
import type { HarnessFeature } from "./features";
import type { LocalRetrievalRuntime } from "./local-retrieval";

export const RETRIEVAL_FEATURE_ID = "local-retrieval";
export const RETRIEVAL_FEATURE_VERSION = "2.0.0";

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
          name: "find",
          label: "find",
          description:
            "Find files in the active workspace with the bundled FFF index. Glob patterns and fuzzy file-name queries are supported. Results are workspace-relative and capped at 100 paths.",
          promptSnippet: "Find workspace files by glob or fuzzy name (respects .gitignore unless an explicit path is searched).",
          promptGuidelines: ["Pass a workspace-relative directory with path when you already know the search area."],
          parameters: Type.Object({
            pattern: Type.String({ description: "Glob pattern or fuzzy file-name query" }),
            path: Type.Optional(Type.String({ description: "Workspace-relative directory to search" })),
            limit: Type.Optional(Type.Number({ description: "Maximum results (default 30, max 100)" })),
          }),
          async execute(_toolCallId, params, signal) {
            const text = await retrieval.find({
              pattern: params.pattern,
              ...(params.path ? { path: params.path } : {}),
              ...(params.limit !== undefined ? { limit: params.limit } : {}),
              ...(signal ? { signal } : {}),
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
          name: "grep",
          label: "grep",
          description:
            "Search file contents in the active workspace with the bundled FFF index. Returns workspace-relative paths, line numbers, and optional context. Results are capped at 100 matches and 200KB.",
          promptSnippet: "Search workspace file contents (respects .gitignore unless an explicit path is searched).",
          promptGuidelines: [
            "Use path for a directory or file constraint and glob for a file-name filter.",
            "Set literal for plain text containing regular-expression syntax.",
            "Read the top match after one or two searches instead of repeatedly broadening the query.",
          ],
          parameters: Type.Object({
            pattern: Type.String({ description: "Regular expression or literal search text" }),
            path: Type.Optional(Type.String({ description: "Workspace-relative directory or file to search" })),
            glob: Type.Optional(Type.String({ description: "File-name glob such as *.ts or **/*.test.ts" })),
            ignoreCase: Type.Optional(Type.Boolean({ description: "Match without regard to case" })),
            literal: Type.Optional(Type.Boolean({ description: "Treat pattern as literal text instead of a regular expression" })),
            context: Type.Optional(Type.Number({ description: "Context lines before and after each match (max 5)" })),
            limit: Type.Optional(Type.Number({ description: "Maximum matches (default 20, max 100)" })),
          }),
          async execute(_toolCallId, params, signal) {
            const text = await retrieval.grep({
              pattern: params.pattern,
              ...(params.path ? { path: params.path } : {}),
              ...(params.glob ? { glob: params.glob } : {}),
              ...(params.ignoreCase !== undefined ? { ignoreCase: params.ignoreCase } : {}),
              ...(params.literal !== undefined ? { literal: params.literal } : {}),
              ...(params.context !== undefined ? { context: params.context } : {}),
              ...(params.limit !== undefined ? { limit: params.limit } : {}),
              ...(signal ? { signal } : {}),
            });
            return {
              content: [{ type: "text", text }],
              details: { pattern: params.pattern },
            };
          },
        }),
      );
    },
  };
}
