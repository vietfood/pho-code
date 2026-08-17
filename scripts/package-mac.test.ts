import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { collectProductionPackages, nestSandboxRuntimeDependencies, patchFffAsarResolverSource } from "./package-mac.ts";
import { DESKTOP_DIR, copyPackageTree } from "./stage-app-resources.ts";
import { SANDBOX_RUNTIME_PACKAGE, SANDBOX_RUNTIME_VERSION } from "../packages/runtime/src/sandbox-artifact.ts";

describe("production package collection", () => {
  test("walks bun isolated Pi SDK dependencies from the declaring package", () => {
    const packages = collectProductionPackages(path.join(DESKTOP_DIR, "package.json"));
    const names = new Set(packages.map((entry) => entry.name));

    expect(names.has("@earendil-works/pi-coding-agent")).toBe(true);
    expect(names.has("@earendil-works/pi-ai")).toBe(true);
    expect(names.has("@anthropic-ai/sdk")).toBe(true);
    expect(names.has("openai")).toBe(true);
    expect(names.has("@anthropic-ai/sandbox-runtime")).toBe(true);
    expect(names.has("pi-sandbox")).toBe(false);
    expect(names.has("@carderne/sandbox-runtime")).toBe(false);
    expect(names.has("@gotgenes/pi-permission-system")).toBe(false);
    expect(names.has("@pho-code/runtime")).toBe(false);
    expect(names.has("react")).toBe(false);
    expect(packages.every((entry) => !entry.name.startsWith("@pho-code/"))).toBe(true);

    const anthropic = packages.find((entry) => entry.name === "@anthropic-ai/sdk");
    expect(anthropic).toBeDefined();
    expect(existsSync(path.join(anthropic!.root, "package.json"))).toBe(true);

    const sandboxRuntime = packages.find((entry) => entry.name === SANDBOX_RUNTIME_PACKAGE);
    expect(sandboxRuntime).toBeDefined();
    const sandboxManifest = JSON.parse(readFileSync(path.join(sandboxRuntime!.root, "package.json"), "utf8")) as {
      version?: string;
    };
    expect(sandboxManifest.version).toBe(SANDBOX_RUNTIME_VERSION);
  });

  test("nests sandbox-runtime dependencies so they do not collide with top-level zod 4", () => {
    const packages = collectProductionPackages(path.join(DESKTOP_DIR, "package.json"));
    const sandboxRuntime = packages.find((entry) => entry.name === SANDBOX_RUNTIME_PACKAGE);
    expect(sandboxRuntime).toBeDefined();
    const nodeModulesDir = mkdtempSync(path.join(tmpdir(), "pho-code-srt-stage-"));
    copyPackageTree(sandboxRuntime!.root, path.join(nodeModulesDir, ...SANDBOX_RUNTIME_PACKAGE.split("/")));
    nestSandboxRuntimeDependencies(nodeModulesDir, packages);
    const nestedZod = JSON.parse(
      readFileSync(path.join(nodeModulesDir, "@anthropic-ai", "sandbox-runtime", "node_modules", "zod", "package.json"), "utf8"),
    ) as { version?: string };
    expect(nestedZod.version?.startsWith("3.")).toBe(true);
    expect(existsSync(path.join(nodeModulesDir, "@anthropic-ai", "sandbox-runtime", "node_modules", "commander", "package.json"))).toBe(
      true,
    );
    expect(
      existsSync(path.join(nodeModulesDir, "@anthropic-ai", "sandbox-runtime", "node_modules", "@pondwader", "socks5-server", "package.json")),
    ).toBe(true);
    expect(existsSync(path.join(nodeModulesDir, "@anthropic-ai", "sandbox-runtime", "node_modules", "node-forge", "package.json"))).toBe(
      true,
    );
  });

  test("patches the staged FFF resolver to use its unpacked ASAR binary", () => {
    const source = [
      'import { dirname, join } from "node:path";',
      "/**",
      " * Try to resolve the binary from the platform-specific npm package.",
      " */",
      "function resolveFromNpmPackage() {",
      "            return binaryPath;",
      "}",
    ].join("\n");
    const patched = patchFffAsarResolverSource(source);
    expect(patched).toContain('import { dirname, join, sep } from "node:path";');
    expect(patched).toContain("app.asar.unpacked");
    expect(patched).toContain("return resolveAsarUnpackedBinary(binaryPath);");
  });
});
