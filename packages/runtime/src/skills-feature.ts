import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessFeature } from "./features";
import { PACKAGED_FEATURES_DIR } from "./resource-locator";

export const CURATED_SKILLS_FEATURE_ID = "curated-coding-skills";
export const CURATED_SKILLS_FEATURE_VERSION = "1.0.0";
export const CURATED_SKILL_NAMES = [
  "repository-investigation",
  "bug-and-test-diagnosis",
  "change-review-and-recovery",
] as const;

const WORKSPACE_SKILLS_SEGMENTS = [
  "packages",
  "runtime",
  "features",
  "@pho-code",
  "curated-coding-skills",
  "skills",
] as const;

export function curatedSkillsRoot(fromHref = import.meta.url): string {
  const startDirectory = path.dirname(fileURLToPath(fromHref));
  const besideSource = path.resolve(startDirectory, "../features/@pho-code/curated-coding-skills/skills");
  if (skillsRootLooksValid(besideSource)) {
    return besideSource;
  }
  return findWorkspaceCuratedSkillsRoot(startDirectory) ?? besideSource;
}

export function resolveCuratedSkillsRoot(resourcesRoot?: string): string {
  if (resourcesRoot) {
    return path.join(
      path.resolve(resourcesRoot),
      PACKAGED_FEATURES_DIR,
      "@pho-code",
      "curated-coding-skills",
      "skills",
    );
  }
  return curatedSkillsRoot();
}

export function createCuratedSkillsFeature(_root = curatedSkillsRoot()): HarnessFeature {
  return {
    id: CURATED_SKILLS_FEATURE_ID,
    version: CURATED_SKILLS_FEATURE_VERSION,
    expected: { skills: 0 },
  };
}

function skillsRootLooksValid(root: string): boolean {
  return CURATED_SKILL_NAMES.every((name) => existsSync(path.join(root, name, "SKILL.md")));
}

function findWorkspaceCuratedSkillsRoot(startDirectory: string): string | undefined {
  let directory = path.resolve(startDirectory);
  while (true) {
    const candidate = path.join(directory, ...WORKSPACE_SKILLS_SEGMENTS);
    if (skillsRootLooksValid(candidate)) {
      return candidate;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}
