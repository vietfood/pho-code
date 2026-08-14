import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CHAT_FONT_SIZE,
  DEFAULT_GLASS_ENABLED,
  DEFAULT_GLASS_STRENGTH,
  DEFAULT_UI_FONT_SIZE,
  HARNESS_ERROR_CODES,
  PINNED_ELECTRON,
  emptySettingsSnapshot,
  isJsonSafeValue,
} from "@pho-code/protocol";
import { createDisposableStubHarnessRuntime, type HarnessRuntime } from "@pho-code/runtime";
import { createApplicationService, createMemoryMetadataStore, parseMetadata } from "../src/index";

function createTestApplication(runtime: HarnessRuntime = createDisposableStubHarnessRuntime()) {
  const appearances: Array<{ palette: string; mode: string; glassEnabled: boolean; glassStrength: number }> = [];
  const application = createApplicationService({
    runtime,
    versions: {
      electron: PINNED_ELECTRON.version,
      embeddedNode: "24.18.1",
    },
    metadataStore: createMemoryMetadataStore(),
    appearanceHost: {
      applyAppearance(appearance) {
        appearances.push(appearance);
      },
    },
  });
  return { application, appearances };
}

describe("application settings", () => {
  test("migrates v1 metadata to default palette with system mode and glass defaults", () => {
    const migrated = parseMetadata({
      version: 1,
      recentWorkspaces: [
        {
          id: "/tmp/ws",
          path: "/tmp/ws",
          displayName: "ws",
          lastOpenedAt: "2026-08-13T00:00:00.000Z",
        },
      ],
    });
    expect(migrated.version).toBe(6);
    expect(migrated.palette).toBe("default");
    expect(migrated.mode).toBe("system");
    expect(migrated.glassEnabled).toBe(DEFAULT_GLASS_ENABLED);
    expect(migrated.glassStrength).toBe(DEFAULT_GLASS_STRENGTH);
    expect(migrated.uiFontSize).toBe(DEFAULT_UI_FONT_SIZE);
    expect(migrated.chatFontSize).toBe(DEFAULT_CHAT_FONT_SIZE);
    expect(migrated.githubMcpEnabled).toBe(false);
    expect(migrated.recentWorkspaces).toHaveLength(1);
  });

  test("migrates v3 theme field into default palette mode", () => {
    const migrated = parseMetadata({
      version: 3,
      recentWorkspaces: [],
      theme: "dark",
      uiFontSize: 16,
      chatFontSize: 14,
      trustedPermissionWorkspaceIds: [],
    });
    expect(migrated.palette).toBe("default");
    expect(migrated.mode).toBe("dark");
  });

  test("coerces one-dark with light mode to dark", () => {
    const migrated = parseMetadata({
      version: 4,
      recentWorkspaces: [],
      palette: "one-dark",
      mode: "light",
      trustedPermissionWorkspaceIds: [],
    });
    expect(migrated.palette).toBe("one-dark");
    expect(migrated.mode).toBe("dark");
  });

  test("persists appearance independently of permission settings", async () => {
    const { application, appearances } = createTestApplication();
    expect(application.getSettings().appearance.palette).toBe("default");
    expect(application.getSettings().appearance.mode).toBe("system");
    expect(application.getSettings().appearance.uiFontSize).toBe(DEFAULT_UI_FONT_SIZE);
    expect(application.getSettings().appearance.chatFontSize).toBe(DEFAULT_CHAT_FONT_SIZE);
    const updated = await application.updateAppearanceSettings({ mode: "dark", palette: "gruvbox" });
    expect(updated.appearance.palette).toBe("gruvbox");
    expect(updated.appearance.mode).toBe("dark");
    expect(application.getSettings().appearance.palette).toBe("gruvbox");
    expect(appearances.at(-1)).toMatchObject({ palette: "gruvbox", mode: "dark" });
    expect(isJsonSafeValue(updated)).toBe(true);
  });

  test("persists UI and chat font sizes without changing palette", async () => {
    const { application, appearances } = createTestApplication();
    const updated = await application.updateAppearanceSettings({ uiFontSize: 18, chatFontSize: 16 });
    expect(updated.appearance).toEqual({
      palette: "default",
      mode: "system",
      glassEnabled: DEFAULT_GLASS_ENABLED,
      glassStrength: DEFAULT_GLASS_STRENGTH,
      uiFontSize: 18,
      chatFontSize: 16,
    });
    expect(application.getSettings().appearance.uiFontSize).toBe(18);
    expect(application.getSettings().appearance.chatFontSize).toBe(16);
    expect(appearances).toHaveLength(2);
  });

  test("persists glass settings", async () => {
    const { application, appearances } = createTestApplication();
    const updated = await application.updateAppearanceSettings({ glassEnabled: true, glassStrength: 80 });
    expect(updated.appearance.glassEnabled).toBe(true);
    expect(updated.appearance.glassStrength).toBe(80);
    expect(appearances.at(-1)).toMatchObject({ glassEnabled: true, glassStrength: 80 });
  });

  test("rejects an empty API key before calling the runtime", async () => {
    const { application } = createTestApplication();
    await expect(application.importProviderApiKey({ providerId: "deepseek", apiKey: "  " })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
  });

  test("rejects empty provider-auth identifiers before calling the runtime", async () => {
    const { application } = createTestApplication();
    await expect(application.startProviderLogin({ providerId: "  ", method: "oauth" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    await expect(
      application.respondProviderAuthPrompt({ flowId: "  ", promptId: "prompt", value: "x" }),
    ).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
  });

  test("refuses a prompt snapshot that echoes the submitted secret", async () => {
    const secret = "super-secret-login-code";
    const runtime: HarnessRuntime = {
      ...createDisposableStubHarnessRuntime(),
      respondProviderAuthPrompt() {
        return Promise.resolve({
          flowId: "flow-1",
          providerId: "pho-test-oauth",
          method: "oauth",
          phase: "awaiting_external",
          revision: 2,
          startedAt: "2026-08-13T00:00:00.000Z",
          updatedAt: "2026-08-13T00:00:01.000Z",
          progress: secret,
        });
      },
    };
    const { application } = createTestApplication(runtime);
    await expect(
      application.respondProviderAuthPrompt({ flowId: "flow-1", promptId: "prompt-1", value: secret }),
    ).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidSnapshot,
    });
  });

  test("rejects an unknown palette", async () => {
    const { application } = createTestApplication();
    await expect(application.updateAppearanceSettings({ palette: "sepia" as "default" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
  });

  test("rejects out-of-range font sizes", async () => {
    const { application } = createTestApplication();
    await expect(application.updateAppearanceSettings({ uiFontSize: 11 })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    await expect(application.updateAppearanceSettings({ chatFontSize: 21 })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
  });

  test("rejects an empty appearance patch", async () => {
    const { application } = createTestApplication();
    await expect(application.updateAppearanceSettings({})).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
  });

  test("persists enabled external skill sources without copying pho-code", async () => {
    let current = emptySettingsSnapshot().skills;
    const runtime: HarnessRuntime = {
      ...createDisposableStubHarnessRuntime(),
      getSkillSettings() {
        return current;
      },
      setEnabledSkillSources(sourceIds) {
        current = {
          ...current,
          sources: current.sources.map((source) => ({
            ...source,
            enabled: source.sourceId === "pho-code" || sourceIds.includes(source.sourceId),
          })),
        };
        return current;
      },
      updateSkillSourceSettings(input) {
        current = {
          ...current,
          sources: current.sources.map((source) =>
            source.sourceId === input.sourceId ? { ...source, enabled: input.enabled } : source,
          ),
        };
        return Promise.resolve(current);
      },
    };
    const { application } = createTestApplication(runtime);
    const updated = await application.updateSkillSourceSettings({ sourceId: "cursor", enabled: true });
    expect(updated.skills.sources.find((source) => source.sourceId === "cursor")?.enabled).toBe(true);
    expect(updated.skills.sources.find((source) => source.sourceId === "pho-code")?.enabled).toBe(true);
    expect(isJsonSafeValue(updated)).toBe(true);
    expect(JSON.stringify(updated.skills)).not.toContain("/Users/");
  });

  test("persists GitHub MCP enabled without copying a token", async () => {
    const canary = "github_pat_application_canary";
    let github = emptySettingsSnapshot().githubMcp;
    const runtime: HarnessRuntime = {
      ...createDisposableStubHarnessRuntime(),
      getGitHubMcpSettings() {
        return github;
      },
      updateGitHubMcpSettings(input) {
        github = { ...github, enabled: input.enabled, status: input.enabled ? "needs_auth" : "disabled" };
        return Promise.resolve(github);
      },
      importGitHubPat() {
        github = { ...github, account: { patConfigured: true, authMethod: "pat" } };
        return Promise.resolve(github);
      },
    };
    const { application } = createTestApplication(runtime);
    await expect(application.updateGitHubMcpSettings({ enabled: true })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    const enabled = await application.updateGitHubMcpSettings({ enabled: true, acknowledgedDisclosure: true });
    expect(enabled.githubMcp.enabled).toBe(true);
    const imported = await application.importGitHubPat({ token: canary });
    expect(imported.githubMcp.account.patConfigured).toBe(true);
    expect(JSON.stringify(imported)).not.toContain(canary);
    expect(JSON.stringify(enabled)).not.toContain(canary);
  });
});
