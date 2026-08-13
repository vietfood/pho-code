import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { PERMISSION_PACKAGE_NAME, createDefaultFeatureManifest, resolvePermissionFeature } from "../src/features";
import {
  createNodeModuleResourceLocator,
  createPackagedResourceLocator,
  PACKAGED_FEATURES_DIR,
  readPiExtensionPaths,
} from "../src/resource-locator";

describe("resource locator", () => {
  test("resolves the pinned permission package from the dependency graph", () => {
    const locator = createNodeModuleResourceLocator();
    const root = locator.resolvePackageRoot(PERMISSION_PACKAGE_NAME);
    expect(readPiExtensionPaths(root).some((entry) => entry.endsWith("src/index.ts"))).toBe(true);
  });

  test("resolves a staged packaged feature and refuses a missing package", () => {
    const resourcesRoot = mkdtempSync(path.join(tmpdir(), "pho-code-resources-"));
    const packageRoot = path.join(resourcesRoot, PACKAGED_FEATURES_DIR, ...PERMISSION_PACKAGE_NAME.split("/"));
    mkdirSync(path.join(packageRoot, "src"), { recursive: true });
    writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: PERMISSION_PACKAGE_NAME,
        version: "24.0.0",
        pi: { extensions: ["./src/index.ts"] },
      }),
    );
    writeFileSync(path.join(packageRoot, "src", "index.ts"), "export default function permission() {}\n");

    const locator = createPackagedResourceLocator(resourcesRoot);
    expect(locator.resolvePackageRoot(PERMISSION_PACKAGE_NAME)).toBe(packageRoot);

    writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: PERMISSION_PACKAGE_NAME,
        version: "23.0.0",
        pi: { extensions: ["./src/index.ts"] },
      }),
    );
    const mismatched = resolvePermissionFeature(locator);
    expect(mismatched.feature.extensionPaths).toEqual([]);
    expect(mismatched.diagnostics[0]?.message).toContain("expected 24.0.0");

    const missing = createPackagedResourceLocator(path.join(resourcesRoot, "empty"));
    expect(() => missing.resolvePackageRoot(PERMISSION_PACKAGE_NAME)).toThrow(/will not load it from global Pi packages/);
  });

  test("does not fall back to node_modules when a packaged feature is missing", () => {
    const resourcesRoot = mkdtempSync(path.join(tmpdir(), "pho-code-resources-"));
    const locator = createPackagedResourceLocator(resourcesRoot);
    expect(() => locator.resolvePackageRoot(PERMISSION_PACKAGE_NAME)).toThrow(/missing from/);
    const resolved = resolvePermissionFeature(locator);
    expect(resolved.feature.extensionPaths).toEqual([]);
    expect(resolved.diagnostics[0]?.type).toBe("error");
    expect(resolved.diagnostics[0]?.message).toContain("will not load it from global Pi packages");
    expect(createDefaultFeatureManifest(locator).features[0]?.expected?.extensions).toBe(1);
  });
});
