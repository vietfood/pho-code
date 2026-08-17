import { describe, expect, test } from "bun:test";
import { SANDBOX_FILE_TOOL_MISSING_PATH_REASON } from "../src/sandbox-policy";
import {
  bindSandboxPermissionAuthorizer,
  shouldDenySandboxFileToolAsk,
  shouldSkipSandboxBashAsk,
  shouldSkipSandboxFileToolAsk,
} from "../src/sandbox-permission";
import type { AgentSandbox, SandboxRuntimeSnapshot } from "../src/sandbox-runtime";

function snapshot(status: SandboxRuntimeSnapshot["status"], enabled = true): SandboxRuntimeSnapshot {
  return {
    enabled,
    status: enabled ? status : "off",
    platformSupported: true,
  };
}

describe("sandbox permission skip", () => {
  test("skips agent bash asks only while the box is healthy", () => {
    expect(shouldSkipSandboxBashAsk(snapshot("healthy"), { toolName: "bash", surface: "bash" })).toBe(true);
    expect(shouldSkipSandboxBashAsk(snapshot("healthy"), { toolName: "user_bash", surface: "bash" })).toBe(true);
    expect(shouldSkipSandboxBashAsk(snapshot("healthy"), { surface: "bash" })).toBe(true);
    expect(shouldSkipSandboxBashAsk(snapshot("off", false), { toolName: "bash", surface: "bash" })).toBe(false);
    expect(shouldSkipSandboxBashAsk(snapshot("failed"), { toolName: "bash", surface: "bash" })).toBe(false);
    expect(shouldSkipSandboxBashAsk(snapshot("starting"), { toolName: "bash", surface: "bash" })).toBe(false);
    expect(shouldSkipSandboxBashAsk(snapshot("unavailable"), { toolName: "bash", surface: "bash" })).toBe(false);
  });

  test("never converts path, external-directory, file-tool, or MCP asks via the bash skip", () => {
    const healthy = snapshot("healthy");
    expect(shouldSkipSandboxBashAsk(healthy, { toolName: "bash", surface: "external_directory" })).toBe(false);
    expect(shouldSkipSandboxBashAsk(healthy, { toolName: "bash", accessIntent: { surface: "path" } })).toBe(false);
    expect(shouldSkipSandboxBashAsk(healthy, { toolName: "write", surface: "write" })).toBe(false);
    expect(shouldSkipSandboxBashAsk(healthy, { toolName: "mcp", surface: "mcp" })).toBe(false);
    expect(shouldSkipSandboxBashAsk(healthy, { toolName: "read", surface: "read" })).toBe(false);
  });

  test("skips in-policy file-tool asks and denies out-of-policy asks, including excluded surfaces", () => {
    const healthy = snapshot("healthy");
    const allow = { action: "allow" as const };
    const deny = { action: "deny" as const, reason: "Sandbox policy denied this file tool." };
    expect(shouldSkipSandboxFileToolAsk(healthy, { toolName: "write", surface: "write" }, allow)).toBe(true);
    expect(shouldSkipSandboxFileToolAsk(healthy, { toolName: "edit", surface: "edit" }, allow)).toBe(true);
    expect(shouldSkipSandboxFileToolAsk(healthy, { toolName: "read", surface: "read" }, allow)).toBe(true);
    expect(shouldSkipSandboxFileToolAsk(healthy, { toolName: "write", surface: "external_directory" }, allow)).toBe(
      false,
    );
    expect(shouldSkipSandboxFileToolAsk(healthy, { toolName: "write", accessIntent: { surface: "path" } }, allow)).toBe(
      false,
    );
    expect(shouldSkipSandboxFileToolAsk(healthy, { toolName: "mcp", surface: "mcp" }, allow)).toBe(false);
    expect(shouldSkipSandboxFileToolAsk(snapshot("failed"), { toolName: "write", surface: "write" }, allow)).toBe(false);
    expect(shouldDenySandboxFileToolAsk(healthy, { toolName: "write", surface: "write" }, deny)).toBe(true);
    expect(shouldDenySandboxFileToolAsk(healthy, { toolName: "write", surface: "external_directory" }, deny)).toBe(true);
    expect(shouldDenySandboxFileToolAsk(healthy, { toolName: "bash", surface: "bash" }, deny)).toBe(false);
    expect(shouldDenySandboxFileToolAsk(snapshot("failed"), { toolName: "write", surface: "write" }, deny)).toBe(false);
    expect(shouldDenySandboxFileToolAsk(snapshot("off", false), { toolName: "write", surface: "write" }, deny)).toBe(
      false,
    );
  });

  test("missing-path file-tool asks deny only while the box is healthy", async () => {
    const key = Symbol.for("@gotgenes/pi-permission-system:service");
    const previous = (globalThis as Record<symbol, unknown>)[key];
    let authorize:
      | ((
          details: { toolName?: string; surface?: string | null },
          query: unknown,
          log: { review: (event: string, payload?: unknown) => void },
        ) => Promise<{ kind: string; reason?: string }>)
      | undefined;
    (globalThis as Record<symbol, unknown>)[key] = {
      registerAuthorizer(_name: string, next: typeof authorize) {
        authorize = next;
        return () => undefined;
      },
    };
    const log = { review() {} };
    const query = {};
    try {
      bindSandboxPermissionAuthorizer(
        { on() {} },
        { snapshot: () => snapshot("off", false), evaluateFileTool: async () => ({ action: "defer" as const }) } as AgentSandbox,
      );
      expect(authorize).toBeDefined();
      await expect(authorize!({ toolName: "write", surface: "write" }, query, log)).resolves.toEqual({ kind: "defer" });

      bindSandboxPermissionAuthorizer(
        { on() {} },
        { snapshot: () => snapshot("failed"), evaluateFileTool: async () => ({ action: "defer" as const }) } as AgentSandbox,
      );
      await expect(authorize!({ toolName: "write", surface: "write" }, query, log)).resolves.toEqual({ kind: "defer" });

      bindSandboxPermissionAuthorizer(
        { on() {} },
        { snapshot: () => snapshot("healthy"), evaluateFileTool: async () => ({ action: "defer" as const }) } as AgentSandbox,
      );
      await expect(authorize!({ toolName: "write", surface: "write" }, query, log)).resolves.toEqual({
        kind: "deny",
        reason: SANDBOX_FILE_TOOL_MISSING_PATH_REASON,
      });
    } finally {
      if (previous === undefined) {
        delete (globalThis as Record<symbol, unknown>)[key];
      } else {
        (globalThis as Record<symbol, unknown>)[key] = previous;
      }
    }
  });

  test("registers against the published global slot without importing the package", () => {
    const key = Symbol.for("@gotgenes/pi-permission-system:service");
    const names: string[] = [];
    const previous = (globalThis as Record<symbol, unknown>)[key];
    (globalThis as Record<symbol, unknown>)[key] = {
      registerAuthorizer(name: string) {
        names.push(name);
        return () => undefined;
      },
    };
    try {
      bindSandboxPermissionAuthorizer(
        { on() {} },
        { snapshot: () => snapshot("healthy") } as AgentSandbox,
      );
      expect(names).toEqual(["pho-code-sandbox"]);
    } finally {
      if (previous === undefined) {
        delete (globalThis as Record<symbol, unknown>)[key];
      } else {
        (globalThis as Record<symbol, unknown>)[key] = previous;
      }
    }
  });
});
