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
      appVersion: "0.0.0",
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
    expect(migrated.version).toBe(7);
    expect(migrated.palette).toBe("default");
    expect(migrated.mode).toBe("system");
    expect(migrated.glassEnabled).toBe(DEFAULT_GLASS_ENABLED);
    expect(migrated.glassStrength).toBe(DEFAULT_GLASS_STRENGTH);
    expect(migrated.uiFontSize).toBe(DEFAULT_UI_FONT_SIZE);
    expect(migrated.chatFontSize).toBe(DEFAULT_CHAT_FONT_SIZE);
    expect(migrated.uiFontFamily).toBe("");
    expect(migrated.codeFontFamily).toBe("");
    expect(migrated.fontSmoothing).toBe(true);
    expect(migrated.workEntryIcons).toBe("lucide");
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
      workEntryIcons: "lucide",
      glassEnabled: DEFAULT_GLASS_ENABLED,
      glassStrength: DEFAULT_GLASS_STRENGTH,
      uiFontSize: 18,
      chatFontSize: 16,
      uiFontFamily: "",
      codeFontFamily: "",
      fontSmoothing: true,
    });
    expect(application.getSettings().appearance.uiFontSize).toBe(18);
    expect(application.getSettings().appearance.chatFontSize).toBe(16);
    expect(appearances).toHaveLength(2);
  });

  test("persists the work-entry icon pack", async () => {
    const { application, appearances } = createTestApplication();
    expect(application.getSettings().appearance.workEntryIcons).toBe("lucide");
    const updated = await application.updateAppearanceSettings({ workEntryIcons: "pho" });
    expect(updated.appearance.workEntryIcons).toBe("pho");
    expect(application.getSettings().appearance.workEntryIcons).toBe("pho");
    expect(appearances).toHaveLength(2);
  });

  test("rejects an unknown icon pack", async () => {
    const { application } = createTestApplication();
    await expect(application.updateAppearanceSettings({ workEntryIcons: "fluent" as "pho" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
  });

  test("coerces an unknown stored icon pack to lucide", () => {
    const migrated = parseMetadata({
      version: 6,
      recentWorkspaces: [],
      palette: "default",
      mode: "system",
      workEntryIcons: "fluent",
      trustedPermissionWorkspaceIds: [],
    });
    expect(migrated.workEntryIcons).toBe("lucide");
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

  test("persists installed font families and smoothing", async () => {
    const { application } = createTestApplication();
    const updated = await application.updateAppearanceSettings({
      uiFontFamily: "  Lucida Grande  ",
      codeFontFamily: "JetBrainsMono Nerd Font",
      fontSmoothing: false,
    });
    expect(updated.appearance.uiFontFamily).toBe("Lucida Grande");
    expect(updated.appearance.codeFontFamily).toBe("JetBrainsMono Nerd Font");
    expect(updated.appearance.fontSmoothing).toBe(false);
    const cleared = await application.updateAppearanceSettings({ uiFontFamily: "", codeFontFamily: "" });
    expect(cleared.appearance.uiFontFamily).toBe("");
    expect(cleared.appearance.codeFontFamily).toBe("");
    expect(cleared.appearance.fontSmoothing).toBe(false);
  });

  test("rejects an unsafe font family name", async () => {
    const { application } = createTestApplication();
    await expect(application.updateAppearanceSettings({ codeFontFamily: "Menlo, monospace" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    await expect(application.updateAppearanceSettings({ uiFontFamily: "url(https://x)" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
  });

  test("coerces an unsafe stored font family to the system default", () => {
    const migrated = parseMetadata({
      version: 6,
      recentWorkspaces: [],
      palette: "default",
      mode: "system",
      uiFontFamily: "Menlo; color: red",
      codeFontFamily: "url(https://x)",
      fontSmoothing: "yes",
      trustedPermissionWorkspaceIds: [],
    });
    expect(migrated.uiFontFamily).toBe("");
    expect(migrated.codeFontFamily).toBe("");
    expect(migrated.fontSmoothing).toBe(true);
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

  test("rejects a wildcard sandbox domain allowlist and enables deny-network while idle", async () => {
    let sandbox = emptySettingsSnapshot().sandbox;
    const runtime: HarnessRuntime = {
      ...createDisposableStubHarnessRuntime(),
      getSandboxSettings() {
        return sandbox;
      },
      updateSandboxSettings(input) {
        sandbox = {
          ...sandbox,
          enabled: input.enabled ?? sandbox.enabled,
          networkMode: input.networkMode ?? sandbox.networkMode,
          allowedDomains: input.allowedDomains ?? sandbox.allowedDomains,
          status: (input.enabled ?? sandbox.enabled) ? "healthy" : "off",
          platformSupported: true,
        };
        return Promise.resolve(sandbox);
      },
    };
    const { application } = createTestApplication(runtime);
    await expect(application.updateSandboxSettings({ allowedDomains: ["*"] })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    await expect(application.updateSandboxSettings({})).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    const enabled = await application.updateSandboxSettings({ enabled: true, networkMode: "deny" });
    expect(enabled.sandbox.enabled).toBe(true);
    expect(enabled.sandbox.networkMode).toBe("deny");
    expect(isJsonSafeValue(enabled)).toBe(true);
  });
});
