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

  test("keeps a workspace index after binding another workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-code-fff-"));
    const workspaceA = path.join(root, "workspace-a");
    const workspaceB = path.join(root, "workspace-b");
    const dataDir = path.join(root, "retrieval");
    await mkdir(workspaceA);
    await mkdir(workspaceB);
    await writeFile(path.join(workspaceA, "alpha-only.ts"), "export const alpha = 1;\n");
    await writeFile(path.join(workspaceB, "beta-only.ts"), "export const beta = 1;\n");
    const retrieval = createLocalRetrievalRuntime({ dataDir });
    try {
      await retrieval.bind(workspaceA);
      await retrieval.bind(workspaceB);
      const fromA = await retrieval.searchPaths({ query: "alpha-only", workspacePath: workspaceA, limit: 8 });
      const fromB = await retrieval.searchPaths({ query: "beta-only", workspacePath: workspaceB, limit: 8 });
      if (fromA.status === "unavailable" || fromB.status === "unavailable") {
        expect(fromA.diagnostic?.length || fromB.diagnostic?.length).toBeGreaterThan(0);
        return;
      }
      expect(fromA.suggestions.some((entry) => entry.path === "alpha-only.ts")).toBe(true);
      expect(fromA.suggestions.some((entry) => entry.path === "beta-only.ts")).toBe(false);
      expect(fromB.suggestions.some((entry) => entry.path === "beta-only.ts")).toBe(true);
      expect(fromB.suggestions.some((entry) => entry.path === "alpha-only.ts")).toBe(false);

      const [aHits, bHits] = await Promise.all([
        retrieval.runWithWorkspace(workspaceA, () => retrieval.fileSearch({ pattern: "alpha-only" })),
        retrieval.runWithWorkspace(workspaceB, () => retrieval.fileSearch({ pattern: "beta-only" })),
      ]);
      expect(aHits).toContain("alpha-only.ts");
      expect(bHits).toContain("beta-only.ts");
    } finally {
      await retrieval.dispose();
    }
  });
});
