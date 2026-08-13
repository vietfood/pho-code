import { describe, expect, test } from "bun:test";
import { createDisposableStubHarnessRuntime } from "../src/index";

describe("stub harness runtime", () => {
  test("reports that the Pi runtime is not available during bootstrap", () => {
    const runtime = createDisposableStubHarnessRuntime();
    expect(runtime.getCapabilities()).toEqual({ piRuntime: false });
  });

  test("dispose is idempotent and ends the stub lifecycle", async () => {
    const runtime = createDisposableStubHarnessRuntime();
    await runtime.dispose();
    await runtime.dispose();
    expect(runtime.disposed).toBe(true);
    expect(runtime.disposeCount).toBe(1);
  });
});
