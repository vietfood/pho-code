import type { AuthInteraction, AuthPrompt } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
  createHarnessError,
  HARNESS_ERROR_CODES,
  type CredentialProviderSummary,
  type ImportProviderApiKeyInput,
} from "@pho-code/protocol";

const MAX_API_KEY_LENGTH = 16_384;

export async function listStoredApiKeyProviders(modelRuntime: ModelRuntime): Promise<CredentialProviderSummary[]> {
  const stored = new Set((await modelRuntime.listCredentials()).map((entry) => entry.providerId));
  const summaries: CredentialProviderSummary[] = [];
  for (const provider of modelRuntime.getProviders()) {
    if (typeof provider.auth.apiKey?.login !== "function") {
      continue;
    }
    summaries.push({
      id: provider.id,
      name: provider.auth.apiKey.name || provider.name,
      configured: stored.has(provider.id),
    });
  }
  summaries.sort((left, right) => left.name.localeCompare(right.name));
  return summaries;
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
