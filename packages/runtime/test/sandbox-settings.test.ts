import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  canonicalizeSandboxPath,
  coerceStoredSandboxSettings,
  createSandboxSettingsStore,
  emptyStoredSandboxSettings,
  loadSandboxSettings,
  saveSandboxSettings,
} from "../src/sandbox-settings";

describe("sandbox settings persistence", () => {
  test("round-trips owner policy under application data", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-code-sandbox-settings-"));
    const stored = {
      ...emptyStoredSandboxSettings(),
      enabled: true,
      networkMode: "allowlist" as const,
      allowedDomains: ["github.com", "*.npmjs.org"],
      includePackageRegistryDefaults: true,
      additionalWritePaths: ["/tmp/pho-extra-write"],
    };
    saveSandboxSettings(root, stored);
    expect(JSON.parse(await readFile(path.join(root, "sandbox-settings.json"), "utf8"))).toEqual(stored);
    expect(loadSandboxSettings(root)).toEqual(stored);
  });

  test("corrupt or wildcard files fail closed to defaults", () => {
    expect(coerceStoredSandboxSettings({ enabled: true, allowedDomains: ["*"] })).toBeUndefined();
    expect(coerceStoredSandboxSettings("nope")).toBeUndefined();
    expect(loadSandboxSettings("/tmp/pho-code-missing-sandbox-settings")).toEqual(emptyStoredSandboxSettings());
    expect(emptyStoredSandboxSettings().enabled).toBe(true);
  });

  test("missing enabled key defaults on; explicit false is kept", () => {
    expect(coerceStoredSandboxSettings({ networkMode: "deny" })?.enabled).toBe(true);
    expect(coerceStoredSandboxSettings({ enabled: false })?.enabled).toBe(false);
    expect(coerceStoredSandboxSettings({ enabled: true })?.enabled).toBe(true);
  });

  test("canonicalizes ~ and rejects parent traversal after resolve", () => {
    expect(canonicalizeSandboxPath("/tmp/pho-extra")).toBe(path.resolve("/tmp/pho-extra"));
    expect(canonicalizeSandboxPath("~/Documents").startsWith("/")).toBe(true);
  });
});

describe("sandbox settings store", () => {
  async function isolatedDataDir(): Promise<string> {
    return mkdtemp(path.join(tmpdir(), "pho-code-sandbox-store-"));
  }

  test("starts from whatever is on disk", async () => {
    const root = await isolatedDataDir();
    saveSandboxSettings(root, { ...emptyStoredSandboxSettings(), enabled: true, networkMode: "allowlist" });
    const store = createSandboxSettingsStore(root);
    expect(store.current.enabled).toBe(true);
    expect(store.current.networkMode).toBe("allowlist");
  });

  test("apply patches and persists in one step", async () => {
    const root = await isolatedDataDir();
    const store = createSandboxSettingsStore(root);
    store.apply({ enabled: true, allowedDomains: ["github.com"] });

    expect(store.current.enabled).toBe(true);
    // A second store reading the same directory proves the patch reached disk.
    expect(createSandboxSettingsStore(root).current).toEqual(store.current);
  });

  test("apply leaves unpatched fields alone", async () => {
    const root = await isolatedDataDir();
    const store = createSandboxSettingsStore(root);
    store.apply({ enabled: true, allowedDomains: ["github.com"] });
    store.apply({ networkMode: "allowlist" });

    expect(store.current.networkMode).toBe("allowlist");
    expect(store.current.enabled).toBe(true);
    expect(store.current.allowedDomains).toEqual(["github.com"]);
  });

  test("disableWithoutPersisting never writes a settings file", async () => {
    const root = await isolatedDataDir();
    saveSandboxSettings(root, { ...emptyStoredSandboxSettings(), enabled: true });
    const store = createSandboxSettingsStore(root);
    store.disableWithoutPersisting();

    expect(store.current.enabled).toBe(false);
    // On-disk state is untouched, so the next run still opts in.
    expect(createSandboxSettingsStore(root).current.enabled).toBe(true);
  });
});
