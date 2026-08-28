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
    const retrieval = createLocalRetrievalRuntime({ dataDir, persistRankingData: false });
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
    const retrieval = createLocalRetrievalRuntime({ dataDir, persistRankingData: false });
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
        retrieval.runWithWorkspace(workspaceA, () => retrieval.find({ pattern: "alpha-only" })),
        retrieval.runWithWorkspace(workspaceB, () => retrieval.find({ pattern: "beta-only" })),
      ]);
      expect(aHits).toContain("alpha-only.ts");
      expect(bHits).toContain("beta-only.ts");
    } finally {
      await retrieval.dispose();
    }
  });

  test("keeps path constraints inside their scope and searches an explicitly named ignored directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-code-fff-"));
    const workspace = path.join(root, "workspace");
    const dataDir = path.join(root, "retrieval");
    await mkdir(path.join(workspace, "src"), { recursive: true });
    await mkdir(path.join(workspace, "ignored"));
    await writeFile(path.join(workspace, ".gitignore"), "ignored/\n");
    await writeFile(path.join(workspace, "outside.ts"), "const escapedNeedle = true;\n");
    await writeFile(path.join(workspace, "src", "target.ts"), "const ordinary = true;\n");
    await writeFile(path.join(workspace, "ignored", "secret.ts"), "const IgnoredNeedle = true;\n");
    const retrieval = createLocalRetrievalRuntime({ dataDir, persistRankingData: false });
    try {
      await retrieval.bind(workspace);
      const snapshot = retrieval.getSnapshot(workspace);
      if (snapshot.status === "unavailable") {
        expect(snapshot.diagnostic?.length).toBeGreaterThan(0);
        return;
      }

      const constrained = await retrieval.grep({ pattern: "escapedNeedle", path: "src", literal: true });
      expect(constrained).toBe("No matches found");
      const constrainedRegex = await retrieval.grep({ pattern: "escapedNeedle|ordinary", path: "src" });
      expect(constrainedRegex).toContain("src/target.ts");
      expect(constrainedRegex).not.toContain("outside.ts");

      const ignored = await retrieval.grep({
        pattern: "ignoredneedle",
        path: "ignored",
        glob: "*.ts",
        ignoreCase: true,
        literal: true,
        context: 99,
      });
      expect(ignored).toContain("ignored/secret.ts");
      expect(ignored).toContain("IgnoredNeedle");
      expect(ignored).not.toContain("outside.ts");

      const found = await retrieval.find({ pattern: "*.ts", path: "ignored" });
      expect(found).toBe("ignored/secret.ts");
      await expect(retrieval.grep({ pattern: "needle", path: "../outside", literal: true })).rejects.toThrow(
        "Path must stay inside the workspace.",
      );
    } finally {
      await retrieval.dispose();
    }
  });
});
