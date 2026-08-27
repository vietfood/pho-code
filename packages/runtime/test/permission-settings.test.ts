import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { HARNESS_ERROR_CODES } from "@pho-code/protocol";
import {
  BALANCED_PERMISSION,
  DEVELOPER_PERMISSION,
  GUARDED_PERMISSION,
  HARNESS_ALWAYS_ALLOW_PERMISSION,
  MANAGED_WEB_PERMISSION,
} from "../src/permission-presets";
import {
  applyPermissionSettingsPatch,
  detectPermissionProfile,
  patchPermissionConfig,
  permissionPolicyForProfile,
  readPermissionSettings,
  SANDBOX_PERMISSION_AUTHORIZER_NAME,
  syncHarnessPermissionPolicy,
} from "../src/permission-settings";

async function makeAgentDir() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-test-"));
  const agentDir = path.join(root, "agent");
  await mkdir(agentDir);
  return agentDir;
}

describe("permission settings adapter", () => {
  test("keeps stable keys for the three v3 owner-facing modes", () => {
    expect(permissionPolicyForProfile("guarded")).toEqual(GUARDED_PERMISSION);
    expect(permissionPolicyForProfile("balanced")).toEqual(BALANCED_PERMISSION);
    expect(permissionPolicyForProfile("developer")).toEqual(DEVELOPER_PERMISSION);
    expect(detectPermissionProfile(GUARDED_PERMISSION)).toBe("guarded");
    expect(detectPermissionProfile(BALANCED_PERMISSION)).toBe("balanced");
    expect(detectPermissionProfile(DEVELOPER_PERMISSION)).toBe("developer");
    expect(detectPermissionProfile({ "*": "allow" })).toBe("custom");
    expect(detectPermissionProfile(undefined)).toBe("custom");
    for (const permission of [GUARDED_PERMISSION, BALANCED_PERMISSION, DEVELOPER_PERMISSION]) {
      expect(permission).toMatchObject({
        ...HARNESS_ALWAYS_ALLOW_PERMISSION,
        ...MANAGED_WEB_PERMISSION,
      });
    }
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

  test("recognizes existing Guarded and Balanced files without rewriting them", async () => {
    const agentDir = await makeAgentDir();
    const configPath = path.join(agentDir, "extensions", "pi-permission-system", "config.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify({ permission: BALANCED_PERMISSION }, null, 2)}\n`);
    expect(readPermissionSettings({ agentDir }).profile).toBe("balanced");
    await writeFile(configPath, `${JSON.stringify({ permission: GUARDED_PERMISSION }, null, 2)}\n`);
    expect(readPermissionSettings({ agentDir }).profile).toBe("guarded");
    const next = applyPermissionSettingsPatch({ agentDir, patch: { profile: "developer" } });
    expect(next.profile).toBe("developer");
    const written = JSON.parse(await readFile(configPath, "utf8")) as { permission: unknown };
    expect(detectPermissionProfile(written.permission)).toBe("developer");
  });

  test("still recognizes a v3 developer file after web_search/fetch_content flipped", () => {
    const previousDeveloper = {
      ...DEVELOPER_PERMISSION,
      web_search: "ask",
      fetch_content: "allow",
    };
    expect(detectPermissionProfile(previousDeveloper)).toBe("developer");
  });

  test("syncs ask_user_question onto an existing managed file so * ask cannot catch it", async () => {
    const agentDir = await makeAgentDir();
    const configPath = path.join(agentDir, "extensions", "pi-permission-system", "config.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    const stale = { ...BALANCED_PERMISSION } as Record<string, unknown>;
    delete stale.ask_user_question;
    delete stale.update_plan_document;
    delete stale.todo;
    delete stale.execute_plan;
    delete stale.web_search;
    delete stale.fetch_content;
    await writeFile(configPath, `${JSON.stringify({ permission: stale }, null, 2)}\n`);
    expect(readPermissionSettings({ agentDir }).profile).toBe("balanced");
    const before = JSON.parse(await readFile(configPath, "utf8")) as { permission: Record<string, unknown> };
    expect(before.permission.ask_user_question).toBeUndefined();
    syncHarnessPermissionPolicy(agentDir);
    const after = JSON.parse(await readFile(configPath, "utf8")) as { permission: Record<string, unknown> };
    expect(after.permission.ask_user_question).toBe("allow");
    expect(after.permission.update_plan_document).toBe("allow");
    expect(after.permission.todo).toBe("allow");
    expect(after.permission.execute_plan).toBe("allow");
    expect(after.permission.web_search).toBe("allow");
    expect(after.permission.fetch_content).toBe("ask");
    expect(readPermissionSettings({ agentDir }).profile).toBe("balanced");
  });

  test("syncs harness allows onto Custom without changing web_search", async () => {
    const agentDir = await makeAgentDir();
    const configPath = path.join(agentDir, "extensions", "pi-permission-system", "config.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify({ permission: { "*": "ask", web_search: "ask" } }, null, 2)}\n`,
    );
    syncHarnessPermissionPolicy(agentDir);
    const after = JSON.parse(await readFile(configPath, "utf8")) as { permission: Record<string, unknown> };
    expect(after.permission.ask_user_question).toBe("allow");
    expect(after.permission.todo).toBe("allow");
    expect(after.permission.update_plan_document).toBe("allow");
    expect(after.permission.execute_plan).toBe("allow");
    expect(after.permission.web_search).toBe("ask");
    expect(after.permission.fetch_content).toBeUndefined();
    expect(readPermissionSettings({ agentDir }).profile).toBe("custom");
  });

  test("syncs the sandbox authorizer into authorizerChain without replacing owner links", async () => {
    const agentDir = await makeAgentDir();
    const configPath = path.join(agentDir, "extensions", "pi-permission-system", "config.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify({ permission: BALANCED_PERMISSION, authorizerChain: ["owner-judge"] }, null, 2)}\n`,
    );
    syncHarnessPermissionPolicy(agentDir);
    const after = JSON.parse(await readFile(configPath, "utf8")) as { authorizerChain: string[] };
    expect(after.authorizerChain).toEqual(["owner-judge", SANDBOX_PERMISSION_AUTHORIZER_NAME]);
    const patched = patchPermissionConfig({ permission: GUARDED_PERMISSION }, { profile: "developer" });
    expect(patched.authorizerChain).toEqual([SANDBOX_PERMISSION_AUTHORIZER_NAME]);
  });

  test("every v3 preset explicitly denies permanent removal", () => {
    for (const profile of ["guarded", "balanced", "developer"] as const) {
      const permission = permissionPolicyForProfile(profile);
      const bash = permission.bash as Record<string, unknown>;
      for (const command of ["rm *", "unlink *", "rmdir *", "shred *", "find * -delete"]) {
        expect(bash[command]).toEqual({
          action: "deny",
          reason: "Permanent removal is unavailable. Use the move_to_trash tool.",
        });
      }
    }
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
