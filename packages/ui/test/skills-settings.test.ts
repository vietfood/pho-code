import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SKILL_TRUST_NOTICE, emptySkillSettingsSnapshot } from "@pho-code/protocol";
import { SkillsSettingsSection } from "../src/skills-settings";

describe("skills settings", () => {
  test("renders source toggles, inventory provenance, and the trust notice without paths", () => {
    const skills = emptySkillSettingsSnapshot();
    skills.inventory = [
      {
        sourceId: "pho-code",
        skillName: "repository-investigation",
        displayName: "repository-investigation",
        description: "Trace behavior from evidence.",
        compatibility: "compatible",
      },
      {
        sourceId: "cursor",
        skillName: "demo-skill",
        displayName: "demo-skill",
        compatibility: "shadowed",
        reason: "Hidden by Built in / repository-investigation.",
        shadowedBy: { sourceId: "pho-code", skillName: "repository-investigation" },
      },
    ];
    const markup = renderToStaticMarkup(
      createElement(SkillsSettingsSection, {
        skills,
        busy: false,
        onSourceChange: () => undefined,
        onRefresh: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="skill-settings"');
    expect(SKILL_TRUST_NOTICE.length).toBeGreaterThan(80);
    expect(markup).toContain('data-testid="skill-trust-disclosure-trigger"');
    expect(markup).toContain(SKILL_TRUST_NOTICE);
    expect(markup).toContain("Built in");
    expect(markup).toContain("~/.cursor/skills");
    expect(markup).toContain("Shadowed");
    expect(markup).toContain("Refresh");
    expect(markup).toContain('data-testid="skill-source-enabled-pho-code"');
    expect(markup).toContain("disabled");
    expect(markup).toContain('data-provider="openai-codex"');
    expect(markup).not.toContain("SKILL.md");
    expect(markup).not.toContain("skillDir");
  });
});
