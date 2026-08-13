import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { HARNESS_ERROR_CODES } from "@pho-code/protocol";
import {
  BALANCED_PERMISSION,
  GUARDED_PERMISSION,
  applyPermissionSettingsPatch,
  detectPermissionProfile,
  patchPermissionConfig,
  permissionPolicyForProfile,
  readPermissionSettings,
} from "../src/permission-settings";

async function makeAgentDir() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-test-"));
  const agentDir = path.join(root, "agent");
  await mkdir(agentDir);
  return agentDir;
}

describe("permission settings adapter", () => {
  test("maps Guarded and Balanced to the reviewed policies", () => {
    expect(permissionPolicyForProfile("guarded")).toEqual(GUARDED_PERMISSION);
    expect(permissionPolicyForProfile("balanced")).toEqual(BALANCED_PERMISSION);
    expect(detectPermissionProfile(GUARDED_PERMISSION)).toBe("guarded");
    expect(detectPermissionProfile(BALANCED_PERMISSION)).toBe("balanced");
    expect(detectPermissionProfile({ "*": "allow" })).toBe("custom");
    expect(detectPermissionProfile(undefined)).toBe("custom");
  });

  test("treats string catch-alls as equivalent to a * map", () => {
    expect(
      detectPermissionProfile({
        "*": "ask",
        path: {
          "*": "ask",
          "*.env": "deny",
          "*.env.*": "deny",
          "*.env.example": "ask",
          "~/.ssh/*": "deny",
        },
        external_directory: { "*": "ask" },
      }),
    ).toBe("guarded");
  });

  test("preserves a Custom policy when only YOLO changes", () => {
    const existing = {
      debugLog: true,
      permission: { "*": "deny", bash: "ask" },
    };
    const next = patchPermissionConfig(existing, { yoloMode: true });
    expect(next.debugLog).toBe(true);
    expect(next.permission).toEqual({ "*": "deny", bash: "ask" });
    expect(next.yoloMode).toBe(true);
    expect(detectPermissionProfile(next.permission)).toBe("custom");
  });

  test("replaces Custom only when a managed preset is chosen", () => {
    const existing = { permission: { "*": "deny" }, doublePressToConfirm: false };
    const next = patchPermissionConfig(existing, { profile: "balanced" });
    expect(next.permission).toEqual(BALANCED_PERMISSION);
    expect(next.doublePressToConfirm).toBe(false);
    expect(Object.keys(next.permission as object)).toEqual(Object.keys(BALANCED_PERMISSION));
  });

  test("refuses unrecognized or invalid existing config", () => {
    expect(() => patchPermissionConfig({ mystery: true }, { yoloMode: true })).toThrow(
      expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidPermissionConfig }),
    );
    expect(() => patchPermissionConfig({ yoloMode: "yes" }, { permissionReviewLog: true })).toThrow(
      expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidPermissionConfig }),
    );
    expect(() =>
      patchPermissionConfig(
        { permission: { bash: { action: "deny", reason: "top-level deny objects are invalid" } } },
        { permissionReviewLog: true },
      ),
    ).toThrow(expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidPermissionConfig }));
    expect(() =>
      patchPermissionConfig(
        { shellTools: { exec_command: { commandArgument: "cmd", extra: true } } },
        { permissionReviewLog: true },
      ),
    ).toThrow(expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidPermissionConfig }));
    expect(() =>
      patchPermissionConfig(
        { shellTools: { exec_command: { commandArgument: "cmd", workdirArgument: "" } } },
        { permissionReviewLog: true },
      ),
    ).toThrow(expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidPermissionConfig }));
  });

  test("atomically writes a managed preset and keeps unowned fields", async () => {
    const agentDir = await makeAgentDir();
    const configPath = path.join(agentDir, "extensions", "pi-permission-system", "config.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify({ debugLog: true, shellTools: { exec_command: { commandArgument: "cmd" } } }, null, 2)}\n`,
    );
    const snapshot = applyPermissionSettingsPatch({
      agentDir,
      appliesToSharedPiAgentDir: true,
      patch: { profile: "guarded", permissionReviewLog: false },
    });
    expect(snapshot.profile).toBe("guarded");
    expect(snapshot.permissionReviewLog).toBe(false);
    expect(snapshot.appliesToSharedPiAgentDir).toBe(true);
    const written = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
    expect(written.debugLog).toBe(true);
    expect(written.permission).toEqual(GUARDED_PERMISSION);
    expect(written.permissionReviewLog).toBe(false);
    expect(Object.keys(written.permission as object)).toEqual(Object.keys(GUARDED_PERMISSION));
  });

  test("detects a project override without editing it", async () => {
    const agentDir = await makeAgentDir();
    const workspaceDir = path.join(path.dirname(agentDir), "workspace");
    await mkdir(path.join(workspaceDir, ".pi", "extensions", "pi-permission-system"), { recursive: true });
    await writeFile(
      path.join(workspaceDir, ".pi", "extensions", "pi-permission-system", "config.json"),
      `${JSON.stringify({ yoloMode: true }, null, 2)}\n`,
    );
    const snapshot = readPermissionSettings({ agentDir, workspacePath: workspaceDir });
    expect(snapshot.projectOverridePresent).toBe(true);
    expect(snapshot.yoloMode).toBe(false);
    expect(snapshot.appliesToSharedPiAgentDir).toBe(false);
  });
});
