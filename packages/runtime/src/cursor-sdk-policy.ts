/**
 * Harness-owned defaults for the baked pi-cursor-sdk feature.
 * Local Cursor SDK agents only; no ambient Cursor MCP/plugins/rules; cloud stays out of product scope.
 */
export const CURSOR_SDK_PROVIDER_ID = "cursor";

export const CURSOR_SDK_HARNESS_ENV = {
  runtime: "PI_CURSOR_RUNTIME",
  settingSources: "PI_CURSOR_SETTING_SOURCES",
} as const;

export const CURSOR_API_KEY_ENV_VAR = "CURSOR_API_KEY";

/**
 * Must match pi-cursor-sdk `CURSOR_API_KEY_CONFIG_VALUE`. That sentinel is a
 * non-secret placeholder so Pi will advertise fallback Cursor models before
 * `/login`. Pho Code hides those models until the owner stores a real key.
 */
export const CURSOR_API_KEY_PLACEHOLDER = "pi-cursor-sdk-cursor-api-key-placeholder";

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

export function isCursorProviderId(providerId: string | undefined): boolean {
  return providerId?.trim().toLowerCase() === CURSOR_SDK_PROVIDER_ID;
}

export function resolveOwnerCursorApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[CURSOR_API_KEY_ENV_VAR]?.trim();
  if (!value || value === CURSOR_API_KEY_PLACEHOLDER) {
    return undefined;
  }
  return value;
}

export function cursorHasOwnerCredentials(
  stored: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return stored || Boolean(resolveOwnerCursorApiKey(env));
}

export async function cursorProviderHasOwnerCredentials(
  modelRuntime: {
    listCredentials(): Promise<readonly { providerId: string; type: string }[]>;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (resolveOwnerCursorApiKey(env)) {
    return true;
  }
  try {
    for (const entry of await modelRuntime.listCredentials()) {
      if (entry.providerId === CURSOR_SDK_PROVIDER_ID && (entry.type === "api_key" || entry.type === "oauth")) {
        return true;
      }
    }
  } catch {
    // A damaged auth.json must not advertise Cursor models.
  }
  return false;
}

export function filterCursorModelsUnlessAuthenticated<T extends { provider: string }>(
  models: readonly T[],
  authenticated: boolean,
): T[] {
  if (authenticated) {
    return [...models];
  }
  return models.filter((model) => !isCursorProviderId(model.provider));
}

export function providerAccountConfigured(
  providerId: string,
  stored: boolean,
  runtimeConfigured: boolean,
): boolean {
  if (isCursorProviderId(providerId)) {
    return cursorHasOwnerCredentials(stored);
  }
  return stored || runtimeConfigured;
}

export function providerAccountAuthSource(
  providerId: string,
  configured: boolean,
  storedType: "api_key" | "oauth" | undefined,
  status: { source?: string; label?: string },
): string | undefined {
  if (!isCursorProviderId(providerId)) {
    return status.label ?? status.source;
  }
  if (!configured) {
    return undefined;
  }
  if (storedType) {
    return status.source === "fallback" ? undefined : status.label ?? status.source;
  }
  if (resolveOwnerCursorApiKey()) {
    return CURSOR_API_KEY_ENV_VAR;
  }
  return undefined;
}
