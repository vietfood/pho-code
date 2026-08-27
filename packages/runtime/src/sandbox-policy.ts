import { realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import type { SandboxNetworkMode } from "@pho-code/protocol";
import { isPathInsideOrEqual } from "./path-containment";

export type { SandboxNetworkMode };
export type SandboxFileToolName = "read" | "write" | "edit";
export type SandboxFileToolDecision = "allow" | "deny";
export type SandboxFileToolDenyKind = "outside-policy" | "protected";

export interface SandboxPolicyInput {
  workspacePath: string;
  networkMode: SandboxNetworkMode;
  allowedDomains?: readonly string[];
  additionalReadPaths?: readonly string[];
  additionalWritePaths?: readonly string[];
  agentDir?: string;
  applicationDataDir?: string;
  includePackageRegistryDefaults?: boolean;
  rgPath?: string;
}

export interface SandboxFileToolEvaluation {
  decision: SandboxFileToolDecision;
  reason: string;
  denyKind?: SandboxFileToolDenyKind;
  canonicalPath?: string;
}

/** Starts from the Pi official sandbox example's npm/PyPI/GitHub hosts. Settings default remains deny. */
export const BAKED_PACKAGE_REGISTRY_DOMAINS = [
  "npmjs.org",
  "*.npmjs.org",
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "pypi.org",
  "*.pypi.org",
  "github.com",
  "*.github.com",
  "api.github.com",
  "raw.githubusercontent.com",
] as const;

const HARD_DENY_READ = ["~/.ssh", "~/.aws", "~/.gnupg"] as const;
const HARD_DENY_WRITE = [".env", ".env.*", "*.pem", "*.key"] as const;

/** Documented engine always-blocked write files; kept source-controlled so file tools match bash. */
const MANDATORY_DENY_WRITE_FILES = [
  ".gitconfig",
  ".gitmodules",
  ".bashrc",
  ".bash_profile",
  ".zshrc",
  ".zprofile",
  ".profile",
  ".ripgreprc",
  ".mcp.json",
] as const;

const MANDATORY_DENY_WRITE_PATHS = [
  "**/.git/hooks/**",
  "**/.git/hooks",
  "**/.git/config",
  "**/.vscode/**",
  "**/.idea/**",
  "**/.claude/commands/**",
  "**/.claude/agents/**",
] as const;

export const SANDBOX_DENY_OWNER_ACTION =
  "Do not retry. Ask the owner to turn sandbox off in Settings → Sandbox, or add an extra path or allowed domain there, then tell you to continue.";

export const SANDBOX_FILE_TOOL_OUTSIDE_REASON =
  `Sandbox policy denied this file tool because the path is outside the allowed filesystem roots. ${SANDBOX_DENY_OWNER_ACTION}`;
export const SANDBOX_FILE_TOOL_PROTECTED_REASON =
  "Sandbox policy denied this file tool because that path is protected. Extra read/write paths cannot override it. Do not retry. Ask the owner to turn sandbox off in Settings → Sandbox or choose a different path.";
export const SANDBOX_FILE_TOOL_MISSING_PATH_REASON =
  `Sandbox policy denied this file tool because the path is missing. ${SANDBOX_DENY_OWNER_ACTION}`;
export const SANDBOX_BASH_OS_DENY_REASON =
  `Sandbox blocked this bash command (filesystem or network policy). ${SANDBOX_DENY_OWNER_ACTION}`;
export const SANDBOX_UNAVAILABLE_OWNER_ACTION =
  "Do not retry bash. Ask the owner to turn sandbox off in Settings → Sandbox, or fix the missing dependency, then tell you to continue.";

const SANDBOX_OS_DENY_RE =
  /operation not permitted|permission denied|not permitted|sandbox-exec|sandbox deny|sandbox-exec:/iu;
const SANDBOX_NETWORK_DENY_RE =
  /failed to connect|connection refused|could not resolve|couldn't resolve|network is unreachable|tunnel failed|proxyconnect|could not connect|couldn't connect/iu;

export function shouldAnnotateSandboxBashFailure(output: string): boolean {
  const text = output.trim();
  return (
    text.length > 0 &&
    !text.includes(SANDBOX_BASH_OS_DENY_REASON) &&
    (SANDBOX_OS_DENY_RE.test(text) || SANDBOX_NETWORK_DENY_RE.test(text))
  );
}

export function sandboxFilesystemPolicy(input: SandboxPolicyInput): SandboxRuntimeConfig["filesystem"] {
  const workspacePath = path.resolve(input.workspacePath);
  const allowRead = uniquePaths(input.additionalReadPaths ?? []);
  return {
    denyRead: uniquePaths([
      ...HARD_DENY_READ,
      ...(input.agentDir ? [path.resolve(input.agentDir)] : []),
      ...(input.applicationDataDir ? [path.resolve(input.applicationDataDir)] : []),
    ]),
    allowWrite: uniquePaths([
      workspacePath,
      os.tmpdir(),
      "/tmp",
      ...(input.additionalWritePaths ?? []),
    ]),
    denyWrite: [...HARD_DENY_WRITE],
    ...(allowRead.length > 0 ? { allowRead } : {}),
  };
}

export function buildSandboxRuntimeConfig(input: SandboxPolicyInput): SandboxRuntimeConfig {
  return {
    network: {
      allowedDomains: [...allowedDomainsFor(input)],
      deniedDomains: [],
      strictAllowlist: true,
    },
    filesystem: sandboxFilesystemPolicy(input),
    ...(input.rgPath ? { ripgrep: { command: input.rgPath } } : {}),
  };
}

export function assertNoWeakerSandboxFlags(config: SandboxRuntimeConfig): void {
  if (config.enableWeakerNestedSandbox || config.enableWeakerNetworkIsolation || config.allowAppleEvents) {
    throw new Error("Sandbox config must not enable weaker isolation, weaker network isolation, or Apple Events.");
  }
  if (config.network.allowAllUnixSockets || config.network.allowUnixSockets || config.network.allowLocalBinding) {
    throw new Error("Sandbox config must not open Unix sockets or local binding.");
  }
  if (config.network.allowedDomains.includes("*")) {
    throw new Error("Sandbox config must not allow all domains.");
  }
}

export function isSandboxFileToolName(value: string | undefined): value is SandboxFileToolName {
  return value === "read" || value === "write" || value === "edit";
}

export async function evaluateSandboxFileToolAccess(input: {
  toolName: SandboxFileToolName;
  requestedPath: string;
  workspacePath: string;
  additionalReadPaths?: readonly string[];
  additionalWritePaths?: readonly string[];
  agentDir?: string;
  applicationDataDir?: string;
  filesystem?: SandboxRuntimeConfig["filesystem"];
}): Promise<SandboxFileToolEvaluation> {
  const requested = input.requestedPath.trim();
  if (!requested) {
    return { decision: "deny", reason: SANDBOX_FILE_TOOL_MISSING_PATH_REASON, denyKind: "outside-policy" };
  }

  const workspacePath = await canonicalizeExisting(path.resolve(input.workspacePath));
  const canonicalPath = await canonicalizeExisting(resolveAgainstWorkspace(requested, workspacePath));
  const filesystem =
    input.filesystem ??
    sandboxFilesystemPolicy({
      workspacePath,
      networkMode: "deny",
      ...(input.additionalReadPaths ? { additionalReadPaths: input.additionalReadPaths } : {}),
      ...(input.additionalWritePaths ? { additionalWritePaths: input.additionalWritePaths } : {}),
      ...(input.agentDir ? { agentDir: input.agentDir } : {}),
      ...(input.applicationDataDir ? { applicationDataDir: input.applicationDataDir } : {}),
    });
  const writableRoots = await Promise.all(filesystem.allowWrite.map((root) => canonicalizeExisting(expandHomePath(root))));
  const readableRoots = await Promise.all(
    uniquePaths([...filesystem.allowWrite, ...(filesystem.allowRead ?? [])]).map((root) =>
      canonicalizeExisting(expandHomePath(root)),
    ),
  );
  const denyReadRoots = await Promise.all(filesystem.denyRead.map((root) => canonicalizeExisting(expandHomePath(root))));
  const deny = (reason: string, denyKind: SandboxFileToolDenyKind): SandboxFileToolEvaluation => ({
    decision: "deny",
    reason,
    denyKind,
    canonicalPath,
  });

  if (pathIsInsideAny(denyReadRoots, canonicalPath)) {
    return deny(SANDBOX_FILE_TOOL_PROTECTED_REASON, "protected");
  }

  if (input.toolName !== "read" && isProtectedWritePath(canonicalPath, workspacePath)) {
    return deny(SANDBOX_FILE_TOOL_PROTECTED_REASON, "protected");
  }

  const allowedRoots = input.toolName === "read" ? readableRoots : writableRoots;
  if (!pathIsInsideAny(allowedRoots, canonicalPath)) {
    return deny(SANDBOX_FILE_TOOL_OUTSIDE_REASON, "outside-policy");
  }

  return { decision: "allow", reason: "", canonicalPath };
}

function allowedDomainsFor(input: SandboxPolicyInput): string[] {
  if (input.networkMode === "deny") {
    return [];
  }
  const domains = [...(input.allowedDomains ?? [])];
  if (input.includePackageRegistryDefaults) {
    domains.push(...BAKED_PACKAGE_REGISTRY_DOMAINS);
  }
  return uniqueStrings(domains);
}

function uniqueNormalized(values: readonly string[], normalize: (trimmed: string) => string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const normalized = normalize(trimmed);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function uniquePaths(values: readonly string[]): string[] {
  return uniqueNormalized(values, (trimmed) => (trimmed.startsWith("~") ? trimmed : path.resolve(trimmed)));
}

function uniqueStrings(values: readonly string[]): string[] {
  return uniqueNormalized(values, (trimmed) => {
    if (trimmed === "*") {
      throw new Error("Sandbox domain allowlists cannot include '*'.");
    }
    return trimmed;
  });
}

export function expandHomePath(value: string): string {
  return value === "~" ? os.homedir() : value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function resolveAgainstWorkspace(requestedPath: string, workspacePath: string): string {
  const expanded = expandHomePath(requestedPath);
  if (path.isAbsolute(expanded)) {
    return path.resolve(expanded);
  }
  return path.resolve(workspacePath, expanded);
}

async function canonicalizeExisting(resolved: string): Promise<string> {
  const absolute = path.resolve(resolved);
  try {
    return await realpath(absolute);
  } catch {
    const missing: string[] = [];
    let current = absolute;
    while (current !== path.dirname(current)) {
      missing.unshift(path.basename(current));
      current = path.dirname(current);
      try {
        return path.join(await realpath(current), ...missing);
      } catch {
        // Walk until an existing ancestor can be canonicalized.
      }
    }
    return absolute;
  }
}

function pathIsInsideAny(roots: readonly string[], target: string): boolean {
  return roots.some((root) => isPathInsideOrEqual(root, target));
}

function isProtectedWritePath(canonicalPath: string, workspacePath: string): boolean {
  const posix = toPosixPath(canonicalPath);
  const relative = toPosixPath(path.relative(workspacePath, canonicalPath));
  const basename = path.posix.basename(posix);
  for (const pattern of HARD_DENY_WRITE) {
    if (globMatches(pattern, basename) || globMatches(pattern, posix) || globMatches(pattern, relative)) {
      return true;
    }
  }
  if (MANDATORY_DENY_WRITE_FILES.some((name) => basename === name || globMatches(`**/${name}`, posix))) {
    return true;
  }
  return MANDATORY_DENY_WRITE_PATHS.some((pattern) => globMatches(pattern, posix) || globMatches(pattern, relative));
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function globMatches(pattern: string, value: string): boolean {
  if (!containsGlobChars(pattern)) {
    return value === pattern || value.endsWith(`/${pattern}`);
  }
  return new RegExp(globToRegex(pattern), "u").test(value);
}

function containsGlobChars(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?") || pattern.includes("[");
}

function globToRegex(globPattern: string): string {
  return (
    "^" +
    globPattern
      .replace(/[.^$+{}()|\\]/gu, "\\$&")
      .replace(/\[([^\]]*?)$/gu, "\\[$1")
      .replace(/\*\*\//gu, "__GLOBSTAR_SLASH__")
      .replace(/\*\*/gu, "__GLOBSTAR__")
      .replace(/\*/gu, "[^/]*")
      .replace(/\?/gu, "[^/]")
      .replace(/__GLOBSTAR_SLASH__/gu, "(.*/)?")
      .replace(/__GLOBSTAR__/gu, ".*") +
    "$"
  );
}
