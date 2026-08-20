import { describe, expect, test } from "bun:test";
import {
  HARNESS_ERROR_CODES,
  PINNED_ELECTRON,
  PROTOCOL_VERSION,
  RUNTIME_EVENT_TYPES,
  isJsonSafeValue,
  type RuntimeEvent,
} from "@pho-code/protocol";
import { createDisposableStubHarnessRuntime, type HarnessRuntime } from "@pho-code/runtime";
import {
  createApplicationRuntimeHost,
  createApplicationService,
  createMemoryMetadataStore,
  emptyMetadata,
} from "../src/index";

function createApplication(runtime: HarnessRuntime) {
  return createApplicationService({
    runtime,
    versions: {
      appVersion: "0.0.0",
      electron: PINNED_ELECTRON.version,
      embeddedNode: "24.18.1",
    },
    metadataStore: createMemoryMetadataStore(),
  });
}

describe("application runtime host", () => {
  test("keeps metadata bootstrap and appearance settings available while Pi is starting", async () => {
    const host = createApplicationRuntimeHost();
    const application = createApplication(host);

    expect(application.getBootstrapState()).toMatchObject({
      capabilities: { piRuntime: false },
      piRuntime: { status: "starting" },
    });
    expect(isJsonSafeValue(application.getBootstrapState())).toBe(true);
    expect(application.getSettings().appearance.mode).toBe("system");
    expect((await application.updateAppearanceSettings({ mode: "dark" })).appearance.mode).toBe("dark");
    await expect(application.sendPrompt({ sessionId: "s1", text: "hello" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.runtimeUnavailable,
      operation: "sendPrompt",
    });
    await expect(application.createSession()).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.runtimeUnavailable,
      operation: "createSession",
    });
  });

  test("projects app-owned GitHub and skill metadata before Pi attaches", () => {
    const host = createApplicationRuntimeHost();
    const application = createApplicationService({
      runtime: host,
      versions: {
        appVersion: "0.0.0",
        electron: PINNED_ELECTRON.version,
        embeddedNode: "24.18.1",
      },
      metadataStore: createMemoryMetadataStore({
        ...emptyMetadata(),
        enabledSkillSources: ["codex"],
        githubMcpEnabled: true,
        githubMcpAccountLogin: "octocat",
      }),
    });

    const settings = application.getSettings();
    expect(settings.skills.sources.find((source) => source.sourceId === "codex")?.enabled).toBe(true);
    expect(settings.githubMcp).toMatchObject({
      enabled: true,
      status: "not_started",
      account: { login: "octocat" },
    });
    expect(isJsonSafeValue(settings)).toBe(true);
  });

  test("reports a bounded failure without exposing its cause", async () => {
    const host = createApplicationRuntimeHost();
    const application = createApplication(host);
    const statuses: string[] = [];
    host.subscribeStatus((status) => statuses.push(status.status));

    host.fail(new Error("provider token: secret-value"));

    const bootstrap = application.getBootstrapState();
    expect(bootstrap.piRuntime).toMatchObject({
      status: "failed",
      error: {
        code: HARNESS_ERROR_CODES.runtimeUnavailable,
        recoverable: true,
        operation: "runtimeStartup",
      },
    });
    expect(JSON.stringify(bootstrap)).not.toContain("secret-value");
    expect(isJsonSafeValue(bootstrap)).toBe(true);
    expect(statuses).toEqual(["failed"]);
    await expect(application.listProviderAccounts()).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.runtimeUnavailable,
      operation: "listProviderAccounts",
    });
  });

  test("attaches once and preserves pre-attach command and event subscriptions", async () => {
    const host = createApplicationRuntimeHost();
    const sendPrompt = host.sendPrompt;
    const owned = createDisposableStubHarnessRuntime();
    let publish: ((event: RuntimeEvent) => void) | undefined;
    let unsubscribed = 0;
    let configuredSources: readonly string[] = [];
    const runtime: HarnessRuntime = {
      ...owned,
      getCapabilities: () => ({ piRuntime: true }),
      sendPrompt: async () => ({ runId: "r1" }),
      setEnabledSkillSources(sourceIds) {
        configuredSources = sourceIds;
        return owned.setEnabledSkillSources(sourceIds);
      },
      subscribe(listener) {
        publish = listener;
        return () => {
          unsubscribed += 1;
        };
      },
    };
    const events: RuntimeEvent[] = [];
    const statuses: string[] = [];
    host.subscribe((event) => events.push(event));
    host.subscribeStatus((status) => statuses.push(status.status));
    host.setEnabledSkillSources(["codex"]);

    expect(await host.attach(runtime)).toBe(true);
    expect(configuredSources).toEqual(["codex"]);
    expect(await sendPrompt({ sessionId: "s1", text: "hello" })).toEqual({ runId: "r1" });
    publish?.({
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.sessionActivity,
      payload: [],
      occurredAt: "2026-08-20T00:00:00.000Z",
    });

    expect(host.getStatus()).toEqual({ status: "ready" });
    expect(host.getCapabilities()).toEqual({ piRuntime: true });
    expect(statuses).toEqual(["ready"]);
    expect(events).toHaveLength(1);
    expect(await host.attach(runtime)).toBe(false);
    expect(owned.disposeCount).toBe(0);

    await host.dispose();
    await host.dispose();
    expect(owned.disposeCount).toBe(1);
    expect(unsubscribed).toBe(1);
  });

  test("disposes a runtime arriving after shutdown exactly once", async () => {
    const host = createApplicationRuntimeHost();
    const application = createApplication(host);
    const late = createDisposableStubHarnessRuntime();

    const shutdown = application.shutdown();
    const attached = host.attach(late);
    await shutdown;
    expect(await attached).toBe(false);
    expect(await host.attach(late)).toBe(false);
    expect(late.disposeCount).toBe(1);
    expect(host.disposeCount).toBe(1);
  });
});
