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
});
