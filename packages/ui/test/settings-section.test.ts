import { describe, expect, test } from "bun:test";
import {
  adjacentSettingsSection,
  DEFAULT_SETTINGS_SECTION,
  initialSettingsSection,
  isSettingsSectionId,
  SETTINGS_SECTIONS,
} from "../src/lib/settings-section";

describe("settings sections", () => {
  test("lists appearance, accounts, and permissions in a stable order", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual(["appearance", "accounts", "permissions"]);
    expect(DEFAULT_SETTINGS_SECTION).toBe("appearance");
  });

  test("accepts only known section ids", () => {
    expect(isSettingsSectionId("accounts")).toBe(true);
    expect(isSettingsSectionId("diagnostics")).toBe(false);
  });

  test("opens accounts when a login flow is already active", () => {
    expect(initialSettingsSection({ flowActive: true })).toBe("accounts");
  });

  test("wraps arrow-key movement across the section list", () => {
    expect(adjacentSettingsSection("appearance", 1)).toBe("accounts");
    expect(adjacentSettingsSection("permissions", 1)).toBe("appearance");
    expect(adjacentSettingsSection("appearance", -1)).toBe("permissions");
  });
});
