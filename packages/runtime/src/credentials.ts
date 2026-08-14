import type { AuthInteraction, AuthPrompt } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
  createHarnessError,
  HARNESS_ERROR_CODES,
  type CredentialProviderSummary,
  type ImportProviderApiKeyInput,
  type ProviderAccountSummary,
  type ProviderAuthMethod,
  type ProviderDisclosureKey,
} from "@pho-code/protocol";

const MAX_API_KEY_LENGTH = 16_384;

const DISCLOSURE_BY_PROVIDER: Readonly<Record<string, ProviderDisclosureKey>> = {
  "openai-codex": "subscription-classified",
};

export async function listProviderAccounts(modelRuntime: ModelRuntime): Promise<ProviderAccountSummary[]> {
  const stored = new Map<string, "api_key" | "oauth">();
  try {
    for (const entry of await modelRuntime.listCredentials()) {
      if (entry.type === "api_key" || entry.type === "oauth") {
        stored.set(entry.providerId, entry.type);
      }
    }
  } catch {
    // A damaged auth.json must not empty the provider list.
  }

  const summaries: ProviderAccountSummary[] = [];
  for (const provider of modelRuntime.getProviders()) {
    const hasApiKeyLogin = typeof provider.auth.apiKey?.login === "function";
    const hasOAuth = Boolean(provider.auth.oauth);
    if (!hasApiKeyLogin && !hasOAuth) {
      continue;
    }
    const methods: ProviderAuthMethod[] = [];
    if (hasApiKeyLogin) {
      methods.push("api_key");
    }
    if (hasOAuth) {
      methods.push("oauth");
    }
    const storedType = stored.get(provider.id);
    const status = modelRuntime.getProviderAuthStatus(provider.id);
    const subscriptionClassified = provider.auth.oauth?.isSubscription === true;
    const disclosureKey = DISCLOSURE_BY_PROVIDER[provider.id] ?? (subscriptionClassified ? "subscription-classified" : undefined);
    const summary: ProviderAccountSummary = {
      id: provider.id,
      name: accountDisplayName(provider.name, provider.auth.oauth?.name, provider.auth.apiKey?.name, methods),
      methods,
      configured: stored.has(provider.id) || status.configured,
      subscriptionClassified,
    };
    if (storedType) {
      summary.activeMethod = storedType;
    }
    const authSource = status.label ?? status.source;
    if (authSource) {
      summary.authSource = authSource;
    }
    if (disclosureKey) {
      summary.disclosureKey = disclosureKey;
    }
    summaries.push(summary);
  }
  summaries.sort((left, right) => left.name.localeCompare(right.name));
  return summaries;
}

export async function listStoredApiKeyProviders(modelRuntime: ModelRuntime): Promise<CredentialProviderSummary[]> {
  const accounts = await listProviderAccounts(modelRuntime);
  return accounts
    .filter((account) => account.methods.includes("api_key"))
    .map((account) => ({
      id: account.id,
      name: account.name,
      configured: account.configured,
    }));
}

export async function importProviderApiKey(
  modelRuntime: ModelRuntime,
  input: ImportProviderApiKeyInput,
): Promise<CredentialProviderSummary[]> {
  const providerId = input.providerId.trim();
  const apiKey = input.apiKey.trim();
  if (providerId.length === 0) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "providerId is required.",
      operation: "importProviderApiKey",
      recoverable: true,
    });
  }
  if (apiKey.length === 0) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "apiKey is required.",
      operation: "importProviderApiKey",
      recoverable: true,
    });
  }
  if (apiKey.length > MAX_API_KEY_LENGTH) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "apiKey is too long.",
      operation: "importProviderApiKey",
      recoverable: true,
    });
  }

  const provider = modelRuntime.getProvider(providerId);
  if (!provider || typeof provider.auth.apiKey?.login !== "function") {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "That provider does not accept an API key in this application.",
      operation: "importProviderApiKey",
      recoverable: true,
    });
  }

  try {
    await modelRuntime.login(providerId, "api_key", createApiKeyImportInteraction(provider.name, apiKey));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && "message" in error && "recoverable" in error) {
      throw error;
    }
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.credentialImportFailed,
      message: error instanceof Error ? error.message : "The API key could not be stored.",
      operation: "importProviderApiKey",
      recoverable: true,
    });
  }

  return listStoredApiKeyProviders(modelRuntime);
}

export async function logoutProviderAccount(modelRuntime: ModelRuntime, providerId: string): Promise<void> {
  const id = providerId.trim();
  if (id.length === 0) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "providerId is required.",
      operation: "logoutProvider",
      recoverable: true,
    });
  }
  const provider = modelRuntime.getProvider(id);
  if (!provider) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "Unknown provider.",
      operation: "logoutProvider",
      recoverable: true,
    });
  }
  await modelRuntime.logout(id);
}

export function createApiKeyImportInteraction(providerName: string, apiKey: string): AuthInteraction {
  let used = false;
  return {
    async prompt(prompt: AuthPrompt): Promise<string> {
      if (prompt.type === "secret" || prompt.type === "text") {
        if (used) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.credentialImportFailed,
            message: `${providerName} needs additional login fields that this API-key import does not support.`,
            operation: "importProviderApiKey",
            recoverable: true,
          });
        }
        used = true;
        return apiKey;
      }
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.credentialImportFailed,
        message: `${providerName} requires a login step this application does not support. Import an API key for a provider that only asks for a key.`,
        operation: "importProviderApiKey",
        recoverable: true,
      });
    },
    notify() {
      return;
    },
  };
}

function accountDisplayName(
  providerName: string,
  oauthName: string | undefined,
  apiKeyName: string | undefined,
  methods: readonly ProviderAuthMethod[],
): string {
  if (methods.length === 1 && methods[0] === "oauth") {
    return oauthName || providerName;
  }
  if (methods.length === 1 && methods[0] === "api_key") {
    // Extension providers get a generic Pi "API key" method name; prefer the provider label.
    if (apiKeyName && apiKeyName !== "API key") {
      return apiKeyName;
    }
    return /api key$/i.test(providerName) ? providerName : `${providerName} API key`;
  }
  return providerName;
}
