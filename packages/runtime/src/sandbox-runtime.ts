import { existsSync } from "node:fs";
import path from "node:path";
import { SandboxManager, type SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import {
  createLocalBashOperations,
  type BashOperations,
} from "@earendil-works/pi-coding-agent";
import type { SandboxStatus, SandboxStatusReason } from "@pho-code/protocol";
import { PACKAGED_FEATURES_DIR } from "./resource-locator";
import { findExecutableOnPath } from "./process-launch";
import { ripgrepPackagedRelativePath } from "./sandbox-artifact";
import {
  assertNoWeakerSandboxFlags,
  buildSandboxRuntimeConfig,
  evaluateSandboxFileToolAccess,
  isSandboxFileToolName,
  SANDBOX_BASH_OS_DENY_REASON,
  SANDBOX_UNAVAILABLE_OWNER_ACTION,
  shouldAnnotateSandboxBashFailure,
  type SandboxNetworkMode,
  type SandboxPolicyInput,
} from "./sandbox-policy";

export type { SandboxStatus, SandboxStatusReason };

export interface SandboxRuntimeSnapshot {
  enabled: boolean;
  status: SandboxStatus;
  statusReason?: SandboxStatusReason;
  platformSupported: boolean;
}

export interface SandboxEngine {
  initialize(config: SandboxRuntimeConfig): Promise<void>;
  wrapWithSandbox(command: string, customConfig?: Partial<SandboxRuntimeConfig>): Promise<string>;
  reset(): Promise<void>;
}

export interface AgentSandboxOptions {
  enabled?: boolean;
  workspacePath?: string;
  networkMode?: SandboxNetworkMode;
  allowedDomains?: readonly string[];
  additionalReadPaths?: readonly string[];
  additionalWritePaths?: readonly string[];
  includePackageRegistryDefaults?: boolean;
  agentDir?: string;
  applicationDataDir?: string;
  resourcesRoot?: string;
  rgPath?: string;
  pathEnv?: string;
  platform?: NodeJS.Platform;
  sandboxExecPath?: string;
  engine?: SandboxEngine;
}

export type SandboxFileToolVerdict =
  | { action: "defer" }
  | { action: "allow" }
  | { action: "deny"; reason: string };

export interface AgentSandbox {
  snapshot(): SandboxRuntimeSnapshot;
  initialize(input?: AgentSandboxInitInput): Promise<SandboxRuntimeSnapshot>;
  reset(): Promise<void>;
  bashOperations(): BashOperations;
  evaluateFileTool(input: { toolName: string; requestedPath: string; cwd?: string }): Promise<SandboxFileToolVerdict>;
}

export type AgentSandboxInitInput = Pick<
  AgentSandboxOptions,
  | "enabled"
  | "workspacePath"
  | "networkMode"
  | "allowedDomains"
  | "additionalReadPaths"
  | "additionalWritePaths"
  | "includePackageRegistryDefaults"
>;

const MACOS_SANDBOX_EXEC = "/usr/bin/sandbox-exec";

export class AgentBashUnavailableError extends Error {
  readonly statusReason: SandboxStatusReason;

  constructor(statusReason: SandboxStatusReason) {
    super(agentBashUnavailableMessage(statusReason));
    this.name = "AgentBashUnavailableError";
    this.statusReason = statusReason;
  }
}

const UNAVAILABLE_REASONS: Record<SandboxStatusReason, string> = {
  "rg-missing": "ripgrep is missing",
  "sandbox-exec": "sandbox-exec is missing",
  "unsupported-platform": "this platform does not support the OS sandbox",
  init: "the sandbox failed to start",
};

export function agentBashUnavailableMessage(reason: SandboxStatusReason): string {
  return `Agent bash is unavailable because ${UNAVAILABLE_REASONS[reason]}. ${SANDBOX_UNAVAILABLE_OWNER_ACTION}`;
}

export function sandboxPlatformSupported(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "darwin";
}

export function resolveRipgrepPath(input: {
  rgPath?: string;
  resourcesRoot?: string;
  pathEnv?: string;
} = {}): string | undefined {
  if (input.rgPath && existsSync(input.rgPath)) {
    return input.rgPath;
  }
  const relative = ripgrepPackagedRelativePath();
  if (input.resourcesRoot && relative) {
    const staged = path.join(input.resourcesRoot, PACKAGED_FEATURES_DIR, relative);
    if (existsSync(staged)) {
      return staged;
    }
  }
  return findExecutableOnPath("rg", input.pathEnv ?? process.env.PATH ?? "");
}

export function resolveRipgrepDirectory(resourcesRoot?: string): string | undefined {
  const binary = resolveRipgrepPath({ resourcesRoot, pathEnv: "" });
  return binary ? path.dirname(binary) : undefined;
}

export function prependRipgrepDirectoryToPath(
  resourcesRoot?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const directory = resolveRipgrepDirectory(resourcesRoot);
  if (!directory) {
    return undefined;
  }
  const current = env.PATH?.split(path.delimiter).filter(Boolean) ?? [];
  if (!current.includes(directory)) {
    env.PATH = [directory, ...current].join(path.delimiter);
  }
  return directory;
}

export function createAnthropicSandboxEngine(): SandboxEngine {
  return {
    initialize(config) {
      return SandboxManager.initialize(config);
    },
    wrapWithSandbox(command, customConfig) {
      return SandboxManager.wrapWithSandbox(command, undefined, customConfig);
    },
    reset() {
      return SandboxManager.reset();
    },
  };
}

export function createAgentSandbox(options: AgentSandboxOptions = {}): AgentSandbox {
  const engine = options.engine ?? createAnthropicSandboxEngine();
  const localOps = createLocalBashOperations();
  let enabled = options.enabled === true;
  let status: SandboxStatus = enabled ? "starting" : "off";
  let statusReason: SandboxStatusReason | undefined;
  let workspacePath = options.workspacePath;
  let networkMode: SandboxNetworkMode = options.networkMode ?? "deny";
  let allowedDomains = options.allowedDomains;
  let additionalReadPaths = options.additionalReadPaths;
  let additionalWritePaths = options.additionalWritePaths;
  let includePackageRegistryDefaults = options.includePackageRegistryDefaults === true;
  let lastFilesystem: SandboxRuntimeConfig["filesystem"] | undefined;
  let initialized = false;
  let generation = 0;
  let inFlight: Promise<SandboxRuntimeSnapshot> | undefined;

  function platform(): NodeJS.Platform {
    return options.platform ?? process.platform;
  }

  function platformSupported(): boolean {
    return sandboxPlatformSupported(platform());
  }

  function snapshot(): SandboxRuntimeSnapshot {
    return {
      enabled,
      status: enabled ? status : "off",
      platformSupported: platformSupported(),
      ...(enabled && statusReason ? { statusReason } : {}),
    };
  }

  function fail(reason: SandboxStatusReason): SandboxRuntimeSnapshot {
    status = reason === "unsupported-platform" ? "unavailable" : "failed";
    statusReason = reason;
    initialized = false;
    return snapshot();
  }

  async function resetEngine(): Promise<void> {
    initialized = false;
    try {
      await engine.reset();
    } catch {
      // reset must not hang disable/quit if the engine already tore down
    }
  }

  async function start(): Promise<SandboxRuntimeSnapshot> {
    const live = {
      enabled,
      workspacePath,
      networkMode,
      allowedDomains,
      additionalReadPaths,
      additionalWritePaths,
      includePackageRegistryDefaults,
    };
    if (!live.enabled) {
      status = "off";
      statusReason = undefined;
      await resetEngine();
      return snapshot();
    }

    status = "starting";
    statusReason = undefined;

    if (!platformSupported()) {
      await resetEngine();
      return fail("unsupported-platform");
    }

    if (platform() === "darwin") {
      const sandboxExecPath = options.sandboxExecPath ?? MACOS_SANDBOX_EXEC;
      if (!existsSync(sandboxExecPath)) {
        await resetEngine();
        return fail("sandbox-exec");
      }
    }

    const rgPath = resolveRipgrepPath({
      ...(options.rgPath ? { rgPath: options.rgPath } : {}),
      ...(options.resourcesRoot ? { resourcesRoot: options.resourcesRoot } : {}),
      pathEnv: options.pathEnv !== undefined ? options.pathEnv : (process.env.PATH ?? ""),
    });
    if (!rgPath) {
      await resetEngine();
      return fail("rg-missing");
    }

    if (!live.workspacePath) {
      initialized = false;
      return snapshot();
    }

    const policy: SandboxPolicyInput = {
      workspacePath: live.workspacePath,
      networkMode: live.networkMode,
      rgPath,
      includePackageRegistryDefaults: live.includePackageRegistryDefaults,
      ...(live.allowedDomains ? { allowedDomains: live.allowedDomains } : {}),
      ...(live.additionalReadPaths ? { additionalReadPaths: live.additionalReadPaths } : {}),
      ...(live.additionalWritePaths ? { additionalWritePaths: live.additionalWritePaths } : {}),
      ...(options.agentDir ? { agentDir: options.agentDir } : {}),
      ...(options.applicationDataDir ? { applicationDataDir: options.applicationDataDir } : {}),
    };

    try {
      const config = buildSandboxRuntimeConfig(policy);
      assertNoWeakerSandboxFlags(config);
      await engine.initialize(config);
      lastFilesystem = config.filesystem;
      initialized = true;
      status = "healthy";
      statusReason = undefined;
      return snapshot();
    } catch (error) {
      await resetEngine();
      const message = error instanceof Error ? error.message : String(error);
      if (/sandbox-exec/i.test(message)) {
        return fail("sandbox-exec");
      }
      if (/ripgrep|\brg\b/i.test(message)) {
        return fail("rg-missing");
      }
      return fail("init");
    }
  }

  async function initialize(input: AgentSandboxInitInput = {}): Promise<SandboxRuntimeSnapshot> {
    if (input.enabled !== undefined) enabled = input.enabled;
    if (input.workspacePath) workspacePath = input.workspacePath;
    if (input.networkMode) networkMode = input.networkMode;
    if (input.allowedDomains) allowedDomains = input.allowedDomains;
    if (input.additionalReadPaths) additionalReadPaths = input.additionalReadPaths;
    if (input.additionalWritePaths) additionalWritePaths = input.additionalWritePaths;
    if (input.includePackageRegistryDefaults !== undefined) includePackageRegistryDefaults = input.includePackageRegistryDefaults;
    generation += 1;
    if (!inFlight) {
      inFlight = (async () => {
        let at = generation;
        let result = await start();
        while (at !== generation) {
          at = generation;
          result = await start();
        }
        return result;
      })().finally(() => {
        inFlight = undefined;
      });
    }
    return inFlight;
  }

  async function reset(): Promise<void> {
    enabled = false;
    status = "off";
    statusReason = undefined;
    generation += 1;
    if (inFlight) {
      await inFlight.catch(() => undefined);
    }
    await resetEngine();
    status = "off";
    statusReason = undefined;
  }

  function bashOperations(): BashOperations {
    const current = snapshot();
    if (!current.enabled || current.status === "off") {
      return localOps;
    }
    if (current.status !== "healthy" || !initialized) {
      const reason = current.statusReason ?? (current.status === "unavailable" ? "unsupported-platform" : "init");
      return {
        async exec() {
          throw new AgentBashUnavailableError(reason);
        },
      };
    }
    return {
      async exec(command, cwd, execOptions) {
        const wrapped = await engine.wrapWithSandbox(command, wrapConfigForCwd(cwd));
        const chunks: Buffer[] = [];
        const result = await localOps.exec(wrapped, cwd, {
          ...execOptions,
          onData(data) {
            chunks.push(data);
            execOptions.onData(data);
          },
        });
        if (result.exitCode !== 0) {
          const output = Buffer.concat(chunks).toString("utf8");
          if (shouldAnnotateSandboxBashFailure(output)) {
            execOptions.onData(Buffer.from(`\n${SANDBOX_BASH_OS_DENY_REASON}\n`, "utf8"));
          }
        }
        return result;
      },
    };
  }

  async function evaluateFileTool(input: {
    toolName: string;
    requestedPath: string;
    cwd?: string;
  }): Promise<SandboxFileToolVerdict> {
    const current = snapshot();
    if (!current.enabled || current.status !== "healthy" || !initialized) {
      return { action: "defer" };
    }
    if (!isSandboxFileToolName(input.toolName)) {
      return { action: "defer" };
    }
    const cwd = input.cwd || workspacePath;
    if (!cwd || !lastFilesystem) {
      return { action: "defer" };
    }
    const filesystem = wrapConfigForCwd(cwd)?.filesystem ?? lastFilesystem;
    const evaluation = await evaluateSandboxFileToolAccess({
      toolName: input.toolName,
      requestedPath: input.requestedPath,
      workspacePath: cwd,
      filesystem,
    });
    if (evaluation.decision === "allow") {
      return { action: "allow" };
    }
    return { action: "deny", reason: evaluation.reason };
  }

  return {
    snapshot,
    initialize,
    reset,
    bashOperations,
    evaluateFileTool,
  };

  function wrapConfigForCwd(cwd?: string): Partial<SandboxRuntimeConfig> | undefined {
    if (!cwd || !lastFilesystem) {
      return undefined;
    }
    const allowWrite = uniqueAllowWrite(lastFilesystem.allowWrite, cwd);
    if (!allowWrite || allowWrite.length === lastFilesystem.allowWrite.length) {
      return undefined;
    }
    return {
      filesystem: {
        ...lastFilesystem,
        allowWrite,
      },
    };
  }
}

function uniqueAllowWrite(roots: readonly string[], cwd?: string): string[] | undefined {
  const resolved = cwd ? path.resolve(cwd) : undefined;
  if (!resolved || new Set(roots).has(resolved)) {
    return roots.length > 0 ? [...roots] : undefined;
  }
  return [...roots, resolved];
}
