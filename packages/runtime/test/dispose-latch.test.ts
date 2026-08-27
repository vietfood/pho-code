import { describe, expect, test } from "bun:test";
import { createDisposeLatch } from "../src/dispose-latch";

describe("dispose latch", () => {
  test("starts undisposed with a zero count", () => {
    const latch = createDisposeLatch();
    expect(latch.disposed).toBe(false);
    expect(latch.count).toBe(0);
  });

  test("exactly one caller claims teardown", () => {
    const latch = createDisposeLatch();
    expect(latch.claim()).toBe(true);
    expect(latch.claim()).toBe(false);
    expect(latch.claim()).toBe(false);
  });

  test("count reaches one and stays there under repeated disposal", () => {
    const latch = createDisposeLatch();
    latch.claim();
    latch.claim();
    latch.claim();
    expect(latch.count).toBe(1);
  });

  test("claiming flips disposed so later commands can be refused", () => {
    const latch = createDisposeLatch();
    expect(latch.disposed).toBe(false);
    latch.claim();
    expect(latch.disposed).toBe(true);
  });

  test("concurrent claimers cannot both run teardown", async () => {
    const latch = createDisposeLatch();
    const claims = await Promise.all(
      Array.from({ length: 8 }, async () => latch.claim()),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(latch.count).toBe(1);
  });
});
