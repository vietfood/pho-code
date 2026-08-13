import { describe, expect, test } from "bun:test";
import { HARNESS_ERROR_CODES, type ProviderAuthFlowSnapshot } from "@pho-code/protocol";
import {
  createProviderAuthFlow,
  type HarnessAuthInteraction,
  type ProviderAuthFlowHost,
} from "../src/provider-auth-flow";

const AUTH_URL = "https://example.com/pho-code-oauth-test";
const BAD_URL = "javascript:alert(1)";
const CREDENTIAL_URL = "https://user:pass@example.com/oauth";
const ACCESS_CANARY = "canary-access-token-pho-test";
const REFRESH_CANARY = "canary-refresh-token-pho-test";
const MANUAL_CODE = "test-ok-secret-code";

function createHarness(login: (
  providerId: string,
  method: "api_key" | "oauth",
  interaction: HarnessAuthInteraction,
) => Promise<void>) {
  const opened: string[] = [];
  const snapshots: ProviderAuthFlowSnapshot[] = [];
  let n = 0;
  const host: ProviderAuthFlowHost = {
    openValidatedUrl(url) {
      opened.push(url);
    },
    now() {
      return new Date("2026-08-13T00:00:00.000Z");
    },
    randomId() {
      n += 1;
      return `id-${n}`;
    },
  };
  const flow = createProviderAuthFlow({
    host,
    login,
    emit(snapshot) {
      snapshots.push(structuredClone(snapshot));
    },
  });
  return { flow, opened, snapshots };
}

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

describe("provider auth flow coordinator", () => {
  test("rejects concurrent starts, stale identifiers, invalid select ids, and oversized input", async () => {
    const { flow } = createHarness(async (_providerId, _method, interaction) => {
      await interaction.prompt({
        type: "select",
        message: "Choose",
        options: [
          { id: "browser", label: "Browser" },
          { id: "device_code", label: "Device" },
        ],
      });
      await new Promise<void>((_resolve, reject) => {
        interaction.signal?.addEventListener("abort", () => reject(new Error("Login cancelled")), { once: true });
      });
    });

    const first = await flow.start({ providerId: "pho-test-oauth", method: "oauth", runActive: false });
    expect(first.phase).toBe("awaiting_prompt");
    await expect(flow.start({ providerId: "pho-test-oauth", method: "oauth", runActive: false })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "A provider login is already in progress.",
    });
    await expect(flow.respond({ flowId: "missing", promptId: first.prompt?.promptId ?? "", value: "browser" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    await expect(flow.respond({ flowId: first.flowId, promptId: "stale", value: "browser" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    await expect(flow.respond({ flowId: first.flowId, promptId: first.prompt?.promptId ?? "", value: "nope" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "Choose one of the listed login options.",
    });
    await expect(
      flow.respond({
        flowId: first.flowId,
        promptId: first.prompt?.promptId ?? "",
        value: "x".repeat(16_385),
      }),
    ).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    await expect(flow.start({ providerId: "pho-test-oauth", method: "oauth", runActive: true })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.sessionBusy,
    });

    const cancelled = await flow.cancel({ flowId: first.flowId });
    expect(cancelled.phase).toBe("cancelled");
    await expect(flow.openLink({ flowId: first.flowId, linkId: "id-99" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    expect(flow.retainedUrl(first.flowId, "id-99")).toBeUndefined();
    expect(flow.snapshot()).toBeNull();
  });

  test("keeps tokens and authorization URLs out of snapshots and expires handles with the flow", async () => {
    const { flow, opened, snapshots } = createHarness(async (_providerId, _method, interaction) => {
      interaction.notify({ type: "auth_url", url: AUTH_URL, instructions: "Open the browser." });
      interaction.notify({ type: "info", message: "Ignore this", links: [{ url: BAD_URL }, { url: CREDENTIAL_URL }] });
      const code = await interaction.prompt({
        type: "manual_code",
        message: "Paste the code",
        placeholder: "code",
      });
      if (code !== MANUAL_CODE) {
        throw new Error(`unexpected code ${code} ${ACCESS_CANARY} ${REFRESH_CANARY}`);
      }
    });

    const started = await flow.start({ providerId: "pho-test-oauth", method: "oauth", runActive: false });
    const prompt = snapshots.find((snapshot) => snapshot.prompt?.kind === "manual_code");
    expect(prompt?.prompt).toBeDefined();
    expect(started.links?.[0]?.hostname).toBe("example.com");
    expect(opened).toEqual([AUTH_URL]);
    expect(flow.retainedUrl(started.flowId, started.links?.[0]?.linkId ?? "")).toBe(AUTH_URL);

    const afterCode = await flow.respond({
      flowId: started.flowId,
      promptId: prompt?.prompt?.promptId ?? "",
      value: MANUAL_CODE,
    });
    const startedAt = Date.now();
    while (snapshots.at(-1)?.phase !== "completed") {
      if (Date.now() - startedAt > 1_000) {
        throw new Error("Login did not complete.");
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const completed = snapshots.at(-1);
    expect(completed?.phase).toBe("completed");
    expect(afterCode.prompt).toBeUndefined();

    const blob = serialized({ snapshots, afterCode, completed, canaries: flow.canaries() });
    expect(blob).not.toContain(AUTH_URL);
    expect(blob).not.toContain(ACCESS_CANARY);
    expect(blob).not.toContain(REFRESH_CANARY);
    expect(blob).not.toContain(MANUAL_CODE);
    expect(blob).not.toContain(BAD_URL);
    expect(flow.retainedUrl(started.flowId, started.links?.[0]?.linkId ?? "")).toBeUndefined();
  });

  test("ignores a late response after the provider withdraws a prompt", async () => {
    let withdrawnId = "";
    const { flow, snapshots } = createHarness(async (_providerId, _method, interaction) => {
      const controller = new AbortController();
      const pending = interaction.prompt({
        type: "manual_code",
        message: "Paste the code",
        signal: controller.signal,
      });
      await Promise.resolve();
      withdrawnId = snapshots.find((snapshot) => snapshot.prompt)?.prompt?.promptId ?? "";
      controller.abort();
      await expect(pending).rejects.toMatchObject({
        code: HARNESS_ERROR_CODES.providerAuthFailed,
      });
      await new Promise<void>((_resolve, reject) => {
        interaction.signal?.addEventListener("abort", () => reject(new Error("Login cancelled")), { once: true });
      });
    });

    const started = await flow.start({ providerId: "pho-test-oauth", method: "oauth", runActive: false });
    const startedAt = Date.now();
    while (withdrawnId.length === 0) {
      if (Date.now() - startedAt > 1_000) {
        throw new Error("Prompt was not withdrawn.");
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await expect(
      flow.respond({ flowId: started.flowId, promptId: withdrawnId, value: MANUAL_CODE }),
    ).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    const cancelled = await flow.cancel({ flowId: started.flowId });
    expect(cancelled.phase).toBe("cancelled");
    expect(serialized(snapshots)).not.toContain(MANUAL_CODE);
  });
});
