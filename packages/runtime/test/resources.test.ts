import { describe, expect, test } from "bun:test";
import { createExtensionRuntime, type ResourceLoader } from "@earendil-works/pi-coding-agent";
import { isJsonSafeValue } from "@pho-code/protocol";
import { projectFeatureSnapshot } from "../src/resources";

function emptyLoader(overrides: Partial<ResourceLoader> = {}): ResourceLoader {
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => "",
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => undefined,
    reload: async () => undefined,
    ...overrides,
  };
}

describe("feature health projection", () => {
  test("does not report an unloaded extension feature as loaded", () => {
    const snapshot = projectFeatureSnapshot(
      {
        features: [
          {
            id: "permission-system",
            version: "24.0.0",
            extensionPaths: ["/tmp/missing-permission"],
            expected: { extensions: 1 },
          },
        ],
      },
      emptyLoader(),
    );
    expect(snapshot.features[0]?.status).toBe("failed");
  });

  test("marks a skill-only feature failed when no skill loaded", () => {
    const snapshot = projectFeatureSnapshot(
      {
        features: [
          {
            id: "note",
            version: "1",
            skillPaths: ["/tmp/skills/note"],
            expected: { skills: 1 },
          },
        ],
      },
      emptyLoader(),
    );
    expect(snapshot.features[0]?.status).toBe("failed");
  });

  test("omits absent paths from extension diagnostics", () => {
    const snapshot = projectFeatureSnapshot(
      { features: [] },
      emptyLoader({
        getExtensions: () => ({
          extensions: [],
          errors: [{ error: "Extension failed to load" } as { path: string; error: string }],
          runtime: createExtensionRuntime(),
        }),
      }),
    );

    expect(snapshot.diagnostics).toEqual([{ type: "error", message: "Extension failed to load" }]);
    expect(isJsonSafeValue(snapshot)).toBe(true);
  });

  test("keeps a related diagnostic JSON-safe at both feature and snapshot level", () => {
    const snapshot = projectFeatureSnapshot(
      {
        features: [
          {
            id: "permission-system",
            version: "24.0.0",
            extensionPaths: ["/tmp/permission-system"],
            expected: { extensions: 1 },
          },
        ],
      },
      emptyLoader({
        getExtensions: () => ({
          extensions: [],
          errors: [{ path: "/tmp/permission-system", error: "Extension failed to load" }],
          runtime: createExtensionRuntime(),
        }),
      }),
    );

    expect(snapshot.features[0]?.diagnostics).toEqual(snapshot.diagnostics);
    expect(isJsonSafeValue(snapshot)).toBe(true);
  });
});
