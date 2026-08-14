import { existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";
import {
  CURATED_SKILL_NAMES,
  createCuratedSkillsFeature,
  curatedSkillsRoot,
  resolveCuratedSkillsRoot,
} from "../src/skills-feature";

describe("curated skills root", () => {
  test("resolves the three source-tree SKILL.md files from runtime source", () => {
    const root = curatedSkillsRoot();
    for (const name of CURATED_SKILL_NAMES) {
      expect(existsSync(path.join(root, name, "SKILL.md"))).toBe(true);
    }
    expect(createCuratedSkillsFeature(root).expected?.skills).toBe(0);
    expect(createCuratedSkillsFeature(root).skillPaths).toBeUndefined();
  });

  test("finds the workspace skills when import.meta.url is a bundled Electron main file", () => {
    const bundledHref = pathToFileURL(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/desktop/out/main/main.js"),
    ).href;
    const root = curatedSkillsRoot(bundledHref);
    expect(existsSync(path.join(root, "repository-investigation", "SKILL.md"))).toBe(true);
    expect(root).toBe(curatedSkillsRoot());
  });

  test("packaged resourcesRoot does not fall back to the source tree", () => {
    const resourcesRoot = mkdtempSync(path.join(tmpdir(), "pho-code-resources-"));
    const root = resolveCuratedSkillsRoot(resourcesRoot);
    expect(root.startsWith(path.resolve(resourcesRoot))).toBe(true);
    expect(existsSync(path.join(root, "repository-investigation", "SKILL.md"))).toBe(false);
  });
});
