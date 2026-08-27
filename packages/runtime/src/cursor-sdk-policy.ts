/**
 * Harness-owned defaults for the baked pi-cursor-sdk feature.
 * Local Cursor SDK agents only; no ambient Cursor MCP/plugins/rules; cloud stays out of product scope.
 */
export const CURSOR_SDK_PROVIDER_ID = "cursor";

export const CURSOR_SDK_HARNESS_ENV = {
  runtime: "PI_CURSOR_RUNTIME",
  settingSources: "PI_CURSOR_SETTING_SOURCES",
} as const;

export function applyCursorSdkHarnessPolicy(env: NodeJS.ProcessEnv = process.env): void {
  env[CURSOR_SDK_HARNESS_ENV.runtime] = "local";
  env[CURSOR_SDK_HARNESS_ENV.settingSources] = "none";
}

/**
 * Register Cursor on ModelRuntime at harness boot so Settings → Accounts can import a key
 * before any chat session has bound the pi-cursor-sdk extension.
 * The extension later merges the real stream/models config onto the same provider id.
 */
export function registerCursorProviderAccount(modelRuntime: {
  registerProvider(
    providerId: string,
    config: {
      name?: string;
      baseUrl?: string;
      apiKey?: string;
    },
  ): void;
}): void {
  // Omit the placeholder apiKey so Accounts stays "Not connected" until a real key is stored.
  // pi-cursor-sdk later merges its stream/models config (and sentinel) onto this provider id.
  modelRuntime.registerProvider(CURSOR_SDK_PROVIDER_ID, {
    name: "Cursor",
    baseUrl: "https://cursor.com",
  });
}
