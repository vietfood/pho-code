import { describe, expect, test } from "bun:test";
import { runBoundedShutdown } from "../../electron/bounded-shutdown";

describe("bounded shutdown", () => {
  test("completes when dispose finishes first", async () => {
    const result = await runBoundedShutdown(async () => undefined, 50);
    expect(result).toBe("completed");
  });

  test("times out a hanging dispose", async () => {
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });

    const result = await runBoundedShutdown(() => blocked, 20);
    expect(result).toBe("timedOut");
    release();
  });

  test("treats a rejected dispose as a failed shutdown instead of throwing", async () => {
    const result = await runBoundedShutdown(async () => {
      throw new Error("dispose exploded");
    }, 50);
    expect(result).toBe("failed");
  });
});
