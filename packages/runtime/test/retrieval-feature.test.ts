import { describe, expect, test } from "bun:test";
import type { LocalRetrievalRuntime } from "../src/local-retrieval";
import {
  RETRIEVAL_FEATURE_ID,
  RETRIEVAL_FEATURE_VERSION,
  createRetrievalFeature,
} from "../src/retrieval-feature";

describe("local retrieval feature", () => {
  test("replaces Pi retrieval with only canonical FFF-backed find and grep tools", async () => {
    const calls: Array<{ method: "find" | "grep"; input: unknown }> = [];
    const retrieval = {
      async find(input: unknown) {
        calls.push({ method: "find", input });
        return "src/main.ts";
      },
      async grep(input: unknown) {
        calls.push({ method: "grep", input });
        return "src/main.ts\n 1: needle";
      },
    } as LocalRetrievalRuntime;
    const tools: Array<{
      name: string;
      execute: (id: string, params: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
    }> = [];
    const feature = createRetrievalFeature(retrieval);
    feature.extensionFactories?.[0]?.factory({
      registerTool(tool: (typeof tools)[number]) {
        tools.push(tool);
      },
    } as never);

    expect(feature.id).toBe(RETRIEVAL_FEATURE_ID);
    expect(feature.version).toBe(RETRIEVAL_FEATURE_VERSION);
    expect(RETRIEVAL_FEATURE_VERSION).toBe("2.0.0");
    expect(tools.map((tool) => tool.name)).toEqual(["find", "grep"]);

    const controller = new AbortController();
    await tools[0]!.execute("find-1", { pattern: "*.ts", path: "src", limit: 5 }, controller.signal);
    await tools[1]!.execute(
      "grep-1",
      { pattern: "Needle", path: "src", glob: "*.ts", ignoreCase: true, literal: true, context: 2, limit: 4 },
      controller.signal,
    );
    expect(calls).toEqual([
      { method: "find", input: { pattern: "*.ts", path: "src", limit: 5, signal: controller.signal } },
      {
        method: "grep",
        input: {
          pattern: "Needle",
          path: "src",
          glob: "*.ts",
          ignoreCase: true,
          literal: true,
          context: 2,
          limit: 4,
          signal: controller.signal,
        },
      },
    ]);
  });
});
