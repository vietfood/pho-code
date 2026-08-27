import { mkdir, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import {
  AgentBashUnavailableError,
  agentBashUnavailableMessage,
  createAgentSandbox,
  resolveRipgrepPath,
  type SandboxEngine,
} from "../src/sandbox-runtime";
import {
  assertNoWeakerSandboxFlags,
  buildSandboxRuntimeConfig,
  SANDBOX_BASH_OS_DENY_REASON,
} from "../src/sandbox-policy";
import { SANDBOX_RUNTIME_PACKAGE, SANDBOX_RUNTIME_VERSION, RIPGREP_VERSION } from "../src/sandbox-artifact";
import { findExecutableOnPath } from "../src/process-launch";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

async function isolatedWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-sandbox-"));
  const workspacePath = path.join(root, "workspace");
  const agentDir = path.join(root, "agent");
  await mkdir(workspacePath);
  await mkdir(agentDir);
  return { root, workspacePath, agentDir };
}

function collectOutput() {
  let text = "";
  return {
    onData(data: Buffer) {
      text += data.toString("utf8");
    },
    text() {
      return text;
    },
  };
}

describe("sandbox policy", () => {
  test("deny-network config writes the workspace and temp, and never sets weaker isolation flags", () => {
    const config = buildSandboxRuntimeConfig({
      workspacePath: "/tmp/pho-workspace",
      networkMode: "deny",
      agentDir: "/tmp/pho-agent",
      rgPath: "/tmp/rg",
    });
    expect(config.network.allowedDomains).toEqual([]);
    expect(config.network.strictAllowlist).toBe(true);
    expect(config.filesystem.allowWrite).toContain(path.resolve("/tmp/pho-workspace"));
    expect(config.filesystem.denyRead).toContain("~/.ssh");
    expect(config.filesystem.denyRead).toContain(path.resolve("/tmp/pho-agent"));
    expect(config.filesystem.denyWrite).toContain(".env");
    expect(config.ripgrep?.command).toBe("/tmp/rg");
    expect(config.enableWeakerNestedSandbox).toBeUndefined();
    expect(config.enableWeakerNetworkIsolation).toBeUndefined();
    expect(config.allowAppleEvents).toBeUndefined();
    assertNoWeakerSandboxFlags(config);
  });

  test("rejects a wildcard domain allowlist", () => {
    expect(() =>
      buildSandboxRuntimeConfig({
        workspacePath: "/tmp/pho-workspace",
        networkMode: "allowlist",
        allowedDomains: ["*"],
      }),
    ).toThrow(/\*/);
  });

  test("allowlist unions baked registry defaults when the toggle is on", () => {
    const config = buildSandboxRuntimeConfig({
      workspacePath: "/tmp/pho-workspace",
      networkMode: "allowlist",
      allowedDomains: ["example.com"],
      includePackageRegistryDefaults: true,
    });
    expect(config.network.allowedDomains).toContain("example.com");
    expect(config.network.allowedDomains).toContain("registry.npmjs.org");
    expect(config.network.strictAllowlist).toBe(true);
  });
});

describe("sandbox status mapping", () => {
  test("stays off and uses unsandboxed bash when disabled", async () => {
    const { workspacePath } = await isolatedWorkspace();
    const sandbox = createAgentSandbox({
      enabled: false,
      workspacePath,
      engine: explodingEngine(),
    });
    expect(sandbox.snapshot()).toEqual({
      enabled: false,
      status: "off",
      platformSupported: process.platform === "darwin",
    });
    const output = collectOutput();
    const result = await sandbox.bashOperations().exec("printf unsandboxed", workspacePath, {
      onData: output.onData,
    });
    expect(result.exitCode).toBe(0);
    expect(output.text()).toContain("unsandboxed");
  });

  test("unsupported platform is unavailable and refuses bash", async () => {
    const { workspacePath } = await isolatedWorkspace();
    const sandbox = createAgentSandbox({
      enabled: true,
      workspacePath,
      platform: "win32",
      rgPath: "/usr/bin/true",
      engine: explodingEngine(),
    });
    const snapshot = await sandbox.initialize();
    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.statusReason).toBe("unsupported-platform");
    await expect(
      sandbox.bashOperations().exec("pwd", workspacePath, { onData() {} }),
    ).rejects.toBeInstanceOf(AgentBashUnavailableError);
    expect(agentBashUnavailableMessage("unsupported-platform")).toContain("does not support");
    await sandbox.reset();
    expect(sandbox.snapshot().status).toBe("off");
  });

  test("missing rg becomes rg-missing and refuses bash when enabled", async () => {
    const { workspacePath } = await isolatedWorkspace();
    const sandbox = createAgentSandbox({
      enabled: true,
      workspacePath,
      platform: "darwin",
      sandboxExecPath: "/bin/sh",
      pathEnv: "/usr/bin:/bin",
      engine: explodingEngine(),
    });
    const snapshot = await sandbox.initialize();
    expect(snapshot.status).toBe("failed");
    expect(snapshot.statusReason).toBe("rg-missing");
    await expect(
      sandbox.bashOperations().exec("pwd", workspacePath, { onData() {} }),
    ).rejects.toMatchObject({ statusReason: "rg-missing" });
    await sandbox.reset();
  });

  test("missing sandbox-exec becomes sandbox-exec and refuses bash", async () => {
    const { workspacePath } = await isolatedWorkspace();
    const sandbox = createAgentSandbox({
      enabled: true,
      workspacePath,
      platform: "darwin",
      sandboxExecPath: path.join(workspacePath, "missing-sandbox-exec"),
      rgPath: findExecutableOnPath("rg") ?? "/usr/bin/true",
      engine: explodingEngine(),
    });
    const snapshot = await sandbox.initialize();
    expect(snapshot.status).toBe("failed");
    expect(snapshot.statusReason).toBe("sandbox-exec");
    await sandbox.reset();
  });

  test("engine init failure is failed/init and reset does not hang", async () => {
    const { workspacePath } = await isolatedWorkspace();
    let resetCalls = 0;
    const sandbox = createAgentSandbox({
      enabled: true,
      workspacePath,
      platform: "darwin",
      sandboxExecPath: "/usr/bin/sandbox-exec",
      rgPath: findExecutableOnPath("rg") ?? path.join(workspacePath, "rg"),
      engine: {
        async initialize() {
          throw new Error("proxy bind failed");
        },
        async wrapWithSandbox() {
          throw new Error("should not wrap");
        },
        async reset() {
          resetCalls += 1;
        },
      },
    });
    const snapshot = await sandbox.initialize();
    expect(snapshot.status).toBe("failed");
    expect(snapshot.statusReason).toBe("init");
    expect(resetCalls).toBeGreaterThan(0);
    const resetStarted = Date.now();
    await sandbox.reset();
    expect(Date.now() - resetStarted).toBeLessThan(2_000);
  });

  test("a later initialize applies after an in-flight start", async () => {
    const { workspacePath } = await isolatedWorkspace();
    const firstWorkspace = path.join(workspacePath, "first");
    const secondWorkspace = path.join(workspacePath, "second");
    await mkdir(firstWorkspace);
    await mkdir(secondWorkspace);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const workspaces: string[] = [];
    const sandbox = createAgentSandbox({
      enabled: true,
      workspacePath: firstWorkspace,
      platform: "darwin",
      sandboxExecPath: "/bin/sh",
      rgPath: findExecutableOnPath("rg") ?? "/usr/bin/true",
      engine: {
        async initialize(config) {
          workspaces.push(config.filesystem.allowWrite[0] ?? "");
          await gate;
        },
        async wrapWithSandbox() {
          throw new Error("should not wrap");
        },
        async reset() {},
      },
    });
    const first = sandbox.initialize({ workspacePath: firstWorkspace });
    const second = sandbox.initialize({ workspacePath: secondWorkspace });
    release();
    const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);
    expect(firstSnapshot).toEqual(secondSnapshot);
    expect(secondSnapshot.status).toBe("healthy");
    expect(workspaces.at(-1)).toBe(path.resolve(secondWorkspace));
    await sandbox.reset();
  });
});

const describeMac = process.platform === "darwin" ? describe : describe.skip;

describeMac("sandboxed bash wrap", () => {
  test(
    "wrapped bash can write the workspace, cannot read ~/.ssh, and cannot reach the network",
    async () => {
      const rgPath = resolveRipgrepPath() ?? findExecutableOnPath("rg");
      expect(rgPath).toBeTruthy();
      const { workspacePath, agentDir } = await isolatedWorkspace();
      const sandbox = createAgentSandbox({
        enabled: true,
        workspacePath,
        agentDir,
        rgPath,
        networkMode: "deny",
      });
      const snapshot = await sandbox.initialize();
      expect(snapshot.status).toBe("healthy");
      expect(SANDBOX_RUNTIME_PACKAGE).toBe("@anthropic-ai/sandbox-runtime");
      expect(SANDBOX_RUNTIME_VERSION).toBe("0.0.73");
      expect(RIPGREP_VERSION).toBe("15.2.0");

      const ops = sandbox.bashOperations();
      const touchOut = collectOutput();
      const touch = await ops.exec("touch wrapped.txt && printf ok", workspacePath, {
        onData: touchOut.onData,
      });
      expect(touch.exitCode).toBe(0);
      expect(existsSync(path.join(workspacePath, "wrapped.txt"))).toBe(true);

      const tool = createBashTool(workspacePath, { operations: ops });
      const toolResult = await tool.execute("sandbox-touch", { command: "printf tool-ok" }, new AbortController().signal, () => {});
      const toolText = toolResult.content.map((part) => ("text" in part ? part.text : "")).join("");
      expect(toolText).toContain("tool-ok");

      const sshOut = collectOutput();
      const ssh = await ops.exec("ls ~/.ssh", workspacePath, { onData: sshOut.onData });
      expect(ssh.exitCode).not.toBe(0);
      expect(`${sshOut.text()}`).toMatch(/Operation not permitted|Permission denied|not permitted/i);
      expect(`${sshOut.text()}`).toContain(SANDBOX_BASH_OS_DENY_REASON);

      const curlOut = collectOutput();
      const curl = await ops.exec("curl -sS -o /dev/null --max-time 5 https://example.com", workspacePath, {
        onData: curlOut.onData,
      });
      expect(curl.exitCode).not.toBe(0);
      expect(`${curlOut.text()}`.toLowerCase()).not.toContain("<html");
      expect(`${curlOut.text()}`).toContain(SANDBOX_BASH_OS_DENY_REASON);

      await sandbox.reset();
      expect(sandbox.snapshot().status).toBe("off");
    },
    30_000,
  );

  test(
    "extra write path outside the workspace is writable and a sibling path is not",
    async () => {
      const rgPath = resolveRipgrepPath() ?? findExecutableOnPath("rg");
      expect(rgPath).toBeTruthy();
      const { workspacePath, agentDir } = await isolatedWorkspace();
      const extraRoot = await mkdtemp(path.join(homedir(), "pho-code-sandbox-extra-"));
      const extraWrite = path.join(extraRoot, "extra-write");
      const extraDenied = path.join(extraRoot, "extra-denied");
      await mkdir(extraWrite);
      await mkdir(extraDenied);
      const sandbox = createAgentSandbox({
        enabled: true,
        workspacePath,
        agentDir,
        rgPath,
        networkMode: "deny",
        additionalWritePaths: [extraWrite],
      });
      try {
        const snapshot = await sandbox.initialize();
        expect(snapshot.status).toBe("healthy");
        const ops = sandbox.bashOperations();
        const extraFile = path.join(extraWrite, "extra.txt");
        const deniedFile = path.join(extraDenied, "blocked.txt");
        const allowed = await ops.exec(`touch ${JSON.stringify(extraFile)}`, workspacePath, { onData() {} });
        expect(allowed.exitCode).toBe(0);
        expect(existsSync(extraFile)).toBe(true);
        const deniedOut = collectOutput();
        const denied = await ops.exec(`touch ${JSON.stringify(deniedFile)}`, workspacePath, { onData: deniedOut.onData });
        expect(denied.exitCode).not.toBe(0);
        expect(existsSync(deniedFile)).toBe(false);
        await sandbox.reset();
      } finally {
        spawnSync("/usr/bin/trash", [extraRoot], { encoding: "utf8" });
      }
    },
    30_000,
  );
});

function explodingEngine(): SandboxEngine {
  return {
    async initialize(_config: SandboxRuntimeConfig) {
      throw new Error("engine should not initialize");
    },
    async wrapWithSandbox() {
      throw new Error("engine should not wrap");
    },
    async reset() {},
  };
}
