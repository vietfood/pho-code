import { describe, expect, test } from "bun:test";
import {
  adjacentSettingsSection,
  DEFAULT_SETTINGS_SECTION,
  initialSettingsSection,
  isSettingsSectionId,
  SETTINGS_SECTIONS,
} from "../src/lib/settings-section";

describe("settings sections", () => {
  test("lists appearance, accounts, github, skills, archived, permissions, and sandbox in a stable order", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      "appearance",
      "accounts",
      "github",
      "skills",
      "archived",
      "permissions",
      "sandbox",
    ]);
    expect(DEFAULT_SETTINGS_SECTION).toBe("appearance");
  });

  test("accepts only known section ids", () => {
    expect(isSettingsSectionId("accounts")).toBe(true);
    expect(isSettingsSectionId("github")).toBe(true);
    expect(isSettingsSectionId("skills")).toBe(true);
    expect(isSettingsSectionId("archived")).toBe(true);
    expect(isSettingsSectionId("diagnostics")).toBe(false);
  });

  test("opens accounts when a login flow is already active", () => {
    expect(initialSettingsSection({ flowActive: true })).toBe("accounts");
  });

  test("wraps arrow-key movement across the section list", () => {
    expect(adjacentSettingsSection("appearance", 1)).toBe("accounts");
    expect(adjacentSettingsSection("accounts", 1)).toBe("github");
    expect(adjacentSettingsSection("github", 1)).toBe("skills");
    expect(adjacentSettingsSection("permissions", 1)).toBe("sandbox");
    expect(adjacentSettingsSection("sandbox", 1)).toBe("appearance");
    expect(adjacentSettingsSection("appearance", -1)).toBe("sandbox");
    expect(adjacentSettingsSection("skills", 1)).toBe("archived");
  });
});
