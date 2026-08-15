import { describe, expect, test } from "bun:test";
import { compactPath, splitRelativePath } from "../src/lib/compact-path";

describe("compactPath", () => {
  test("returns short paths unchanged", () => {
    expect(compactPath("/tmp/ws")).toBe("/tmp/ws");
  });

  test("keeps head and tail of long paths", () => {
    const path = "/Users/lenguyen/Documents/Workspace/Test/piui";
    const compacted = compactPath(path, 24);
    expect(compacted.length).toBeLessThanOrEqual(24);
    expect(compacted.startsWith("/Users")).toBe(true);
    expect(compacted.endsWith("piui")).toBe(true);
    expect(compacted.includes("...")).toBe(true);
  });
});

describe("splitRelativePath", () => {
  test("splits nested paths into directory and basename", () => {
    expect(splitRelativePath("src/lru_cache/cache.py")).toEqual({
      directory: "src/lru_cache",
      name: "cache.py",
    });
  });

  test("keeps a root file name without a directory", () => {
    expect(splitRelativePath("tracked.txt")).toEqual({ directory: "", name: "tracked.txt" });
  });
});
