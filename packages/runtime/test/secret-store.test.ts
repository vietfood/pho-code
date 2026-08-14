import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { HARNESS_ERROR_CODES } from "@pho-code/protocol";
import { createMemorySecretStore, createOsSecretStore } from "../src/secret-store";

describe("secret store", () => {
  test("memory store round-trips and deletes", async () => {
    const store = createMemorySecretStore();
    await store.set("svc", "acct", "secret");
    expect(await store.get("svc", "acct")).toBe("secret");
    await store.delete("svc", "acct");
    expect(await store.get("svc", "acct")).toBeUndefined();
  });

  test("unsupported platforms fail closed on write", async () => {
    const store = createOsSecretStore("win32", spawnSync);
    await expect(store.set("svc", "acct", "secret")).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.secretStoreUnavailable,
    });
    expect(await store.get("svc", "acct")).toBeUndefined();
  });

  test("fails closed when the OS refuses to remove a stored token", async () => {
    const macRun = (() => ({ status: 1, stdout: "", stderr: "interaction not allowed" })) as unknown as typeof spawnSync;
    const mac = createOsSecretStore("darwin", macRun);
    await expect(mac.delete("svc", "acct")).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.secretStoreUnavailable,
    });

    let linuxCalls = 0;
    const linuxRun = (() => {
      linuxCalls += 1;
      return linuxCalls === 1
        ? { status: 0, stdout: "secret-tool 0.20", stderr: "" }
        : { status: 1, stdout: "", stderr: "keyring is locked" };
    }) as unknown as typeof spawnSync;
    const linux = createOsSecretStore("linux", linuxRun);
    await expect(linux.delete("svc", "acct")).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.secretStoreUnavailable,
    });
  });

  test("treats an already-absent macOS Keychain item as removed", async () => {
    const run = (() => ({
      status: 44,
      stdout: "",
      stderr: "security: SecKeychainItemDelete: The specified item could not be found in the keychain.",
    })) as unknown as typeof spawnSync;
    const store = createOsSecretStore("darwin", run);
    await expect(store.delete("svc", "acct")).resolves.toBeUndefined();
  });
});
