import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function readDesktop(relativePath: string): Promise<string> {
  return readFile(path.join(desktopRoot, relativePath), "utf8");
}

describe("window-first eager module boundary", () => {
  test("loads the broad runtime only through the background dynamic import", async () => {
    const main = await readDesktop("electron/main.ts");
    const runtimeLines = main.split("\n").filter((line) => line.includes('"@pho-code/runtime"'));

    expect(runtimeLines).toEqual([
      'import type { HarnessRuntime } from "@pho-code/runtime";',
      '    const runtimeModule = await import("@pho-code/runtime");',
    ]);
  });

  test("keeps image sniffing on the narrow pure runtime subpath", async () => {
    const [ingest, vite] = await Promise.all([
      readDesktop("electron/image-ingest.ts"),
      readDesktop("electron.vite.config.ts"),
    ]);

    expect(ingest).toContain('from "@pho-code/runtime/image-bytes"');
    expect(ingest).not.toContain('from "@pho-code/runtime"');
    expect(vite).toContain('"@pho-code/runtime/image-bytes"');
  });

  test("bundles private Pho Agent sources instead of externalizing workspace TypeScript", async () => {
    const vite = await readDesktop("electron.vite.config.ts");

    for (const entry of [
      '"@pho-agent/protocol": path.resolve(workspaceRoot, "packages/pho-agent/packages/protocol/src/index.ts")',
      '"@pho-agent/runtime/feature-api": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/feature-api.ts")',
      '"@pho-agent/runtime/context-prompt-feature": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/context-prompt-feature.ts")',
      '"@pho-agent/runtime/github-mcp": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/github-mcp/index.ts")',
      '"@pho-agent/runtime/plan-agent": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/plan-agent/index.ts")',
      '"@pho-agent/runtime/path-containment": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/path-containment.ts")',
      '"@pho-agent/runtime/session-registry": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/session-registry.ts")',
      '"@pho-agent/runtime/skills": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/skills/index.ts")',
      '"@pho-agent/runtime/testing": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/testing.ts")',
      '"@pho-agent/runtime": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/index.ts")',
    ]) {
      expect(vite).toContain(entry);
    }
    expect(vite.indexOf('"@pho-agent/runtime/feature-api"')).toBeLessThan(
      vite.indexOf('"@pho-agent/runtime":'),
    );
    expect(vite.indexOf('"@pho-agent/runtime/testing"')).toBeLessThan(vite.indexOf('"@pho-agent/runtime":'));
    expect(vite.indexOf('"@pho-agent/runtime/github-mcp"')).toBeLessThan(vite.indexOf('"@pho-agent/runtime":'));
    expect(vite).toContain('const bundledMainPackages = [\n  "@pho-agent/protocol",\n  "@pho-agent/runtime",');
    expect(vite).toContain('const bundledProtocolPackages = ["@pho-agent/protocol", "@pho-code/protocol"]');
    expect(vite).toContain(
      'const externalAgentRuntimePackages = [\n  "@earendil-works/pi-ai",\n  "@earendil-works/pi-coding-agent",\n]',
    );
    expect(vite).toContain("include: externalAgentRuntimePackages");
    expect(vite).not.toContain('id.startsWith("@modelcontextprotocol/sdk")');
  });
});
