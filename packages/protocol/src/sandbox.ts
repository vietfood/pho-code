export const SANDBOX_NETWORK_MODES = ["deny", "allowlist"] as const;
export type SandboxNetworkMode = (typeof SANDBOX_NETWORK_MODES)[number];

export const SANDBOX_STATUSES = ["off", "starting", "healthy", "failed", "unavailable"] as const;
export type SandboxStatus = (typeof SANDBOX_STATUSES)[number];

export const SANDBOX_STATUS_REASONS = [
  "rg-missing",
  "sandbox-exec",
  "unsupported-platform",
  "init",
] as const;
export type SandboxStatusReason = (typeof SANDBOX_STATUS_REASONS)[number];

export const MAX_SANDBOX_ALLOWED_DOMAINS = 64;
export const MAX_SANDBOX_DOMAIN_CHARS = 253;
export const MAX_SANDBOX_PATH_LIST = 32;
export const MAX_SANDBOX_PATH_CHARS = 1024;

export const SANDBOX_DISCLOSURE = "";

export const SANDBOX_BASH_TOOL_NAMES = ["bash", "user_bash"] as const;
export type SandboxBashToolName = (typeof SANDBOX_BASH_TOOL_NAMES)[number];

const SANDBOX_BASH_TOOL_NAME_SET = new Set<string>(SANDBOX_BASH_TOOL_NAMES);

export function isSandboxBashToolName(name: string): boolean {
  const key = name.trim().toLowerCase().replace(/\s+/gu, "_");
  return SANDBOX_BASH_TOOL_NAME_SET.has(key) || key === "run";
}

/** True when this agent bash call is wrapped by a healthy OS box. */
export function sandboxBashWasWrapped(toolName: string, status: SandboxStatus): boolean {
  return status === "healthy" && isSandboxBashToolName(toolName);
}

export interface SandboxSettingsSnapshot {
  enabled: boolean;
  status: SandboxStatus;
  statusReason?: SandboxStatusReason;
  networkMode: SandboxNetworkMode;
  allowedDomains: string[];
  includePackageRegistryDefaults: boolean;
  additionalReadPaths: string[];
  additionalWritePaths: string[];
  platformSupported: boolean;
  disclosure: string;
}

export interface UpdateSandboxSettingsInput {
  enabled?: boolean;
  networkMode?: SandboxNetworkMode;
  allowedDomains?: string[];
  includePackageRegistryDefaults?: boolean;
  additionalReadPaths?: string[];
  additionalWritePaths?: string[];
}

const NETWORK_MODE_SET = new Set<string>(SANDBOX_NETWORK_MODES);
const STATUS_SET = new Set<string>(SANDBOX_STATUSES);
const STATUS_REASON_SET = new Set<string>(SANDBOX_STATUS_REASONS);
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu;

export function isSandboxNetworkMode(value: unknown): value is SandboxNetworkMode {
  return typeof value === "string" && NETWORK_MODE_SET.has(value);
}

export function isSandboxStatus(value: unknown): value is SandboxStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

export function isSandboxStatusReason(value: unknown): value is SandboxStatusReason {
  return typeof value === "string" && STATUS_REASON_SET.has(value);
}

export function emptySandboxSettingsSnapshot(): SandboxSettingsSnapshot {
  return {
    enabled: false,
    status: "off",
    networkMode: "deny",
    allowedDomains: [],
    includePackageRegistryDefaults: false,
    additionalReadPaths: [],
    additionalWritePaths: [],
    platformSupported: false,
    disclosure: SANDBOX_DISCLOSURE,
  };
}

export function sandboxStatusLabel(status: SandboxStatus): string {
  switch (status) {
    case "off":
      return "Off";
    case "starting":
      return "Starting";
    case "healthy":
      return "Healthy";
    case "failed":
      return "Failed";
    case "unavailable":
      return "Unavailable";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function sandboxStatusReasonLabel(reason: SandboxStatusReason): string {
  switch (reason) {
    case "rg-missing":
      return "ripgrep is missing";
    case "sandbox-exec":
      return "sandbox-exec is missing";
    case "unsupported-platform":
      return "this platform does not support the OS sandbox";
    case "init":
      return "the sandbox failed to start";
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

export function parseSandboxDomain(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length < 1 || trimmed.length > MAX_SANDBOX_DOMAIN_CHARS) {
    return undefined;
  }
  if (trimmed === "*") {
    return undefined;
  }
  const wildcard = trimmed.startsWith("*.");
  const rest = wildcard ? trimmed.slice(2) : trimmed;
  if (rest.length === 0 || rest.includes("*")) {
    return undefined;
  }
  const labels = rest.split(".");
  if (labels.length === 0 || labels.some((label) => !DOMAIN_LABEL.test(label))) {
    return undefined;
  }
  return trimmed;
}

export function parseSandboxAllowedDomains(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  if (value.length > MAX_SANDBOX_ALLOWED_DOMAINS) {
    return undefined;
  }
  const parsed: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const domain = parseSandboxDomain(entry);
    if (domain === undefined) {
      return undefined;
    }
    if (seen.has(domain)) {
      continue;
    }
    seen.add(domain);
    parsed.push(domain);
  }
  return parsed;
}

export function parseSandboxPathEntry(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_SANDBOX_PATH_CHARS) {
    return undefined;
  }
  if (!(trimmed.startsWith("/") || trimmed.startsWith("~"))) {
    return undefined;
  }
  if (trimmed.split("/").some((segment) => segment === "..")) {
    return undefined;
  }
  return trimmed;
}

export function parseSandboxPathList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  if (value.length > MAX_SANDBOX_PATH_LIST) {
    return undefined;
  }
  const parsed: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const pathEntry = parseSandboxPathEntry(entry);
    if (pathEntry === undefined) {
      return undefined;
    }
    if (seen.has(pathEntry)) {
      continue;
    }
    seen.add(pathEntry);
    parsed.push(pathEntry);
  }
  return parsed;
}

export function parseSandboxSettingsPatch(
  input: UpdateSandboxSettingsInput,
): { ok: true; patch: UpdateSandboxSettingsInput } | { ok: false; message: string } {
  const patch: UpdateSandboxSettingsInput = {};
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      return { ok: false, message: "enabled must be a boolean." };
    }
    patch.enabled = input.enabled;
  }
  if (input.networkMode !== undefined) {
    if (!isSandboxNetworkMode(input.networkMode)) {
      return { ok: false, message: "Choose deny or allowlist." };
    }
    patch.networkMode = input.networkMode;
  }
  if (input.allowedDomains !== undefined) {
    const domains = parseSandboxAllowedDomains(input.allowedDomains);
    if (domains === undefined) {
      return {
        ok: false,
        message: "Allowed domains are invalid. Reject wildcards like '*' and keep the list bounded.",
      };
    }
    patch.allowedDomains = domains;
  }
  if (input.includePackageRegistryDefaults !== undefined) {
    if (typeof input.includePackageRegistryDefaults !== "boolean") {
      return { ok: false, message: "includePackageRegistryDefaults must be a boolean." };
    }
    patch.includePackageRegistryDefaults = input.includePackageRegistryDefaults;
  }
  if (input.additionalReadPaths !== undefined) {
    const paths = parseSandboxPathList(input.additionalReadPaths);
    if (paths === undefined) {
      return { ok: false, message: "Additional read paths are invalid. Use absolute or ~ paths without '..'." };
    }
    patch.additionalReadPaths = paths;
  }
  if (input.additionalWritePaths !== undefined) {
    const paths = parseSandboxPathList(input.additionalWritePaths);
    if (paths === undefined) {
      return { ok: false, message: "Additional write paths are invalid. Use absolute or ~ paths without '..'." };
    }
    patch.additionalWritePaths = paths;
  }
  if (
    patch.enabled === undefined &&
    patch.networkMode === undefined &&
    patch.allowedDomains === undefined &&
    patch.includePackageRegistryDefaults === undefined &&
    patch.additionalReadPaths === undefined &&
    patch.additionalWritePaths === undefined
  ) {
    return { ok: false, message: "No sandbox settings were provided." };
  }
  return { ok: true, patch };
}
