import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

async function readPackage(relativePath: string): Promise<{
  exports?: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}> {
  return JSON.parse(await readFile(path.join(workspaceRoot, relativePath, "package.json"), "utf8")) as {
    exports?: Record<string, string>;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

async function readTypeScriptFiles(relativeRoot: string): Promise<Array<{ path: string; source: string }>> {
  const root = path.join(workspaceRoot, relativeRoot);
  const files: Array<{ path: string; source: string }> = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (/\.[cm]?[jt]sx?$/u.test(entry.name)) {
        files.push({
          path: path.relative(workspaceRoot, absolutePath),
          source: await readFile(absolutePath, "utf8"),
        });
      }
    }
  }

  await visit(root);
  return files;
}

function importsOf(source: string): string[] {
  return [...source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(["'])([^"']+)\1/gu)].map(
    (match) => match[2]!,
  );
}

function expectNoImports(
  files: readonly { path: string; source: string }[],
  denied: (specifier: string) => boolean,
): void {
  const violations = files.flatMap((file) =>
    importsOf(file.source)
      .filter(denied)
      .map((specifier) => `${file.path}: ${specifier}`),
  );
  expect(violations).toEqual([]);
}

const productSourceRoots = [
  "packages/protocol/src",
  "packages/runtime/src",
  "packages/application/src",
  "packages/ui/src",
  "apps/desktop/electron",
  "apps/desktop/src",
];

describe("workspace package dependency graph", () => {
  test("Pho Code protocol depends only on the product-neutral protocol", async () => {
    const manifest = await readPackage("packages/protocol");
    expect(manifest.dependencies ?? {}).toEqual({ "@pho-agent/protocol": "workspace:*" });
  });

  test("agent package manifests keep one-way private dependency direction", async () => {
    const protocol = await readPackage("packages/pho-agent/packages/protocol");
    const host = await readPackage("packages/pho-agent/packages/host");
    const codex = await readPackage("packages/pho-agent/packages/backend-codex");
    const acp = await readPackage("packages/pho-agent/packages/backend-acp");
    const runtime = await readPackage("packages/pho-agent/packages/runtime");
    const evals = await readPackage("packages/pho-agent/packages/evals");
    expect(protocol.dependencies ?? {}).toEqual({});
    expect(host.dependencies ?? {}).toEqual({ "@pho-agent/protocol": "workspace:*" });
    expect(codex.dependencies ?? {}).toEqual({
      "@pho-agent/host": "workspace:*",
      "@pho-agent/protocol": "workspace:*",
    });
    expect(acp.dependencies ?? {}).toEqual({
      "@agentclientprotocol/sdk": "1.4.0",
      "@pho-agent/host": "workspace:*",
      "@pho-agent/protocol": "workspace:*",
    });
    expect(runtime.dependencies?.["@pho-agent/host"]).toBe("workspace:*");
    expect(runtime.dependencies?.["@pho-agent/protocol"]).toBe("workspace:*");
    expect(runtime.dependencies?.["@earendil-works/pi-ai"]).toBe("0.84.1");
    expect(runtime.dependencies?.["@earendil-works/pi-coding-agent"]).toBe("0.84.1");
    expect(runtime.dependencies?.["@earendil-works/pi-agent-core"]).toBe("0.84.1");
    expect(runtime.dependencies?.["@modelcontextprotocol/sdk"]).toBe("1.30.0");
    expect(runtime.exports?.["./feature-api"]).toBe("./src/feature-api.ts");
    expect(runtime.exports?.["./github-mcp"]).toBe("./src/github-mcp/index.ts");
    expect(runtime.exports?.["./plan-agent"]).toBe("./src/plan-agent/index.ts");
    expect(runtime.exports?.["./session-registry"]).toBe("./src/session-registry.ts");
    expect(runtime.exports?.["./skills"]).toBe("./src/skills/index.ts");
    expect(
      Object.keys(evals.dependencies ?? {}).filter((name) => !name.startsWith("@pho-agent/")),
    ).toEqual([]);

    for (const manifest of [protocol, host, codex, acp, runtime, evals]) {
      const names = [
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
      ];
      expect(names.filter((name) => name.startsWith("@pho-code/"))).toEqual([]);
      expect(names).not.toContain("electron");
      expect(names).not.toContain("react");
      expect(names).not.toContain("react-dom");
    }
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
    expect(manifest.dependencies?.["@pho-agent/backend-acp"]).toBe("workspace:*");
    expect(manifest.dependencies?.["@pho-agent/backend-codex"]).toBe("workspace:*");
    expect(manifest.dependencies?.["@pho-agent/host"]).toBe("workspace:*");
    expect(manifest.dependencies?.["@pho-agent/runtime"]).toBe("workspace:*");
    expect(manifest.dependencies?.["@pho-code/protocol"]).toBe("workspace:*");
    expect(Object.keys(manifest.dependencies ?? {}).filter((name) => name.startsWith("@earendil-works/"))).toEqual([]);
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

  test("root eval command depends on the agent evals package surface", async () => {
    const manifest = await readPackage(".");
    expect(manifest.devDependencies?.["@pho-agent/evals"]).toBe("workspace:*");
  });

  test("desktop may depend on application and runtime only outside the renderer package graph", async () => {
    const manifest = await readPackage("apps/desktop");
    expect(manifest.dependencies?.["@pho-code/application"]).toBe("workspace:*");
    expect(manifest.dependencies?.["@pho-code/runtime"]).toBe("workspace:*");
    expect(manifest.dependencies?.["@pho-code/protocol"]).toBe("workspace:*");
    expect(manifest.dependencies?.["@pho-code/ui"]).toBe("workspace:*");
    expect(Object.keys(manifest.dependencies ?? {}).filter((name) => name.startsWith("@earendil-works/"))).toEqual([]);
    expect(manifest.dependencies?.["@gotgenes/pi-permission-system"]).toBe("24.0.0");
    expect(manifest.dependencies?.["@juicesharp/rpiv-ask-user-question"]).toBeUndefined();
    expect(manifest.dependencies?.["@earendil-works/pi-tui"]).toBeUndefined();
  });

  test("no workspace package bakes juicesharp or pi-tui", async () => {
    for (const relativePath of [
      "packages/pho-agent/packages/protocol",
      "packages/pho-agent/packages/host",
      "packages/pho-agent/packages/backend-codex",
      "packages/pho-agent/packages/backend-acp",
      "packages/pho-agent/packages/runtime",
      "packages/pho-agent/packages/evals",
      "packages/protocol",
      "packages/application",
      "packages/runtime",
      "packages/ui",
      "apps/desktop",
    ]) {
      const manifest = await readPackage(relativePath);
      const names = [
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
      ];
      expect(names).not.toContain("@juicesharp/rpiv-ask-user-question");
      expect(names).not.toContain("@earendil-works/pi-tui");
    }
  });
});

describe("workspace source dependency direction", () => {
  test("agent packages never import Pho Code, Electron, or React", async () => {
    const [protocol, host, codex, acp, runtime, evals] = await Promise.all([
      readTypeScriptFiles("packages/pho-agent/packages/protocol/src"),
      readTypeScriptFiles("packages/pho-agent/packages/host/src"),
      readTypeScriptFiles("packages/pho-agent/packages/backend-codex/src"),
      readTypeScriptFiles("packages/pho-agent/packages/backend-acp/src"),
      readTypeScriptFiles("packages/pho-agent/packages/runtime/src"),
      readTypeScriptFiles("packages/pho-agent/packages/evals/src"),
    ]);
    const isProductOrUi = (specifier: string) =>
      specifier.startsWith("@pho-code/") || ["electron", "react", "react-dom"].includes(specifier);
    expectNoImports(protocol, (specifier) =>
      isProductOrUi(specifier) || specifier.startsWith("node:") || specifier.startsWith("@earendil-works/"),
    );
    expectNoImports(host, (specifier) =>
      isProductOrUi(specifier) || specifier.startsWith("node:") || specifier.startsWith("@earendil-works/"),
    );
    expectNoImports(codex, (specifier) => isProductOrUi(specifier) || specifier.startsWith("@earendil-works/"));
    expectNoImports(acp, (specifier) => isProductOrUi(specifier) || specifier.startsWith("@earendil-works/"));
    expectNoImports(runtime, isProductOrUi);
    expectNoImports(evals, (specifier) => isProductOrUi(specifier) || specifier.startsWith("@earendil-works/"));
  });

  test("Pho Code source reaches Pi only through Pho Agent", async () => {
    const files = (await Promise.all(productSourceRoots.map(readTypeScriptFiles))).flat();
    expectNoImports(files, (specifier) => specifier.startsWith("@earendil-works/pi-"));
  });

  test("only agent runtime constructs Pi services", async () => {
    const files = (await Promise.all(productSourceRoots.map(readTypeScriptFiles))).flat();
    const constructors =
      /\b(?:ModelRuntime\.create|SettingsManager\.(?:create|inMemory)|createAgentSession(?:Runtime|Services|FromServices)|SessionManager\.(?:create|open|list)|new\s+DefaultResourceLoader)\b/u;
    expect(files.filter((file) => constructors.test(file.source)).map((file) => file.path)).toEqual([]);
  });

  test("Pho Code keeps only compatibility re-exports for migrated harness capabilities", async () => {
    const wrappers = {
      "ask-user-question.ts": "@pho-agent/runtime/plan-agent",
      "ask-user-present.ts": "@pho-agent/runtime/plan-agent",
      "ask-user-rpc-fallback.ts": "@pho-agent/runtime/plan-agent",
      "plan-agent-state.ts": "@pho-agent/runtime/plan-agent",
      "todo-tool.ts": "@pho-agent/runtime/plan-agent",
      "skill-invoke.ts": "@pho-agent/runtime/skills",
      "skill-source.ts": "@pho-agent/runtime/skills",
      "github-mcp-allowlist.ts": "@pho-agent/runtime/github-mcp",
      "github-mcp-artifact.ts": "@pho-agent/runtime/github-mcp",
      "github-mcp-feature.ts": "@pho-agent/runtime/github-mcp",
      "github-mcp-runtime.ts": "@pho-agent/runtime/github-mcp",
      "secret-store.ts": "@pho-agent/runtime/github-mcp",
      "context-prompt-feature.ts": "@pho-agent/runtime/context-prompt-feature",
      "path-containment.ts": "@pho-agent/runtime/path-containment",
    } as const;
    for (const [file, target] of Object.entries(wrappers)) {
      const source = await readFile(path.join(workspaceRoot, "packages/runtime/src", file), "utf8");
      expect(source.trim()).toBe(`export * from "${target}";`);
    }
  });

  test("M0 does not expose later task-intelligence commands or persisted entries", async () => {
    const roots = [
      "packages/pho-agent/packages/protocol/src",
      "packages/pho-agent/packages/host/src",
      "packages/pho-agent/packages/backend-codex/src",
      "packages/pho-agent/packages/backend-acp/src",
      "packages/pho-agent/packages/runtime/src",
      ...productSourceRoots,
    ];
    const files = (await Promise.all(roots.map(readTypeScriptFiles))).flat();
    const laterSurface = [
      "updateTaskBrief",
      "resetTaskBrief",
      "reopenTask",
      "getEvidenceDetails",
      "recordOwnerVerification",
      "acceptCompletionGaps",
      "update_task_brief",
      "pho-agent.task-brief",
      "pho-agent.evidence-pack",
      "pho-agent.verification",
      "pho-agent.completion",
    ];
    const violations = files.flatMap((file) =>
      laterSurface.filter((token) => file.source.includes(token)).map((token) => `${file.path}: ${token}`),
    );
    expect(violations).toEqual([]);
  });
});
