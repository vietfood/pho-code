import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import {
  evaluateSandboxFileToolAccess,
  SANDBOX_BASH_OS_DENY_REASON,
  SANDBOX_DENY_OWNER_ACTION,
  SANDBOX_FILE_TOOL_OUTSIDE_REASON,
  SANDBOX_FILE_TOOL_PROTECTED_REASON,
  shouldAnnotateSandboxBashFailure,
} from "../src/sandbox-policy";

async function isolatedWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-sandbox-file-policy-"));
  const workspacePath = path.join(root, "workspace");
  const agentDir = path.join(root, "agent");
  await mkdir(workspacePath);
  await mkdir(agentDir);
  return { root, workspacePath, agentDir };
}

describe("sandbox file-tool policy", () => {
  test("allows workspace write and extra write paths", async () => {
    const { root, workspacePath, agentDir } = await isolatedWorkspace();
    const extraWrite = path.join(homedir(), "pho-code-sandbox-file-extra-policy");
    try {
      const workspaceWrite = await evaluateSandboxFileToolAccess({
        toolName: "write",
        requestedPath: "agent-note.txt",
        workspacePath,
        agentDir,
      });
      expect(workspaceWrite.decision).toBe("allow");

      const extra = await evaluateSandboxFileToolAccess({
        toolName: "write",
        requestedPath: path.join(extraWrite, "extra.txt"),
        workspacePath,
        agentDir,
        additionalWritePaths: [extraWrite],
      });
      expect(extra.decision).toBe("allow");
    } finally {
      spawnSync("/usr/bin/trash", [root], { encoding: "utf8" });
    }
  });

  test("denies ~/.ssh/id_rsa, workspace .env, and sibling paths outside policy", async () => {
    const { root, workspacePath, agentDir } = await isolatedWorkspace();
    const sibling = path.join(homedir(), "pho-code-sandbox-file-outside", "sibling-note.txt");
    try {
      const ssh = await evaluateSandboxFileToolAccess({
        toolName: "write",
        requestedPath: path.join(homedir(), ".ssh", "id_rsa"),
        workspacePath,
        agentDir,
      });
      expect(ssh.decision).toBe("deny");
      expect(ssh.reason).toBe(SANDBOX_FILE_TOOL_PROTECTED_REASON);

      const envFile = await evaluateSandboxFileToolAccess({
        toolName: "write",
        requestedPath: ".env",
        workspacePath,
        agentDir,
      });
      expect(envFile.decision).toBe("deny");
      expect(envFile.reason).toBe(SANDBOX_FILE_TOOL_PROTECTED_REASON);

      const keyFile = await evaluateSandboxFileToolAccess({
        toolName: "write",
        requestedPath: "secret.pem",
        workspacePath,
        agentDir,
      });
      expect(keyFile.decision).toBe("deny");
      expect(keyFile.reason).toBe(SANDBOX_FILE_TOOL_PROTECTED_REASON);

      const hooks = await evaluateSandboxFileToolAccess({
        toolName: "write",
        requestedPath: ".git/hooks/pre-commit",
        workspacePath,
        agentDir,
      });
      expect(hooks.decision).toBe("deny");
      expect(hooks.reason).toBe(SANDBOX_FILE_TOOL_PROTECTED_REASON);

      const outside = await evaluateSandboxFileToolAccess({
        toolName: "write",
        requestedPath: sibling,
        workspacePath,
        agentDir,
      });
      expect(outside.decision).toBe("deny");
      expect(outside.reason).toBe(SANDBOX_FILE_TOOL_OUTSIDE_REASON);
    } finally {
      spawnSync("/usr/bin/trash", [root], { encoding: "utf8" });
    }
  });

  test("read stays in-policy for workspace and extra read roots, and denies secret roots", async () => {
    const { root, workspacePath, agentDir } = await isolatedWorkspace();
    await writeFile(path.join(workspacePath, "tracked.txt"), "ok\n");
    const extraRead = path.join(homedir(), "pho-code-sandbox-file-read-policy");
    try {
      const workspaceRead = await evaluateSandboxFileToolAccess({
        toolName: "read",
        requestedPath: "tracked.txt",
        workspacePath,
        agentDir,
      });
      expect(workspaceRead.decision).toBe("allow");

      const extra = await evaluateSandboxFileToolAccess({
        toolName: "read",
        requestedPath: path.join(extraRead, "notes.txt"),
        workspacePath,
        agentDir,
        additionalReadPaths: [extraRead],
      });
      expect(extra.decision).toBe("allow");

      const sshRead = await evaluateSandboxFileToolAccess({
        toolName: "read",
        requestedPath: "~/.ssh/id_rsa",
        workspacePath,
        agentDir,
      });
      expect(sshRead.decision).toBe("deny");
      expect(sshRead.reason).toBe(SANDBOX_FILE_TOOL_PROTECTED_REASON);
    } finally {
      spawnSync("/usr/bin/trash", [root], { encoding: "utf8" });
    }
  });

  test("deny copy tells the agent to stop and ask the owner, not retry", () => {
    expect(SANDBOX_FILE_TOOL_OUTSIDE_REASON).toContain(SANDBOX_DENY_OWNER_ACTION);
    expect(SANDBOX_FILE_TOOL_PROTECTED_REASON).toContain("Do not retry");
    expect(SANDBOX_FILE_TOOL_PROTECTED_REASON).toContain("Settings → Sandbox");
    expect(shouldAnnotateSandboxBashFailure("ls: Operation not permitted")).toBe(true);
    expect(shouldAnnotateSandboxBashFailure("curl: (7) Failed to connect to example.com")).toBe(true);
    expect(shouldAnnotateSandboxBashFailure("command not found: foo")).toBe(false);
    expect(shouldAnnotateSandboxBashFailure(`already noted\n${SANDBOX_BASH_OS_DENY_REASON}`)).toBe(false);
  });
});
