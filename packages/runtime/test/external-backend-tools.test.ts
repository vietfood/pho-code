import { describe, expect, test } from "bun:test";
import { createCodexWorkspaceSearchTool } from "../src/external-backend-tools";

describe("external backend tools", () => {
  test("searches the owning workspace with bounded arguments", async () => {
    const searches: unknown[] = [];
    const tool = createCodexWorkspaceSearchTool(
      { resolve: (scopeId) => ({ runtimeDirectory: `/workspaces/${scopeId}` }) },
      {
        bind: async () => undefined,
        searchPaths: async (input) => {
          searches.push(input);
          return { status: "ready", suggestions: [{ path: "src/index.ts", kind: "file" }] };
        },
      },
    );
    const output = await tool.execute({
      scopeId: "project-a",
      sessionId: "session-a",
      turnId: "turn-a",
      callId: "call-a",
      arguments: { query: "x".repeat(250), kinds: ["file", "invalid"], limit: 99 },
      signal: new AbortController().signal,
    });
    expect(searches).toEqual([{
      workspacePath: "/workspaces/project-a",
      query: "x".repeat(200),
      kinds: ["file"],
      limit: 20,
    }]);
    expect(JSON.parse(output)).toEqual({
      status: "ready",
      suggestions: [{ path: "src/index.ts", kind: "file" }],
    });
  });
});
