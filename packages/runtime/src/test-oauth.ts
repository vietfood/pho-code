import {
  createProvider,
  fauxProvider,
  type AuthInteraction,
  type OAuthCredential,
  type Provider,
} from "@pho-agent/runtime/testing";

export const TEST_OAUTH_PROVIDER_ID = "pho-test-oauth";
export const TEST_OAUTH_MODEL_ID = "test-oauth-model";
export const TEST_OAUTH_AUTH_URL = "https://example.com/pho-code-oauth-test";
export const TEST_OAUTH_DEVICE_URL = "https://example.com/pho-code-device-test";
export const TEST_OAUTH_SUCCESS_CODE = "test-ok";
export const TEST_OAUTH_FAIL_CODE = "test-fail";
export const TEST_OAUTH_USER_CODE = "ABCD-1234";
export const TEST_OAUTH_ACCESS_CANARY = "canary-access-token-pho-test";
export const TEST_OAUTH_REFRESH_CANARY = "canary-refresh-token-pho-test";

export function createTestOAuthProvider(): Provider {
  const faux = fauxProvider({
    provider: TEST_OAUTH_PROVIDER_ID,
    api: "pho-test-oauth-api",
    models: [
      {
        id: TEST_OAUTH_MODEL_ID,
        name: "Test OAuth model",
        reasoning: false,
        input: ["text"],
        contextWindow: 8_000,
        maxTokens: 1_024,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  });
  return createProvider({
    id: TEST_OAUTH_PROVIDER_ID,
    name: "Test OAuth Provider",
    auth: {
      oauth: {
        name: "Test OAuth Provider",
        isSubscription: true,
        login: (interaction) => runDeterministicTestOAuthLogin(interaction),
        refresh: async (credential) => credential,
        toAuth: async (credential) => ({ apiKey: credential.access }),
      },
    },
    models: faux.models,
    api: {
      stream: (model, context, options) => faux.provider.stream(model, context, options),
      streamSimple: (model, context, options) => faux.provider.streamSimple(model, context, options),
    },
  });
}

export async function runDeterministicTestOAuthLogin(interaction: AuthInteraction): Promise<OAuthCredential> {
  const method = await interaction.prompt({
    type: "select",
    message: "Select test login method:",
    options: [
      { id: "browser", label: "Browser login (default)" },
      { id: "device_code", label: "Device code login (headless)" },
    ],
  });
  if (method === "device_code") {
    return loginDevice(interaction);
  }
  if (method !== "browser") {
    throw new Error(`Unknown test login method: ${method}`);
  }
  return loginBrowser(interaction);
}

function fakeCredential(): OAuthCredential {
  return {
    type: "oauth",
    access: TEST_OAUTH_ACCESS_CANARY,
    refresh: TEST_OAUTH_REFRESH_CANARY,
    expires: Date.now() + 60 * 60 * 1000,
  };
}

async function loginBrowser(interaction: AuthInteraction): Promise<OAuthCredential> {
  interaction.notify({
    type: "auth_url",
    url: TEST_OAUTH_AUTH_URL,
    instructions: "A browser window should open. Complete login to finish.",
  });
  interaction.notify({ type: "progress", message: "Waiting for authorization." });
  const code = await interaction.prompt({
    type: "manual_code",
    message: "Complete login in your browser, or paste the authorization code here:",
    placeholder: TEST_OAUTH_SUCCESS_CODE,
    ...(interaction.signal ? { signal: interaction.signal } : {}),
  });
  const trimmed = code.trim();
  if (trimmed === TEST_OAUTH_FAIL_CODE) {
    throw new Error("Test OAuth login failed.");
  }
  if (trimmed !== TEST_OAUTH_SUCCESS_CODE) {
    throw new Error("Missing authorization code");
  }
  return fakeCredential();
}

async function loginDevice(interaction: AuthInteraction): Promise<OAuthCredential> {
  interaction.notify({
    type: "device_code",
    userCode: TEST_OAUTH_USER_CODE,
    verificationUri: TEST_OAUTH_DEVICE_URL,
    intervalSeconds: 1,
    expiresInSeconds: 120,
  });
  interaction.notify({ type: "progress", message: "Waiting for device authorization." });
  if (interaction.signal?.aborted) {
    throw new Error("Login cancelled");
  }
  await new Promise<void>((resolve, reject) => {
    const signal = interaction.signal;
    if (!signal) {
      resolve();
      return;
    }
    if (signal.aborted) {
      reject(new Error("Login cancelled"));
      return;
    }
    const onAbort = () => {
      reject(new Error("Login cancelled"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return fakeCredential();
}
