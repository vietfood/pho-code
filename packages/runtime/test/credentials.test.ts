import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { HARNESS_ERROR_CODES } from "@pho-code/protocol";
import { createApiKeyImportInteraction } from "../src/credentials";
import { createPhoCodeRuntime } from "../src/pi-runtime";

async function makeIsolatedDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-test-"));
  const agentDir = path.join(root, "agent");
  await mkdir(agentDir);
  return { agentDir };
}

describe("credential import", () => {
  test("stores an API key without returning it to callers", async () => {
    const { agentDir } = await makeIsolatedDirs();
    const runtime = await createPhoCodeRuntime({
      agentDir,
      deterministicTestModel: true,
    });
    const secret = "sk-pho-code-test-import-9f3c";

    try {
      const before = await runtime.listCredentialProviders();
      expect(before.some((provider) => provider.id === "deepseek")).toBe(true);
      expect(before.every((provider) => !JSON.stringify(provider).includes(secret))).toBe(true);
      expect(before.find((provider) => provider.id === "deepseek")?.configured).toBe(false);

      const imported = await runtime.importProviderApiKey({
        providerId: "deepseek",
        apiKey: secret,
      });
      expect(imported.providers.find((provider) => provider.id === "deepseek")?.configured).toBe(true);
      expect(JSON.stringify(imported)).not.toContain(secret);

      const listed = await runtime.listCredentialProviders();
      expect(listed.find((provider) => provider.id === "deepseek")?.configured).toBe(true);
      expect(JSON.stringify(listed)).not.toContain(secret);

      const auth = JSON.parse(await readFile(path.join(agentDir, "auth.json"), "utf8")) as {
        deepseek?: { type?: string; key?: string };
      };
      expect(auth.deepseek?.type).toBe("api_key");
      expect(auth.deepseek?.key).toBe(secret);
    } finally {
      await runtime.dispose();
    }
  });

  test("rejects an unknown provider and a second login prompt", async () => {
    const { agentDir } = await makeIsolatedDirs();
    const runtime = await createPhoCodeRuntime({
      agentDir,
      deterministicTestModel: true,
    });

    try {
      await expect(runtime.importProviderApiKey({ providerId: "not-a-provider", apiKey: "x" })).rejects.toMatchObject({
        code: HARNESS_ERROR_CODES.invalidCommand,
      });
      await expect(runtime.importProviderApiKey({ providerId: "deepseek", apiKey: "   " })).rejects.toMatchObject({
        code: HARNESS_ERROR_CODES.invalidCommand,
      });
    } finally {
      await runtime.dispose();
    }

    const interaction = createApiKeyImportInteraction("Cloudflare", "only-once");
    await expect(interaction.prompt({ type: "secret", message: "key" })).resolves.toBe("only-once");
    await expect(interaction.prompt({ type: "text", message: "account" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.credentialImportFailed,
    });
  });

  test("lists Cursor for API-key import when the baked cursor-sdk feature is present", async () => {
    const { agentDir } = await makeIsolatedDirs();
    const runtime = await createPhoCodeRuntime({ agentDir });

    try {
      const accounts = await runtime.listProviderAccounts();
      const cursor = accounts.providers.find((provider) => provider.id === "cursor");
      expect(cursor).toMatchObject({
        id: "cursor",
        name: "Cursor API key",
        methods: ["api_key"],
        configured: false,
      });

      const secret = "key_pho_code_cursor_test_import";
      const imported = await runtime.importProviderApiKey({
        providerId: "cursor",
        apiKey: secret,
      });
      expect(imported.providers.find((provider) => provider.id === "cursor")?.configured).toBe(true);
      expect(JSON.stringify(imported)).not.toContain(secret);

      const auth = JSON.parse(await readFile(path.join(agentDir, "auth.json"), "utf8")) as {
        cursor?: { type?: string; key?: string };
      };
      expect(auth.cursor?.type).toBe("api_key");
      expect(auth.cursor?.key).toBe(secret);
    } finally {
      await runtime.dispose();
    }
  });
});
