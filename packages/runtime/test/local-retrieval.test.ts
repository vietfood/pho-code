import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { createLocalRetrievalRuntime } from "../src/local-retrieval";

describe("local retrieval", () => {
  test("indexes an owned workspace and returns relative path suggestions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-code-fff-"));
    const workspace = path.join(root, "workspace");
    const dataDir = path.join(root, "retrieval");
    await mkdir(workspace);
    await mkdir(path.join(workspace, "src"));
    await writeFile(path.join(workspace, "src", "composer.tsx"), "export function Composer() {}\n");
    await writeFile(path.join(workspace, "README.md"), "# fixture\n");
    const retrieval = createLocalRetrievalRuntime({ dataDir });
    try {
      await retrieval.bind(workspace);
      const result = await retrieval.searchPaths({ query: "composer", limit: 8 });
      if (result.status === "unavailable") {
        expect(result.diagnostic?.length).toBeGreaterThan(0);
        return;
      }
      expect(result.status === "ready" || result.status === "indexing").toBe(true);
      expect(result.suggestions.some((entry) => entry.path === "src/composer.tsx" && entry.kind === "file")).toBe(true);
      expect(result.suggestions.every((entry) => !path.isAbsolute(entry.path))).toBe(true);
    } finally {
      await retrieval.dispose();
    }
  });
});
