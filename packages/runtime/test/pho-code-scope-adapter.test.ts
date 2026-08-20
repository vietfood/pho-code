import { describe, expect, test } from "bun:test";
import { createPhoCodeScopeAdapter } from "../src/pho-code-scope-adapter";

describe("Pho Code agent scope adapter", () => {
  test("maps a validated workspace identity without deriving path authority from the scope id", () => {
    const adapter = createPhoCodeScopeAdapter();
    const scopeId = adapter.registerWorkspace("/display/workspace", "/canonical/workspace");
    expect(scopeId).toBe("/display/workspace");
    expect(adapter.resolve(scopeId)).toEqual({ runtimeDirectory: "/canonical/workspace" });
  });

  test("rejects an unregistered renderer-controlled scope", () => {
    const adapter = createPhoCodeScopeAdapter();
    expect(() => adapter.resolve("/arbitrary/path")).toThrow("not registered");
  });
});
