import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

async function readPackage(relativePath: string): Promise<{
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}> {
  return JSON.parse(await readFile(path.join(workspaceRoot, relativePath, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

describe("workspace package dependency graph", () => {
  test("protocol has no runtime dependencies", async () => {
    const manifest = await readPackage("packages/protocol");
    expect(manifest.dependencies ?? {}).toEqual({});
  });

  test("application depends only on protocol and runtime", async () => {
    const manifest = await readPackage("packages/application");
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      "@pho-code/protocol",
      "@pho-code/runtime",
    ]);
  });

  test("runtime depends only on protocol and reviewed pinned feature packages", async () => {
    const manifest = await readPackage("packages/runtime");
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      "@earendil-works/pi-ai",
      "@earendil-works/pi-coding-agent",
      "@ff-labs/fff-node",
      "@gotgenes/pi-permission-system",
      "@modelcontextprotocol/sdk",
      "@mozilla/readability",
      "@pho-code/protocol",
      "linkedom",
      "pi-cursor-sdk",
      "turndown",
    ]);
  });

  test("ui depends on protocol and small UI libraries, not application or runtime", async () => {
    const manifest = await readPackage("packages/ui");
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@pho-code/protocol",
      "class-variance-authority",
      "katex",
      "lucide-react",
      "mermaid",
      "react-markdown",
      "rehype-katex",
      "rehype-sanitize",
      "remark-gfm",
      "remark-math",
      "shiki",
      "tailwind-merge",
    ]);
    expect(manifest.peerDependencies).toEqual({ react: "19.1.1", "react-dom": "19.1.1" });
  });

  test("desktop may depend on application and runtime only outside the renderer package graph", async () => {
    const manifest = await readPackage("apps/desktop");
    expect(manifest.dependencies?.["@pho-code/application"]).toBe("workspace:*");
    expect(manifest.dependencies?.["@pho-code/runtime"]).toBe("workspace:*");
    expect(manifest.dependencies?.["@pho-code/protocol"]).toBe("workspace:*");
    expect(manifest.dependencies?.["@pho-code/ui"]).toBe("workspace:*");
    expect(manifest.dependencies?.["@earendil-works/pi-coding-agent"]).toBe("0.84.1");
    expect(manifest.dependencies?.["@earendil-works/pi-ai"]).toBe("0.84.1");
    expect(manifest.dependencies?.["@gotgenes/pi-permission-system"]).toBe("24.0.0");
  });
});
