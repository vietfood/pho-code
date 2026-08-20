import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { PERMISSION_PACKAGE_NAME, CURSOR_SDK_PACKAGE_NAME } from "../packages/runtime/src/features.ts";
import { createPackagedResourceLocator, readPiExtensionPaths } from "../packages/runtime/src/resource-locator.ts";
import { CURATED_SKILL_NAMES } from "../packages/runtime/src/skills-feature.ts";
import {
  generateThirdPartyNotices,
  stageBakedFeatureResources,
  stageGitHubMcpServer,
  stageRipgrep,
  stagedCuratedSkillsRoot,
  stagedCursorSdkPackageRoot,
} from "./stage-app-resources.ts";

describe("baked feature staging", () => {
  test("stages the permission package, Cursor SDK provider, and Pho Code skills without clearing by rm", () => {
    const resourcesRoot = mkdtempSync(path.join(tmpdir(), "pho-code-stage-"));
    const packageRoot = stageBakedFeatureResources(resourcesRoot);
    expect(existsSync(path.join(packageRoot, "LICENSE"))).toBe(true);
    expect(existsSync(path.join(packageRoot, "src", "index.ts"))).toBe(true);
    expect(existsSync(path.join(packageRoot, "node_modules", "zod", "package.json"))).toBe(true);
    expect(existsSync(path.join(packageRoot, "node_modules", "web-tree-sitter", "web-tree-sitter.wasm"))).toBe(true);
    expect(existsSync(path.join(packageRoot, "node_modules", "tree-sitter-bash", "tree-sitter-bash.wasm"))).toBe(true);

    const locator = createPackagedResourceLocator(resourcesRoot);
    expect(locator.resolvePackageRoot(PERMISSION_PACKAGE_NAME)).toBe(packageRoot);
    expect(readPiExtensionPaths(packageRoot).some((entry) => entry.endsWith("src/index.ts"))).toBe(true);

    const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as { version: string };
    expect(manifest.version).toBe("24.0.0");

    const cursorRoot = stagedCursorSdkPackageRoot(resourcesRoot);
    expect(locator.resolvePackageRoot(CURSOR_SDK_PACKAGE_NAME)).toBe(cursorRoot);
    expect(readPiExtensionPaths(cursorRoot).some((entry) => entry.endsWith("src/index.ts"))).toBe(true);
    expect(existsSync(path.join(cursorRoot, "node_modules", "@cursor", "sdk", "package.json"))).toBe(true);

    const skillsRoot = stagedCuratedSkillsRoot(resourcesRoot);
    for (const name of CURATED_SKILL_NAMES) {
      expect(existsSync(path.join(skillsRoot, name, "SKILL.md"))).toBe(true);
    }
  }, 30_000);

  test("notices name the pinned Pi, permission, and Cursor SDK packages", () => {
    const notices = generateThirdPartyNotices();
    expect(notices).toContain("@earendil-works/pi-coding-agent 0.84.1");
    expect(notices).toContain("@gotgenes/pi-permission-system 24.0.0");
    expect(notices).toContain("pi-cursor-sdk 0.2.0");
    expect(notices).toContain("@cursor/sdk 1.0.23");
    expect(notices).toContain("@modelcontextprotocol/sdk");
    expect(notices).toContain("@anthropic-ai/sandbox-runtime 0.0.73");
    expect(notices).toContain("Apache-2.0");
    expect(notices).toContain("ripgrep 15.2.0");
    expect(notices).toContain("Unlicense OR MIT");
    expect(notices).not.toContain("pi-sandbox");
    expect(notices).toContain("juicesharp ask-user questionnaire (adapted source)");
    expect(notices).toContain("@juicesharp/rpiv-ask-user-question");
    expect(notices).not.toMatch(/^## @juicesharp/m);
    expect(notices).toContain("MIT");
  });

  test("fails closed when a GitHub MCP archive hash does not match the pin", () => {
    const featuresRoot = mkdtempSync(path.join(tmpdir(), "pho-code-github-stage-"));
    const cacheDir = mkdtempSync(path.join(tmpdir(), "pho-code-github-cache-"));
    const asset = "mismatch.tar.gz";
    const archivePath = path.join(cacheDir, asset);
    writeFileSync(archivePath, "not-the-pinned-binary");
    expect(() =>
      stageGitHubMcpServer(featuresRoot, {
        required: true,
        archivePath,
      }),
    ).toThrow(/SHA-256 mismatch/);
  });

  test("fails closed when a ripgrep archive hash does not match the pin", () => {
    const featuresRoot = mkdtempSync(path.join(tmpdir(), "pho-code-rg-stage-"));
    const cacheDir = mkdtempSync(path.join(tmpdir(), "pho-code-rg-cache-"));
    const asset = "mismatch.tar.gz";
    const archivePath = path.join(cacheDir, asset);
    writeFileSync(archivePath, "not-the-pinned-binary");
    expect(() =>
      stageRipgrep(featuresRoot, {
        required: true,
        archivePath,
      }),
    ).toThrow(/SHA-256 mismatch/);
  });
});
