import { describe, expect, test } from "bun:test";
import {
  CURSOR_SDK_HARNESS_ENV,
  CURSOR_SDK_PROVIDER_ID,
  applyCursorSdkHarnessPolicy,
  registerCursorProviderAccount,
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
});
