import { describe, expect, test } from "bun:test";
import { emptySettingsSnapshot } from "@pho-code/protocol";
import {
  looksLikeProjectTrustNotification,
  projectPermissionTrustPending,
} from "../src/lib/project-permission-trust";

describe("project permission trust presentation", () => {
  test("is pending when the live project is untrusted", () => {
    const idle = emptySettingsSnapshot().permission;
    expect(projectPermissionTrustPending(undefined)).toBe(false);
    expect(projectPermissionTrustPending(idle)).toBe(true);
    expect(
      projectPermissionTrustPending({
        ...idle,
        projectPermissionRulesTrusted: true,
      }),
    ).toBe(false);
  });

  test("is pending when a project override is present and not remembered", () => {
    const idle = emptySettingsSnapshot().permission;
    expect(
      projectPermissionTrustPending({
        ...idle,
        projectOverridePresent: true,
        projectPermissionRulesTrusted: true,
      }),
    ).toBe(true);
    expect(
      projectPermissionTrustPending({
        ...idle,
        projectOverridePresent: true,
        projectPermissionRulesTrusted: true,
        projectPermissionRulesRemembered: true,
      }),
    ).toBe(false);
  });

  test("recognizes the permission-system untrusted notification", () => {
    expect(
      looksLikeProjectTrustNotification(
        "pi-permission-system: project is not trusted — skipping project-scoped permission configuration. Only global policy applies. Grant project trust to load this project's permission rules.",
      ),
    ).toBe(true);
    expect(looksLikeProjectTrustNotification("Confirm accepted")).toBe(false);
  });
});
