import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CHAT_FONT_SIZE,
  DEFAULT_GLASS_ENABLED,
  DEFAULT_GLASS_STRENGTH,
  DEFAULT_UI_FONT_SIZE,
  HARNESS_ERROR_CODES,
  PINNED_ELECTRON,
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
    expect(migrated.version).toBe(4);
    expect(migrated.palette).toBe("default");
    expect(migrated.mode).toBe("system");
    expect(migrated.glassEnabled).toBe(DEFAULT_GLASS_ENABLED);
    expect(migrated.glassStrength).toBe(DEFAULT_GLASS_STRENGTH);
    expect(migrated.uiFontSize).toBe(DEFAULT_UI_FONT_SIZE);
    expect(migrated.chatFontSize).toBe(DEFAULT_CHAT_FONT_SIZE);
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
});
