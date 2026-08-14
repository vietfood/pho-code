import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, type Dirent } from "node:fs";
import path from "node:path";
import {
  EXTERNAL_SKILL_SOURCE_IDS,
  MAX_SKILL_DESCRIPTION_CHARS,
  SKILL_SOURCE_IDS,
  SKILL_SOURCE_LABELS,
  SKILL_SOURCE_ROOT_LABELS,
  SKILL_TRUST_NOTICE,
  extractSkillTokens,
  isExternalSkillSourceId,
  isSkillSourceId,
  wrapSkillBody,
  type ExternalSkillSourceId,
  type SkillCompatibility,
  type SkillInventoryEntry,
  type SkillSettingsSnapshot,
  type SkillSourceId,
  type SkillSourceSummary,
} from "@pho-code/protocol";

export const MAX_SKILL_MARKDOWN_BYTES = 64 * 1024;
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
const AUXILIARY_EXTENSIONS = new Set([
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".bat",
  ".cmd",
  ".exe",
  ".bin",
  ".py",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
]);
const HARMLESS_NAMES = new Set(["license", "license.md", "licence", "readme", "readme.md", "changelog", "changelog.md"]);

export const SKILL_SOURCE_PRECEDENCE: readonly SkillSourceId[] = SKILL_SOURCE_IDS;

export interface SkillSourceRegistryOptions {
  homedir?: string;
  phoCodeSkillsRoot: string;
  enabledExternalSources?: readonly string[];
  now?: () => Date;
}

export interface NamedSkillBody {
  sourceId: SkillSourceId;
  skillName: string;
  markdown: string;
}

export interface SkillSourceRegistry {
  snapshot(): SkillSettingsSnapshot;
  effectiveSkillPaths(): string[];
  readSkillMarkdown(sourceId: SkillSourceId, skillName: string): string | undefined;
  loadNamedSkill(skillName: string, sourceId?: string): NamedSkillBody | undefined;
  expandInsertedSkills(text: string): string;
  setEnabledExternalSources(sourceIds: readonly string[]): ExternalSkillSourceId[];
  setSourceEnabled(sourceId: ExternalSkillSourceId, enabled: boolean): SkillSettingsSnapshot;
  refresh(): SkillSettingsSnapshot;
}

interface DiscoveredSkill {
  sourceId: SkillSourceId;
  skillName: string;
  displayName: string;
  description?: string;
  compatibility: Exclude<SkillCompatibility, "shadowed">;
  reason?: string;
  skillDir: string;
  markdown?: string;
}

export function defaultExternalSkillRoot(sourceId: ExternalSkillSourceId, home = homedir()): string {
  switch (sourceId) {
    case "codex":
      return path.join(home, ".codex", "skills");
    case "cursor":
      return path.join(home, ".cursor", "skills");
    case "claude":
      return path.join(home, ".claude", "skills");
    case "pi":
      return path.join(home, ".pi", "agent", "skills");
    default: {
      const exhaustive: never = sourceId;
      return exhaustive;
    }
  }
}

export function createSkillSourceRegistry(options: SkillSourceRegistryOptions): SkillSourceRegistry {
  const home = options.homedir ?? homedir();
  let enabled = sanitizeEnabledSources(options.enabledExternalSources ?? []);
  let discovered: DiscoveredSkill[] = [];
  let effectivePaths: string[] = [];
  let current: SkillSettingsSnapshot = {
    sources: [],
    inventory: [],
    trustNotice: SKILL_TRUST_NOTICE,
  };

  function sourceIsEnabled(sourceId: SkillSourceId): boolean {
    return sourceId === "pho-code" || enabled.includes(sourceId);
  }

  function readMarkdown(sourceId: SkillSourceId, skillName: string): string | undefined {
    if (!sourceIsEnabled(sourceId)) {
      return undefined;
    }
    const skill = discovered.find((entry) => entry.sourceId === sourceId && entry.skillName === skillName);
    return skill?.markdown;
  }

  function rescan(): SkillSettingsSnapshot {
    const scanned = scan(options.phoCodeSkillsRoot, home, enabled, options.now?.() ?? new Date());
    current = scanned.snapshot;
    discovered = scanned.discovered;
    effectivePaths = scanned.effectivePaths;
    return current;
  }

  current = rescan();

  const registry: SkillSourceRegistry = {
    snapshot() {
      return current;
    },
    effectiveSkillPaths() {
      return [...effectivePaths];
    },
    readSkillMarkdown(sourceId, skillName) {
      return readMarkdown(sourceId, skillName);
    },
    loadNamedSkill(skillName, sourceId) {
      if (sourceId !== undefined) {
        if (!isSkillSourceId(sourceId)) {
          return undefined;
        }
        const markdown = readMarkdown(sourceId, skillName);
        return markdown ? { sourceId, skillName, markdown } : undefined;
      }
      for (const candidate of SKILL_SOURCE_PRECEDENCE) {
        const markdown = readMarkdown(candidate, skillName);
        if (markdown) {
          return { sourceId: candidate, skillName, markdown };
        }
      }
      return undefined;
    },
    expandInsertedSkills(text) {
      const blocks: string[] = [];
      for (const token of extractSkillTokens(text)) {
        const markdown = readMarkdown(token.sourceId, token.skillName);
        if (!markdown) {
          continue;
        }
        blocks.push(wrapSkillBody(token.sourceId, token.skillName, markdown));
      }
      if (blocks.length === 0) {
        return text;
      }
      return `${text}\n\n${blocks.join("\n\n")}`;
    },
    setEnabledExternalSources(sourceIds) {
      enabled = sanitizeEnabledSources(sourceIds);
      rescan();
      return enabled;
    },
    setSourceEnabled(sourceId, enabledFlag) {
      const next = new Set(enabled);
      if (enabledFlag) {
        next.add(sourceId);
      } else {
        next.delete(sourceId);
      }
      enabled = sanitizeEnabledSources([...next]);
      return rescan();
    },
    refresh() {
      return rescan();
    },
  };
  return registry;
}

function scan(
  phoCodeSkillsRoot: string,
  home: string,
  enabled: readonly ExternalSkillSourceId[],
  now: Date,
): { snapshot: SkillSettingsSnapshot; effectivePaths: string[]; discovered: DiscoveredSkill[] } {
  const discovered: DiscoveredSkill[] = [
    ...discoverSource("pho-code", phoCodeSkillsRoot, [{ relative: ".", system: false }]),
  ];
  for (const sourceId of EXTERNAL_SKILL_SOURCE_IDS) {
    const layouts = sourceId === "codex"
      ? [
          { relative: ".", system: false },
          { relative: ".system", system: true },
        ]
      : [{ relative: ".", system: false }];
    discovered.push(...discoverSource(sourceId, defaultExternalSkillRoot(sourceId, home), layouts));
  }

  const winners = new Map<string, DiscoveredSkill>();
  for (const sourceId of SKILL_SOURCE_PRECEDENCE) {
    for (const skill of discovered) {
      if (skill.sourceId !== sourceId || winners.has(skill.skillName)) {
        continue;
      }
      if (skill.compatibility !== "compatible") {
        continue;
      }
      if (skill.sourceId !== "pho-code" && !enabled.includes(skill.sourceId)) {
        continue;
      }
      winners.set(skill.skillName, skill);
    }
  }

  const inventory: SkillInventoryEntry[] = discovered.map((skill) => {
    const winner = winners.get(skill.skillName);
    const enabledSource = skill.sourceId === "pho-code" || enabled.includes(skill.sourceId);
    if (!enabledSource && skill.sourceId !== "pho-code") {
      return toEntry(skill);
    }
    if (
      winner &&
      (winner.sourceId !== skill.sourceId || winner.skillDir !== skill.skillDir) &&
      skill.compatibility === "compatible"
    ) {
      return {
        ...toEntry(skill),
        compatibility: "shadowed",
        reason: `Hidden by ${SKILL_SOURCE_LABELS[winner.sourceId]} / ${winner.skillName}.`,
        shadowedBy: { sourceId: winner.sourceId, skillName: winner.skillName },
      };
    }
    return toEntry(skill);
  });

  const sources: SkillSourceSummary[] = SKILL_SOURCE_IDS.map((sourceId) => {
    const owned = inventory.filter((entry) => entry.sourceId === sourceId);
    const root = sourceId === "pho-code" ? phoCodeSkillsRoot : defaultExternalSkillRoot(sourceId, home);
    return {
      sourceId,
      label: SKILL_SOURCE_LABELS[sourceId],
      rootLabel: SKILL_SOURCE_ROOT_LABELS[sourceId],
      enabled: sourceId === "pho-code" || enabled.includes(sourceId),
      available: sourceId === "pho-code" ? existsSync(phoCodeSkillsRoot) : existsSync(root),
      skillCount: owned.length,
      compatibleCount: owned.filter((entry) => entry.compatibility === "compatible").length,
    };
  });

  return {
    snapshot: {
      sources,
      inventory,
      trustNotice: SKILL_TRUST_NOTICE,
      refreshedAt: now.toISOString(),
    },
    effectivePaths: [...winners.values()]
      .filter((skill) => skill.sourceId !== "pho-code")
      .map((skill) => skill.skillDir),
    discovered,
  };
}

function toEntry(skill: DiscoveredSkill): SkillInventoryEntry {
  return {
    sourceId: skill.sourceId,
    skillName: skill.skillName,
    displayName: skill.displayName,
    ...(skill.description ? { description: skill.description } : {}),
    compatibility: skill.compatibility,
    ...(skill.reason ? { reason: skill.reason } : {}),
  };
}

function discoverSource(
  sourceId: SkillSourceId,
  root: string,
  layouts: readonly { relative: string; system: boolean }[],
): DiscoveredSkill[] {
  const skills: DiscoveredSkill[] = [];
  if (!existsSync(root)) {
    return skills;
  }
  let rootReal: string;
  try {
    rootReal = realpathSync(root);
  } catch {
    return skills;
  }
  const seen = new Set<string>();
  for (const layout of layouts) {
    const parent = path.resolve(root, layout.relative);
    if (!existsSync(parent)) {
      continue;
    }
    let entries: Dirent[];
    try {
      entries = readdirSync(parent, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && !(layout.system && entry.name === ".system")) {
        if (layout.relative === "." && entry.name === ".system") {
          continue;
        }
        if (entry.name.startsWith(".")) {
          continue;
        }
      }
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }
      if (!SKILL_NAME_PATTERN.test(entry.name)) {
        continue;
      }
      const skillDir = path.join(parent, entry.name);
      const admitted = admitSkill(sourceId, rootReal, skillDir, entry.name);
      if (!admitted) {
        continue;
      }
      const key = admitted.skillDir;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      skills.push(admitted);
    }
  }
  return skills;
}

function admitSkill(
  sourceId: SkillSourceId,
  rootReal: string,
  skillDir: string,
  directoryName: string,
): DiscoveredSkill | undefined {
  let dirStat;
  try {
    dirStat = lstatSync(skillDir);
  } catch {
    return undefined;
  }
  let resolvedDir: string;
  try {
    resolvedDir = realpathSync(skillDir);
  } catch {
    return {
      sourceId,
      skillName: directoryName,
      displayName: directoryName,
      compatibility: "incompatible",
      reason: "The skill directory could not be resolved.",
      skillDir,
    };
  }
  if (!isInsideRoot(rootReal, resolvedDir)) {
    return {
      sourceId,
      skillName: directoryName,
      displayName: directoryName,
      compatibility: "incompatible",
      reason: "The skill path escapes the enabled source root.",
      skillDir,
    };
  }
  if (dirStat.isSymbolicLink() && !isInsideRoot(rootReal, resolvedDir)) {
    return {
      sourceId,
      skillName: directoryName,
      displayName: directoryName,
      compatibility: "incompatible",
      reason: "The skill path escapes the enabled source root.",
      skillDir,
    };
  }

  const skillFile = path.join(skillDir, "SKILL.md");
  if (!existsSync(skillFile)) {
    return undefined;
  }
  let fileStat;
  try {
    fileStat = lstatSync(skillFile);
  } catch {
    return undefined;
  }
  let resolvedFile: string;
  try {
    resolvedFile = realpathSync(skillFile);
  } catch {
    return {
      sourceId,
      skillName: directoryName,
      displayName: directoryName,
      compatibility: "incompatible",
      reason: "SKILL.md could not be resolved.",
      skillDir,
    };
  }
  if (fileStat.isSymbolicLink() && !isInsideRoot(rootReal, resolvedFile)) {
    return {
      sourceId,
      skillName: directoryName,
      displayName: directoryName,
      compatibility: "incompatible",
      reason: "SKILL.md escapes the enabled source root.",
      skillDir,
    };
  }
  if (!fileStat.isFile() && !fileStat.isSymbolicLink()) {
    return undefined;
  }
  if (fileStat.size > MAX_SKILL_MARKDOWN_BYTES) {
    return {
      sourceId,
      skillName: directoryName,
      displayName: directoryName,
      compatibility: "incompatible",
      reason: "SKILL.md is larger than 64 KiB.",
      skillDir,
    };
  }

  let markdown: string;
  try {
    const bytes = readFileSync(skillFile);
    if (bytes.includes(0)) {
      return {
        sourceId,
        skillName: directoryName,
        displayName: directoryName,
        compatibility: "incompatible",
        reason: "SKILL.md is not UTF-8 text.",
        skillDir,
      };
    }
    markdown = bytes.toString("utf8");
  } catch {
    return {
      sourceId,
      skillName: directoryName,
      displayName: directoryName,
      compatibility: "incompatible",
      reason: "SKILL.md could not be read.",
      skillDir,
    };
  }

  const parsed = parseSkillFrontmatter(markdown);
  if (!parsed) {
    return {
      sourceId,
      skillName: directoryName,
      displayName: directoryName,
      compatibility: "incompatible",
      reason: "SKILL.md needs YAML frontmatter with name and description.",
      skillDir,
    };
  }

  const auxiliary = skillRequiresAuxiliaryAssets(skillDir);
  const description = parsed.description.slice(0, MAX_SKILL_DESCRIPTION_CHARS);
  return {
    sourceId,
    skillName: directoryName,
    displayName: parsed.name || directoryName,
    description,
    compatibility: auxiliary ? "limited" : "compatible",
    ...(auxiliary
      ? { reason: "This skill includes scripts or assets. Pho Code loads Markdown instructions only." }
      : {}),
    skillDir: resolvedDir,
    markdown,
  };
}

function skillRequiresAuxiliaryAssets(skillDir: string): boolean {
  let entries: Dirent[];
  try {
    entries = readdirSync(skillDir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.name === "SKILL.md") {
      continue;
    }
    if (entry.name.startsWith(".")) {
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (HARMLESS_NAMES.has(lower)) {
      continue;
    }
    if (entry.isDirectory()) {
      return true;
    }
    const extension = path.extname(lower);
    if (AUXILIARY_EXTENSIONS.has(extension)) {
      return true;
    }
    try {
      const stat = lstatSync(path.join(skillDir, entry.name));
      if ((stat.mode & 0o111) !== 0) {
        return true;
      }
    } catch {
      return true;
    }
  }
  return false;
}

export function parseSkillFrontmatter(markdown: string): { name: string; description: string } | undefined {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match?.[1]) {
    return undefined;
  }
  const name = scalarField(match[1], "name");
  const description = scalarField(match[1], "description");
  if (!name || !description) {
    return undefined;
  }
  return { name, description };
}

function scalarField(frontmatter: string, field: string): string | undefined {
  const pattern = new RegExp(`^${field}\\s*:\\s*(.*)$`, "mu");
  const match = frontmatter.match(pattern);
  if (!match) {
    return undefined;
  }
  let value = match[1]?.trim() ?? "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  value = value.trim();
  return value.length > 0 ? value : undefined;
}

function isInsideRoot(rootReal: string, candidate: string): boolean {
  const relative = path.relative(rootReal, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function sanitizeEnabledSources(values: readonly string[]): ExternalSkillSourceId[] {
  const seen = new Set<ExternalSkillSourceId>();
  for (const value of values) {
    if (isExternalSkillSourceId(value)) {
      seen.add(value);
    }
  }
  return EXTERNAL_SKILL_SOURCE_IDS.filter((sourceId) => seen.has(sourceId));
}

export function skillIdentityHash(sourceId: SkillSourceId, skillName: string, canonicalPath: string): string {
  return createHash("sha256").update(`${sourceId}\0${skillName}\0${canonicalPath}`).digest("hex").slice(0, 16);
}
