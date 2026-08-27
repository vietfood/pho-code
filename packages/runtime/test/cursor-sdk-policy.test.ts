import { describe, expect, test } from "bun:test";
import {
  CURSOR_API_KEY_ENV_VAR,
  CURSOR_API_KEY_PLACEHOLDER,
  CURSOR_SDK_HARNESS_ENV,
  CURSOR_SDK_PROVIDER_ID,
  applyCursorSdkHarnessPolicy,
  cursorHasOwnerCredentials,
  filterCursorModelsUnlessAuthenticated,
  isCursorProviderId,
  providerAccountAuthSource,
  providerAccountConfigured,
  registerCursorProviderAccount,
  resolveOwnerCursorApiKey,
} from "../src/cursor-sdk-policy";

describe("cursor sdk harness policy", () => {
  test("forces local runtime and disables ambient Cursor setting sources", () => {
    const env: NodeJS.ProcessEnv = {
      [CURSOR_SDK_HARNESS_ENV.runtime]: "cloud",
      [CURSOR_SDK_HARNESS_ENV.settingSources]: "all",
    };
    applyCursorSdkHarnessPolicy(env);
    expect(env[CURSOR_SDK_HARNESS_ENV.runtime]).toBe("local");
    expect(env[CURSOR_SDK_HARNESS_ENV.settingSources]).toBe("none");
  });

  test("registers a Cursor API-key account stub for Settings before session bind", () => {
    const calls: Array<{ id: string; config: { name?: string; baseUrl?: string; apiKey?: string } }> = [];
    registerCursorProviderAccount({
      registerProvider(providerId, config) {
        calls.push({ id: providerId, config });
      },
    });
    expect(calls).toEqual([
      {
        id: CURSOR_SDK_PROVIDER_ID,
        config: {
          name: "Cursor",
          baseUrl: "https://cursor.com",
        },
      },
    ]);
  });

  test("treats only a stored key or a real CURSOR_API_KEY as owner credentials", () => {
    expect(isCursorProviderId("Cursor")).toBe(true);
    expect(isCursorProviderId("openai")).toBe(false);
    expect(resolveOwnerCursorApiKey({})).toBeUndefined();
    expect(resolveOwnerCursorApiKey({ [CURSOR_API_KEY_ENV_VAR]: CURSOR_API_KEY_PLACEHOLDER })).toBeUndefined();
    expect(resolveOwnerCursorApiKey({ [CURSOR_API_KEY_ENV_VAR]: " key_live " })).toBe("key_live");
    expect(cursorHasOwnerCredentials(false, {})).toBe(false);
    expect(cursorHasOwnerCredentials(true, {})).toBe(true);
    expect(cursorHasOwnerCredentials(false, { [CURSOR_API_KEY_ENV_VAR]: "key_live" })).toBe(true);
  });

  test("hides Cursor models until the owner authenticates", () => {
    const models = [
      { provider: "openai", id: "gpt-4.1" },
      { provider: "cursor", id: "composer-1.5" },
    ];
    expect(filterCursorModelsUnlessAuthenticated(models, false)).toEqual([{ provider: "openai", id: "gpt-4.1" }]);
    expect(filterCursorModelsUnlessAuthenticated(models, true)).toEqual(models);
  });

  test("treats Cursor as configured only when the owner has credentials", () => {
    expect(providerAccountConfigured("cursor", false, true)).toBe(false);
    expect(providerAccountConfigured("cursor", true, false)).toBe(true);
    expect(providerAccountConfigured("openai", false, true)).toBe(true);
    expect(providerAccountConfigured("openai", true, false)).toBe(true);
    expect(providerAccountAuthSource("openai", true, "api_key", { label: "API key" })).toBe("API key");
    expect(providerAccountAuthSource("cursor", false, undefined, { label: "API key" })).toBeUndefined();
  });
});
