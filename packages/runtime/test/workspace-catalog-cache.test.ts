import { describe, expect, test } from "bun:test";
import { createWorkspaceCatalogCache, type WorkspaceCatalog } from "../src/workspace-catalog-cache";

const catalog = (overrides: Partial<WorkspaceCatalog> = {}): WorkspaceCatalog => ({
  models: [],
  sessions: [],
  ...overrides,
});

describe("workspace catalog cache", () => {
  test("returns the catalog only for the workspace that filled the slot", () => {
    const cache = createWorkspaceCatalogCache();
    cache.set("/tmp/a", catalog());
    expect(cache.get("/tmp/a")).toBeDefined();
    expect(cache.get("/tmp/b")).toBeUndefined();
  });

  test("holds one workspace at a time", () => {
    const cache = createWorkspaceCatalogCache();
    cache.set("/tmp/a", catalog());
    cache.set("/tmp/b", catalog());
    expect(cache.get("/tmp/a")).toBeUndefined();
    expect(cache.get("/tmp/b")).toBeDefined();
  });

  test("omits modelError rather than storing an undefined key", () => {
    const cache = createWorkspaceCatalogCache();
    const stored = cache.set("/tmp/a", catalog());
    expect("modelError" in stored).toBe(false);
    expect("modelError" in (cache.get("/tmp/a") ?? {})).toBe(false);
  });

  test("round-trips a modelError when one is present", () => {
    const cache = createWorkspaceCatalogCache();
    cache.set("/tmp/a", catalog({ modelError: "no provider" }));
    expect(cache.get("/tmp/a")?.modelError).toBe("no provider");
  });

  test("hands out a fresh wrapper each read, but shares the underlying lists", () => {
    const cache = createWorkspaceCatalogCache();
    cache.set("/tmp/a", catalog());
    const first = cache.get("/tmp/a");
    const second = cache.get("/tmp/a");
    // Fresh wrapper: reassigning a field on one read cannot affect the next.
    expect(first).not.toBe(second);

    // The model/session arrays are shared by reference, exactly as the inlined
    // cache behaved. Callers must not mutate them in place.
    const returned = cache.set("/tmp/b", catalog());
    returned.models.push({ id: "leaked" } as unknown as WorkspaceCatalog["models"][number]);
    expect(cache.get("/tmp/b")?.models).toHaveLength(1);
    expect(cache.get("/tmp/b")?.models).toBe(returned.models);
  });

  test("clear empties the slot", () => {
    const cache = createWorkspaceCatalogCache();
    cache.set("/tmp/a", catalog());
    cache.clear();
    expect(cache.get("/tmp/a")).toBeUndefined();
  });
});
