export const SKILL_SOURCE_IDS = ["pho-code", "codex", "cursor", "claude", "pi"] as const;

export type SkillSourceId = (typeof SKILL_SOURCE_IDS)[number];

export const EXTERNAL_SKILL_SOURCE_IDS = ["codex", "cursor", "claude", "pi"] as const;

export type ExternalSkillSourceId = (typeof EXTERNAL_SKILL_SOURCE_IDS)[number];

export const SKILL_COMPATIBILITY_STATES = ["compatible", "limited", "incompatible", "shadowed"] as const;

export type SkillCompatibility = (typeof SKILL_COMPATIBILITY_STATES)[number];

export const SKILL_SOURCE_LABELS: Record<SkillSourceId, string> = {
  "pho-code": "Built in",
  codex: "Codex",
  cursor: "Cursor",
  claude: "Claude",
  pi: "Pi",
};

export const SKILL_SOURCE_ROOT_LABELS: Record<SkillSourceId, string> = {
  "pho-code": "Pho Code",
  codex: "~/.codex/skills",
  cursor: "~/.cursor/skills",
  claude: "~/.claude/skills",
  pi: "~/.pi/agent/skills",
};

export const SKILL_TRUST_NOTICE =
  "Skills are instructions, not a sandbox. Enabling a source makes all of its skills available to insert with /. They are not added to the model until you insert one or ask for it by name. Existing permission, workspace, and remote-effect policy still gates tools, but it does not validate the instructions.";

export const MAX_SKILL_DESCRIPTION_CHARS = 240;

export const SKILL_BODY_OPEN = "<<<pho-skill";
export const SKILL_BODY_CLOSE = "<<<end-pho-skill>>>";

const SKILL_TOKEN_BOUNDARY = /[\s([{]/u;
const COMPLETED_SKILL_TOKEN = /^(pho-code|codex|cursor|claude|pi):([a-z0-9][a-z0-9-]*)/u;
const SKILL_BODY_BLOCK = /\n*<<<pho-skill\b[\s\S]*?<<<end-pho-skill>>>\s*/gu;

export interface CompletedSkillToken {
  sourceId: SkillSourceId;
  skillName: string;
  start: number;
  end: number;
}

export interface SkillShadowRef {
  sourceId: SkillSourceId;
  skillName: string;
}

export interface SkillInventoryEntry {
  sourceId: SkillSourceId;
  skillName: string;
  displayName: string;
  description?: string;
  compatibility: SkillCompatibility;
  reason?: string;
  shadowedBy?: SkillShadowRef;
}

export interface SkillSourceSummary {
  sourceId: SkillSourceId;
  label: string;
  rootLabel: string;
  enabled: boolean;
  available: boolean;
  skillCount: number;
  compatibleCount: number;
}

export interface SkillSettingsSnapshot {
  sources: SkillSourceSummary[];
  inventory: SkillInventoryEntry[];
  trustNotice: string;
  refreshedAt?: string;
}

export interface UpdateSkillSourceSettingsInput {
  sourceId: ExternalSkillSourceId;
  enabled: boolean;
}

export function isSkillSourceId(value: unknown): value is SkillSourceId {
  return typeof value === "string" && (SKILL_SOURCE_IDS as readonly string[]).includes(value);
}

export function isExternalSkillSourceId(value: unknown): value is ExternalSkillSourceId {
  return typeof value === "string" && (EXTERNAL_SKILL_SOURCE_IDS as readonly string[]).includes(value);
}

export function isSkillCompatibility(value: unknown): value is SkillCompatibility {
  return typeof value === "string" && (SKILL_COMPATIBILITY_STATES as readonly string[]).includes(value);
}

export function emptySkillSettingsSnapshot(): SkillSettingsSnapshot {
  return {
    sources: SKILL_SOURCE_IDS.map((sourceId) => ({
      sourceId,
      label: SKILL_SOURCE_LABELS[sourceId],
      rootLabel: SKILL_SOURCE_ROOT_LABELS[sourceId],
      enabled: sourceId === "pho-code",
      available: sourceId === "pho-code",
      skillCount: 0,
      compatibleCount: 0,
    })),
    inventory: [],
    trustNotice: SKILL_TRUST_NOTICE,
  };
}

export function formatSkillToken(sourceId: SkillSourceId, skillName: string): string {
  return `/${sourceId}:${skillName}`;
}

export function findCompletedSkillTokens(text: string): CompletedSkillToken[] {
  const matches: CompletedSkillToken[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "/") {
      continue;
    }
    if (index > 0 && !SKILL_TOKEN_BOUNDARY.test(text[index - 1] ?? "")) {
      continue;
    }
    const consumed = COMPLETED_SKILL_TOKEN.exec(text.slice(index + 1));
    const sourceId = consumed?.[1];
    const skillName = consumed?.[2];
    if (!consumed || !isSkillSourceId(sourceId) || !skillName) {
      continue;
    }
    const end = index + 1 + consumed[0].length;
    matches.push({ sourceId, skillName, start: index, end });
    index = end - 1;
  }
  return matches;
}

export function extractSkillTokens(text: string): Array<{ sourceId: SkillSourceId; skillName: string }> {
  const tokens: Array<{ sourceId: SkillSourceId; skillName: string }> = [];
  const seen = new Set<string>();
  for (const match of findCompletedSkillTokens(text)) {
    const key = `${match.sourceId}:${match.skillName}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tokens.push({ sourceId: match.sourceId, skillName: match.skillName });
  }
  return tokens;
}

export function wrapSkillBody(sourceId: SkillSourceId, skillName: string, markdown: string): string {
  return `${SKILL_BODY_OPEN} source="${sourceId}" name="${skillName}">>>\n${markdown.trim()}\n${SKILL_BODY_CLOSE}`;
}

export function stripExpandedSkillBodies(text: string): string {
  return text.replace(SKILL_BODY_BLOCK, "\n").replace(/\n{3,}/gu, "\n\n").trimEnd();
}

export function skillNeedsCompatibilityNotice(compatibility: SkillCompatibility): boolean {
  return compatibility === "limited" || compatibility === "incompatible";
}

export function availableSlashSkills(
  snapshot: SkillSettingsSnapshot,
  query = "",
): SkillInventoryEntry[] {
  const enabled = new Set(
    snapshot.sources.filter((source) => source.enabled).map((source) => source.sourceId),
  );
  const needle = query.trim().toLowerCase();
  return snapshot.inventory.filter((entry) => {
    if (!enabled.has(entry.sourceId)) {
      return false;
    }
    if (needle === "") {
      return true;
    }
    const haystack = [
      entry.skillName,
      entry.displayName,
      entry.sourceId,
      SKILL_SOURCE_LABELS[entry.sourceId],
      entry.description ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function sourceCompatibilityWarnings(
  snapshot: SkillSettingsSnapshot,
  sourceId: SkillSourceId,
): SkillInventoryEntry[] {
  return snapshot.inventory.filter(
    (entry) => entry.sourceId === sourceId && skillNeedsCompatibilityNotice(entry.compatibility),
  );
}
