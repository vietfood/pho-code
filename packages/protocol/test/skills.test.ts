import { describe, expect, test } from "bun:test";
import {
  availableAgentSkills,
  availableSlashSkills,
  emptySkillSettingsSnapshot,
  extractSkillTokens,
  findCompletedSkillTokens,
  formatSkillToken,
  skillNeedsCompatibilityNotice,
  SKILL_TRUST_NOTICE,
  sourceCompatibilityWarnings,
  stripExpandedSkillBodies,
  wrapSkillBody,
} from "../src/skills";

describe("skill tokens", () => {
  test("formats and extracts source-qualified slash tokens", () => {
    expect(formatSkillToken("pho-code", "repository-investigation")).toBe(
      "/pho-code:repository-investigation",
    );
    const text = "Use /pho-code:repository-investigation and /cursor:demo-skill please.";
    expect(extractSkillTokens(text)).toEqual([
      { sourceId: "pho-code", skillName: "repository-investigation" },
      { sourceId: "cursor", skillName: "demo-skill" },
    ]);
    expect(findCompletedSkillTokens("https://example.com/pho-code:nope")).toEqual([]);
  });

  test("wraps and strips expanded skill bodies without dropping the insert token", () => {
    const token = formatSkillToken("codex", "demo-skill");
    const expanded = `${token}\n\n${wrapSkillBody("codex", "demo-skill", "# Demo\n\nDo the work.")}`;
    expect(stripExpandedSkillBodies(expanded)).toBe(token);
  });
});

describe("skill trust notice", () => {
  test("says the agent can load enabled skills without a slash insert", () => {
    expect(SKILL_TRUST_NOTICE).toContain("to the agent");
    expect(SKILL_TRUST_NOTICE).toContain("names and descriptions");
    expect(SKILL_TRUST_NOTICE).not.toContain("until you insert one or ask");
  });
});

describe("slash availability", () => {
  test("lists every skill from enabled sources, including limited ones", () => {
    const snapshot = emptySkillSettingsSnapshot();
    snapshot.sources = snapshot.sources.map((source) =>
      source.sourceId === "cursor" ? { ...source, enabled: true } : source,
    );
    snapshot.inventory = [
      {
        sourceId: "pho-code",
        skillName: "repository-investigation",
        displayName: "repository-investigation",
        compatibility: "compatible",
      },
      {
        sourceId: "cursor",
        skillName: "scripted",
        displayName: "scripted",
        compatibility: "limited",
        reason: "scripts",
      },
      {
        sourceId: "claude",
        skillName: "hidden",
        displayName: "hidden",
        compatibility: "compatible",
      },
    ];
    expect(availableSlashSkills(snapshot).map((entry) => entry.skillName)).toEqual([
      "repository-investigation",
      "scripted",
    ]);
    expect(availableSlashSkills(snapshot, "script").map((entry) => entry.skillName)).toEqual(["scripted"]);
    expect(sourceCompatibilityWarnings(snapshot, "cursor")).toHaveLength(1);
    expect(skillNeedsCompatibilityNotice("limited")).toBe(true);
    expect(skillNeedsCompatibilityNotice("compatible")).toBe(false);
  });

  test("advertises compatible and limited skills to the agent, not slash-only or shadowed", () => {
    const snapshot = emptySkillSettingsSnapshot();
    snapshot.inventory = [
      {
        sourceId: "pho-code",
        skillName: "repository-investigation",
        displayName: "repository-investigation",
        compatibility: "compatible",
      },
      {
        sourceId: "cursor",
        skillName: "scripted",
        displayName: "scripted",
        compatibility: "limited",
      },
      {
        sourceId: "cursor",
        skillName: "slash-only",
        displayName: "slash-only",
        compatibility: "compatible",
        disableModelInvocation: true,
      },
      {
        sourceId: "claude",
        skillName: "hidden",
        displayName: "hidden",
        compatibility: "shadowed",
      },
    ];
    expect(availableAgentSkills(snapshot).map((entry) => entry.skillName)).toEqual([
      "repository-investigation",
      "scripted",
    ]);
  });
});
