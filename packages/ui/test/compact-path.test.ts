import { describe, expect, test } from "bun:test";
import { compactPath } from "../src/lib/compact-path";

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
