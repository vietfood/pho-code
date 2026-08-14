import { realpathSync } from "node:fs";
import { chmod, mkdir, symlink, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { SKILL_TRUST_NOTICE, isJsonSafeValue } from "@pho-code/protocol";
import {
  createSkillSourceRegistry,
  parseSkillFrontmatter,
  sanitizeEnabledSources,
} from "../src/skill-source";
import { CURATED_SKILL_NAMES, curatedSkillsRoot } from "../src/skills-feature";

async function makeHome(): Promise<{ home: string; pho: string }> {
  const home = await mkdtemp(path.join(tmpdir(), "pho-skills-"));
  const pho = path.join(home, "pho-skills");
  await mkdir(pho, { recursive: true });
  return { home, pho };
}

async function writeSkill(
  root: string,
  name: string,
  body: string,
  extra?: { script?: boolean; nest?: string },
): Promise<string> {
  const dir = path.join(root, extra?.nest ?? "", name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), body, "utf8");
  if (extra?.script) {
    const script = path.join(dir, "run.sh");
    await writeFile(script, "#!/bin/sh\necho hi\n", "utf8");
    await chmod(script, 0o755);
  }
  return dir;
}

const TEXT_SKILL = `---
name: demo-skill
description: A compatible text-only instruction skill for tests.
---

# Demo

Do not invent files.
`;

describe("skill frontmatter", () => {
  test("reads name and description", () => {
    expect(parseSkillFrontmatter(TEXT_SKILL)).toEqual({
      name: "demo-skill",
      description: "A compatible text-only instruction skill for tests.",
    });
  });

  test("rejects missing description", () => {
    expect(
      parseSkillFrontmatter(`---
name: only-name
---
`),
    ).toBeUndefined();
  });
});

describe("skill source registry", () => {
  test("loads exactly the three Pho Code skills and no scripts", async () => {
    const { home } = await makeHome();
    const root = curatedSkillsRoot();
    const registry = createSkillSourceRegistry({
      homedir: home,
      phoCodeSkillsRoot: root,
    });
    const snapshot = registry.snapshot();
    const builtIn = snapshot.inventory.filter((entry) => entry.sourceId === "pho-code");
    expect(builtIn.map((entry) => entry.skillName).sort()).toEqual([...CURATED_SKILL_NAMES].sort());
    expect(builtIn.every((entry) => entry.compatibility === "compatible")).toBe(true);
    expect(registry.effectiveSkillPaths()).toEqual([]);
    expect(snapshot.trustNotice).toBe(SKILL_TRUST_NOTICE);
    expect(isJsonSafeValue(snapshot)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/"skillDir"|SKILL\.md/u);
  });

  test("keeps external sources disabled until trusted and never mutates them", async () => {
    const { home, pho } = await makeHome();
    const cursorRoot = path.join(home, ".cursor", "skills");
    await writeSkill(cursorRoot, "demo-skill", TEXT_SKILL);
    const registry = createSkillSourceRegistry({
      homedir: home,
      phoCodeSkillsRoot: pho,
    });
    expect(registry.snapshot().sources.find((source) => source.sourceId === "cursor")?.enabled).toBe(false);
    expect(registry.effectiveSkillPaths()).toEqual([]);
    expect(registry.readSkillMarkdown("cursor", "demo-skill")).toBeUndefined();
    const enabled = registry.setSourceEnabled("cursor", true);
    expect(enabled.sources.find((source) => source.sourceId === "cursor")?.enabled).toBe(true);
    expect(registry.effectiveSkillPaths()).toEqual([realpathSync(path.join(cursorRoot, "demo-skill"))]);
    expect(registry.readSkillMarkdown("cursor", "demo-skill")).toContain("Do not invent files.");
    expect(registry.expandInsertedSkills("Use /cursor:demo-skill now.")).toContain("<<<pho-skill source=\"cursor\" name=\"demo-skill\">>>");
    const original = await Bun.file(path.join(cursorRoot, "demo-skill", "SKILL.md")).text();
    expect(original).toBe(TEXT_SKILL);
  });

  test("admits Codex .system nesting and rejects symlink escapes", async () => {
    const { home, pho } = await makeHome();
    const codexRoot = path.join(home, ".codex", "skills");
    await writeSkill(codexRoot, "system-review", TEXT_SKILL.replace("demo-skill", "system-review"), {
      nest: ".system",
    });
    const outside = await mkdtemp(path.join(tmpdir(), "pho-skills-escape-"));
    await writeSkill(outside, "escaped", TEXT_SKILL.replace("demo-skill", "escaped"));
    await mkdir(codexRoot, { recursive: true });
    await symlink(path.join(outside, "escaped"), path.join(codexRoot, "escaped"));

    const registry = createSkillSourceRegistry({
      homedir: home,
      phoCodeSkillsRoot: pho,
      enabledExternalSources: ["codex"],
    });
    const inventory = registry.snapshot().inventory.filter((entry) => entry.sourceId === "codex");
    expect(inventory.some((entry) => entry.skillName === "system-review" && entry.compatibility === "compatible")).toBe(
      true,
    );
    expect(inventory.find((entry) => entry.skillName === "escaped")?.compatibility).toBe("incompatible");
    expect(registry.effectiveSkillPaths()).toEqual([realpathSync(path.join(codexRoot, ".system", "system-review"))]);
  });

  test("marks executable-dependent skills limited and shadows colliding names", async () => {
    const { home, pho } = await makeHome();
    await writeSkill(pho, "shared-name", TEXT_SKILL.replace("demo-skill", "shared-name"));
    const cursorRoot = path.join(home, ".cursor", "skills");
    await writeSkill(cursorRoot, "shared-name", TEXT_SKILL.replace("demo-skill", "shared-name"));
    await writeSkill(cursorRoot, "scripted", TEXT_SKILL.replace("demo-skill", "scripted"), { script: true });

    const registry = createSkillSourceRegistry({
      homedir: home,
      phoCodeSkillsRoot: pho,
      enabledExternalSources: ["cursor"],
    });
    const snapshot = registry.snapshot();
    expect(snapshot.inventory.find((entry) => entry.sourceId === "pho-code" && entry.skillName === "shared-name")?.compatibility).toBe(
      "compatible",
    );
    expect(snapshot.inventory.find((entry) => entry.sourceId === "cursor" && entry.skillName === "shared-name")).toMatchObject({
      compatibility: "shadowed",
      shadowedBy: { sourceId: "pho-code", skillName: "shared-name" },
    });
    expect(snapshot.inventory.find((entry) => entry.skillName === "scripted")?.compatibility).toBe("limited");
    expect(registry.readSkillMarkdown("cursor", "scripted")).toContain("Do not invent files.");
    expect(registry.effectiveSkillPaths()).toEqual([]);
  });

  test("ignores arbitrary source ids", () => {
    expect(sanitizeEnabledSources(["cursor", "nope", "pho-code", "claude"])).toEqual(["cursor", "claude"]);
  });
});
