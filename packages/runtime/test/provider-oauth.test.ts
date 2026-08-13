import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { HARNESS_ERROR_CODES, RUNTIME_EVENT_TYPES, type ProviderAuthFlowSnapshot, type RuntimeEvent } from "@pho-code/protocol";
import { createPhoCodeRuntime } from "../src/pi-runtime";
import {
  TEST_OAUTH_ACCESS_CANARY,
  TEST_OAUTH_AUTH_URL,
  TEST_OAUTH_FAIL_CODE,
  TEST_OAUTH_PROVIDER_ID,
  TEST_OAUTH_REFRESH_CANARY,
  TEST_OAUTH_SUCCESS_CODE,
} from "../src/test-oauth";

async function makeIsolatedDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-test-"));
  const agentDir = path.join(root, "agent");
  await mkdir(agentDir);
  return { agentDir };
}

function waitForFlow(
  events: RuntimeEvent[],
  match: (flow: ProviderAuthFlowSnapshot) => boolean,
): Promise<ProviderAuthFlowSnapshot> {
  const existing = [...events]
    .reverse()
    .find(
      (event) => event.type === RUNTIME_EVENT_TYPES.providerAuthFlow && match(event.payload as ProviderAuthFlowSnapshot),
    );
  if (existing?.type === RUNTIME_EVENT_TYPES.providerAuthFlow) {
    return Promise.resolve(existing.payload as ProviderAuthFlowSnapshot);
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for provider auth flow.")), 5_000);
    const timer = setInterval(() => {
      const event = [...events]
        .reverse()
        .find(
          (entry) =>
            entry.type === RUNTIME_EVENT_TYPES.providerAuthFlow && match(entry.payload as ProviderAuthFlowSnapshot),
        );
      if (event?.type === RUNTIME_EVENT_TYPES.providerAuthFlow) {
        clearTimeout(timeout);
        clearInterval(timer);
        resolve(event.payload as ProviderAuthFlowSnapshot);
      }
    }, 10);
  });
}

describe("provider OAuth against pinned Pi", () => {
  test("lists openai-codex as an OAuth subscription-classified provider", async () => {
    const { agentDir } = await makeIsolatedDirs();
    const runtime = await createPhoCodeRuntime({ agentDir });
    try {
      const accounts = await runtime.listProviderAccounts();
      const openai = accounts.providers.find((provider) => provider.id === "openai-codex");
      expect(openai).toBeDefined();
      expect(openai?.methods).toContain("oauth");
      expect(openai?.subscriptionClassified).toBe(true);
      expect(openai?.disclosureKey).toBe("subscription-classified");
      expect(openai?.configured).toBe(false);
    } finally {
      await runtime.dispose();
    }
  });

  test("completes fake OAuth login and logout in an isolated auth.json", async () => {
    const { agentDir } = await makeIsolatedDirs();
    const opened: string[] = [];
    const events: RuntimeEvent[] = [];
    const runtime = await createPhoCodeRuntime({
      agentDir,
      testOAuthFlow: true,
      openValidatedAuthUrl(url) {
        opened.push(url);
      },
    });
    const stop = runtime.subscribe((event) => {
      events.push(event);
    });

    try {
      const before = await runtime.listProviderAccounts();
      const testProvider = before.providers.find((provider) => provider.id === TEST_OAUTH_PROVIDER_ID);
      expect(testProvider?.methods).toEqual(["oauth"]);
      expect(testProvider?.configured).toBe(false);
      expect(JSON.stringify(before)).not.toContain(TEST_OAUTH_ACCESS_CANARY);

      const started = await runtime.startProviderLogin({ providerId: TEST_OAUTH_PROVIDER_ID, method: "oauth" });
      const select = await waitForFlow(events, (flow) => flow.flowId === started.flowId && flow.prompt?.kind === "select");
      const afterSelect = await runtime.respondProviderAuthPrompt({
        flowId: started.flowId,
        promptId: select.prompt?.promptId ?? "",
        value: "browser",
      });
      expect(JSON.stringify(afterSelect)).not.toContain(TEST_OAUTH_AUTH_URL);

      const codePrompt = await waitForFlow(
        events,
        (flow) => flow.flowId === started.flowId && flow.prompt?.kind === "manual_code",
      );
      expect(opened).toEqual([TEST_OAUTH_AUTH_URL]);
      expect(codePrompt.links?.some((link) => link.hostname === "example.com")).toBe(true);
      await runtime.openProviderAuthLink({
        flowId: started.flowId,
        linkId: codePrompt.links?.[0]?.linkId ?? "",
      });
      expect(opened).toEqual([TEST_OAUTH_AUTH_URL, TEST_OAUTH_AUTH_URL]);

      await runtime.respondProviderAuthPrompt({
        flowId: started.flowId,
        promptId: codePrompt.prompt?.promptId ?? "",
        value: TEST_OAUTH_SUCCESS_CODE,
      });
      const completed = await waitForFlow(events, (flow) => flow.flowId === started.flowId && flow.phase === "completed");
      expect(completed.links).toBeUndefined();
      expect(completed.prompt).toBeUndefined();

      const listed = await runtime.listProviderAccounts();
      expect(listed.providers.find((provider) => provider.id === TEST_OAUTH_PROVIDER_ID)?.configured).toBe(true);
      expect(listed.providers.find((provider) => provider.id === TEST_OAUTH_PROVIDER_ID)?.activeMethod).toBe("oauth");
      expect(listed.flow).toBeNull();
      expect(JSON.stringify({ listed, events, completed })).not.toContain(TEST_OAUTH_ACCESS_CANARY);
      expect(JSON.stringify({ listed, events, completed })).not.toContain(TEST_OAUTH_REFRESH_CANARY);
      expect(JSON.stringify({ listed, events, completed })).not.toContain(TEST_OAUTH_AUTH_URL);
      const auth = JSON.parse(await readFile(path.join(agentDir, "auth.json"), "utf8")) as Record<
        string,
        { type?: string; access?: string }
      >;
      expect(auth[TEST_OAUTH_PROVIDER_ID]?.type).toBe("oauth");
      expect(auth[TEST_OAUTH_PROVIDER_ID]?.access).toBe(TEST_OAUTH_ACCESS_CANARY);

      const loggedOut = await runtime.logoutProvider({ providerId: TEST_OAUTH_PROVIDER_ID });
      expect(loggedOut.providers.find((provider) => provider.id === TEST_OAUTH_PROVIDER_ID)?.configured).toBe(false);
      const afterLogout = JSON.parse(await readFile(path.join(agentDir, "auth.json"), "utf8")) as Record<string, unknown>;
      expect(afterLogout[TEST_OAUTH_PROVIDER_ID]).toBeUndefined();
    } finally {
      stop();
      await runtime.dispose();
    }
  });

  test("failed fake login stays unconfigured and does not write tokens", async () => {
    const { agentDir } = await makeIsolatedDirs();
    const events: RuntimeEvent[] = [];
    const runtime = await createPhoCodeRuntime({
      agentDir,
      testOAuthFlow: true,
      openValidatedAuthUrl() {
        return;
      },
    });
    const stop = runtime.subscribe((event) => {
      events.push(event);
    });
    try {
      const started = await runtime.startProviderLogin({ providerId: TEST_OAUTH_PROVIDER_ID, method: "oauth" });
      const select = await waitForFlow(events, (flow) => flow.flowId === started.flowId && flow.prompt?.kind === "select");
      await runtime.respondProviderAuthPrompt({
        flowId: started.flowId,
        promptId: select.prompt?.promptId ?? "",
        value: "browser",
      });
      const codePrompt = await waitForFlow(
        events,
        (flow) => flow.flowId === started.flowId && flow.prompt?.kind === "manual_code",
      );
      await runtime.respondProviderAuthPrompt({
        flowId: started.flowId,
        promptId: codePrompt.prompt?.promptId ?? "",
        value: TEST_OAUTH_FAIL_CODE,
      });
      const failed = await waitForFlow(events, (flow) => flow.flowId === started.flowId && flow.phase === "failed");
      expect(failed.error?.code).toBe(HARNESS_ERROR_CODES.providerAuthFailed);
      const listed = await runtime.listProviderAccounts();
      expect(listed.providers.find((provider) => provider.id === TEST_OAUTH_PROVIDER_ID)?.configured).toBe(false);
    } finally {
      stop();
      await runtime.dispose();
    }
  });

  test("cancelling device-code login leaves no stored credential", async () => {
    const { agentDir } = await makeIsolatedDirs();
    const events: RuntimeEvent[] = [];
    const runtime = await createPhoCodeRuntime({
      agentDir,
      testOAuthFlow: true,
      openValidatedAuthUrl() {
        return;
      },
    });
    const stop = runtime.subscribe((event) => {
      events.push(event);
    });
    try {
      const started = await runtime.startProviderLogin({ providerId: TEST_OAUTH_PROVIDER_ID, method: "oauth" });
      const select = await waitForFlow(events, (flow) => flow.flowId === started.flowId && flow.prompt?.kind === "select");
      await runtime.respondProviderAuthPrompt({
        flowId: started.flowId,
        promptId: select.prompt?.promptId ?? "",
        value: "device_code",
      });
      const polling = await waitForFlow(events, (flow) => flow.flowId === started.flowId && flow.phase === "polling");
      expect(polling.deviceCode?.userCode).toBe("ABCD-1234");
      const cancelled = await runtime.cancelProviderLogin({ flowId: started.flowId });
      expect(cancelled.phase).toBe("cancelled");
      const listed = await runtime.listProviderAccounts();
      expect(listed.flow).toBeNull();
      expect(listed.providers.find((provider) => provider.id === TEST_OAUTH_PROVIDER_ID)?.configured).toBe(false);
    } finally {
      stop();
      await runtime.dispose();
    }
  });
});
