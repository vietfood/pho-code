import { describe, expect, test } from "bun:test";
import { HARNESS_ERROR_CODES, PINNED_ELECTRON, isJsonSafeValue } from "@pho-code/protocol";
import { createDisposableStubHarnessRuntime, type HarnessRuntime } from "@pho-code/runtime";
import { createApplicationService, createMemoryMetadataStore, parseMetadata } from "../src/index";

function createTestApplication(runtime: HarnessRuntime = createDisposableStubHarnessRuntime()) {
  const themes: string[] = [];
  const application = createApplicationService({
    runtime,
    versions: {
      electron: PINNED_ELECTRON.version,
      embeddedNode: "24.18.1",
    },
    metadataStore: createMemoryMetadataStore(),
    appearanceHost: {
      applyTheme(theme) {
        themes.push(theme);
      },
    },
  });
  return { application, themes };
}

describe("application settings", () => {
  test("migrates v1 metadata to system appearance", () => {
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
    expect(migrated.version).toBe(2);
    expect(migrated.theme).toBe("system");
    expect(migrated.recentWorkspaces).toHaveLength(1);
  });

  test("persists appearance independently of permission settings", async () => {
    const { application, themes } = createTestApplication();
    expect(application.getSettings().appearance.theme).toBe("system");
    const updated = await application.updateAppearanceSettings({ theme: "dark" });
    expect(updated.appearance.theme).toBe("dark");
    expect(application.getSettings().appearance.theme).toBe("dark");
    expect(themes).toEqual(["system", "dark"]);
    expect(isJsonSafeValue(updated)).toBe(true);
  });

  test("rejects an empty API key before calling the runtime", async () => {
    const { application } = createTestApplication();
    await expect(application.importProviderApiKey({ providerId: "deepseek", apiKey: "  " })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
  });

  test("rejects an unknown theme", async () => {
    const { application } = createTestApplication();
    await expect(application.updateAppearanceSettings({ theme: "sepia" as "dark" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
  });
});
