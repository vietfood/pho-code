import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  failCommand,
  HARNESS_ERROR_CODES,
  type ManagedPermissionProfileId,
  type PermissionProfileId,
  type PermissionSettings,
  type UpdatePermissionSettingsInput,
} from "@pho-code/protocol";
import {
  BALANCED_PERMISSION,
  DEVELOPER_PERMISSION,
  GUARDED_PERMISSION,
  HARNESS_ALWAYS_ALLOW_PERMISSION,
  MANAGED_WEB_PERMISSION,
} from "./permission-presets";

/** Named permission-system authorizer; skip-ask is a no-op until this name is in `authorizerChain`. */
export const SANDBOX_PERMISSION_AUTHORIZER_NAME = "pho-code-sandbox";
export const APPROVAL_PERMISSION_AUTHORIZER_NAME = "pho-code-approval";
export const PERMISSION_CONFIG_RELATIVE_PATH = path.join(
  "extensions",
  "pi-permission-system",
  "config.json",
);
export const PROJECT_PERMISSION_CONFIG_RELATIVE_PATH = path.join(
  ".pi",
  "extensions",
  "pi-permission-system",
  "config.json",
);

const KNOWN_TOP_LEVEL_KEYS = new Set([
  "$schema",
  "debugLog",
  "permissionReviewLog",
  "yoloMode",
  "doublePressToConfirm",
  "toolInputPreviewMaxLength",
  "toolTextSummaryMaxLength",
  "piInfrastructureReadPaths",
  "authorizerChain",
  "permission",
  "shellTools",
]);

type PermissionDecision = "allow" | "ask" | "deny";

export function globalPermissionConfigPath(agentDir: string): string {
  return path.join(agentDir, PERMISSION_CONFIG_RELATIVE_PATH);
}

export function projectPermissionConfigPath(workspacePath: string): string {
  return path.join(workspacePath, PROJECT_PERMISSION_CONFIG_RELATIVE_PATH);
}

export function projectPermissionOverridePresent(workspacePath: string | undefined): boolean {
  if (!workspacePath) {
    return false;
  }
  return existsSync(projectPermissionConfigPath(workspacePath));
}

export function readPermissionSettings(input: {
  agentDir: string;
  appliesToSharedPiAgentDir?: boolean;
  workspacePath?: string;
  yoloActive?: boolean;
}): PermissionSettings {
  const loaded = loadPermissionConfigFile(globalPermissionConfigPath(input.agentDir));
  const yoloMode = loaded.config.yoloMode === true || input.yoloActive === true;
  return {
    profile: detectPermissionProfile(loaded.config.permission),
    yoloMode,
    permissionReviewLog: loaded.config.permissionReviewLog !== false,
    projectOverridePresent: projectPermissionOverridePresent(input.workspacePath),
    projectPermissionRulesTrusted: false,
    projectPermissionRulesRemembered: false,
    appliesToSharedPiAgentDir: input.appliesToSharedPiAgentDir === true,
  };
}

export function applyPermissionSettingsPatch(input: {
  agentDir: string;
  appliesToSharedPiAgentDir?: boolean;
  approvalControllerActive?: boolean;
  acknowledgeSharedAgentDirMutation?: boolean;
  patch: UpdatePermissionSettingsInput;
  workspacePath?: string;
  yoloActive?: boolean;
}): PermissionSettings {
  const filePath = globalPermissionConfigPath(input.agentDir);
  const loaded = loadPermissionConfigFile(filePath);
  const next = patchPermissionConfig(loaded.config, input.patch);
  atomicWriteJson(filePath, next);
  syncHarnessPermissionPolicy(input.agentDir, {
    approvalControllerActive: input.approvalControllerActive === true,
    appliesToSharedPiAgentDir: input.appliesToSharedPiAgentDir === true,
    acknowledgeSharedAgentDirMutation: input.acknowledgeSharedAgentDirMutation === true,
  });
  return readPermissionSettings({
    agentDir: input.agentDir,
    appliesToSharedPiAgentDir: input.appliesToSharedPiAgentDir === true,
    ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
    ...(input.yoloActive !== undefined ? { yoloActive: input.yoloActive } : {}),
  });
}

export interface PermissionPolicySyncOptions {
  approvalControllerActive?: boolean;
  appliesToSharedPiAgentDir?: boolean;
  acknowledgeSharedAgentDirMutation?: boolean;
}

/** Write harness policy keys only after their corresponding runtime owners are active. */
export function syncHarnessPermissionPolicy(
  agentDir: string,
  options: PermissionPolicySyncOptions = {},
): void {
  if (
    options.appliesToSharedPiAgentDir === true &&
    options.acknowledgeSharedAgentDirMutation !== true
  ) {
    return;
  }
  const filePath = globalPermissionConfigPath(agentDir);
  let loaded: { config: Record<string, unknown> };
  try {
    loaded = loadPermissionConfigFile(filePath);
  } catch {
    return;
  }
  const existing = loaded.config.permission;
  const existingProfile = existing === undefined ? "guarded" : detectPermissionProfile(existing);
  const approvalControllerActive =
    options.approvalControllerActive === true && existingProfile !== "custom";
  const nextConfig: Record<string, unknown> = { ...loaded.config };
  let changed = false;
  const authorizerChain = withSandboxAuthorizerChain(nextConfig.authorizerChain, approvalControllerActive);
  if (!sameStringArray(nextConfig.authorizerChain, authorizerChain)) {
    nextConfig.authorizerChain = authorizerChain;
    changed = true;
  }
  if (
    existingProfile !== "custom" &&
    (existing === undefined || (existing && typeof existing === "object" && !Array.isArray(existing)))
  ) {
    const permission = (existing ?? GUARDED_PERMISSION) as Record<string, unknown>;
    const profile = existingProfile;
    const next = cloneJson(permission);
    changed = overlayPermission(next, HARNESS_ALWAYS_ALLOW_PERMISSION) || changed;
    changed = overlayPermission(next, MANAGED_WEB_PERMISSION) || changed;
    if (approvalControllerActive) {
      changed = applyApprovalQuietSurfaces(next) || changed;
    } else {
      const restored = withoutApprovalQuietSurfaces(next, PROFILE_PRESETS[profile].current);
      changed = !permissionPoliciesEquivalent(next, restored) || changed;
      for (const key of Object.keys(next)) delete next[key];
      Object.assign(next, restored);
    }
    nextConfig.permission = next;
  }
  if (!changed) {
    return;
  }
  atomicWriteJson(filePath, nextConfig);
}

export function detectPermissionProfile(permission: unknown): PermissionProfileId {
  if (permission !== undefined) {
    for (const [profile, presets] of Object.entries(PROFILE_PRESETS)) {
      if (
        matchesManagedPermission(permission, presets.current) ||
        (presets.legacy !== undefined && permissionPoliciesEquivalent(permission, presets.legacy))
      ) {
        return profile as ManagedPermissionProfileId;
      }
    }
  }
  return "custom";
}

function matchesManagedPermission(permission: unknown, preset: unknown): boolean {
  if (!permission || typeof permission !== "object" || Array.isArray(permission)) {
    return permissionPoliciesEquivalent(permission, preset);
  }
  const managed = withManagedPermissionOverlays(permission as Record<string, unknown>);
  return (
    permissionPoliciesEquivalent(managed, preset) ||
    permissionPoliciesEquivalent(withoutApprovalQuietSurfaces(managed, preset), preset)
  );
}

function withManagedPermissionOverlays(permission: Record<string, unknown>): Record<string, unknown> {
  const pathRules = permission.path;
  const pathWithSafeSink =
    pathRules && typeof pathRules === "object" && !Array.isArray(pathRules) && !("/dev/null" in pathRules)
      ? { ...pathRules, "/dev/null": "allow" }
      : pathRules;
  return {
    ...permission,
    ...(pathWithSafeSink !== undefined ? { path: pathWithSafeSink } : {}),
    ...HARNESS_ALWAYS_ALLOW_PERMISSION,
    ...MANAGED_WEB_PERMISSION,
  };
}

// Recognition-only snapshots preserve existing v2 files without rewriting their decisions.
// An explicit owner selection writes the v3 template with the permanent-removal invariant.
const LEGACY_V2_GUARDED_PERMISSION = {
  "*": "ask",
  path: {
    "*": "ask",
    "*.env": "deny",
    "*.env.*": "deny",
    "*.env.example": "ask",
    "~/.ssh/*": "deny",
  },
  external_directory: "ask",
} as const;

const LEGACY_V2_BALANCED_PERMISSION = {
  "*": "ask",
  path: {
    "*": "allow",
    "*.env": "deny",
    "*.env.*": "deny",
    "*.env.example": "allow",
    "~/.ssh/*": "deny",
  },
  read: "allow",
  find: "allow",
  grep: "allow",
  ls: "allow",
  write: "ask",
  edit: "ask",
  bash: "ask",
  skill: "ask",
  mcp: "ask",
  external_directory: "ask",
} as const;

const PROFILE_PRESETS: Record<ManagedPermissionProfileId, { current: unknown; legacy?: unknown }> = {
  guarded: { current: GUARDED_PERMISSION, legacy: LEGACY_V2_GUARDED_PERMISSION },
  balanced: { current: BALANCED_PERMISSION, legacy: LEGACY_V2_BALANCED_PERMISSION },
  developer: { current: DEVELOPER_PERMISSION },
};

export function permissionPolicyForProfile(profile: ManagedPermissionProfileId): Record<string, unknown> {
  return cloneJson(PROFILE_PRESETS[profile].current) as Record<string, unknown>;
}

export function patchPermissionConfig(
  existing: Record<string, unknown>,
  patch: UpdatePermissionSettingsInput,
): Record<string, unknown> {
  const next = cloneJson(existing);
  if (patch.profile) {
    next.permission = permissionPolicyForProfile(patch.profile);
  }
  if (patch.yoloMode !== undefined) {
    next.yoloMode = patch.yoloMode;
  }
  if (patch.permissionReviewLog !== undefined) {
    next.permissionReviewLog = patch.permissionReviewLog;
  }
  next.authorizerChain = withSandboxAuthorizerChain(next.authorizerChain);
  assertSupportedPermissionConfig(next);
  return next;
}

function overlayPermission(next: Record<string, unknown>, overlay: Record<string, unknown>): boolean {
  let changed = false;
  for (const [name, action] of Object.entries(overlay)) {
    if (next[name] !== action) {
      delete next[name];
      next[name] = action;
      changed = true;
    }
  }
  return changed;
}

function applyApprovalQuietSurfaces(permission: Record<string, unknown>): boolean {
  let changed = false;
  const pathRules = permission.path;
  if (!permissionPoliciesEquivalent(pathRules, { "*": "allow" })) {
    permission.path = { "*": "allow" };
    changed = true;
  }
  for (const surface of ["read", "write", "edit", "external_directory"] as const) {
    if (permission[surface] !== "allow") {
      permission[surface] = "allow";
      changed = true;
    }
  }
  return changed;
}

function withoutApprovalQuietSurfaces(
  permission: Record<string, unknown>,
  preset: unknown,
): Record<string, unknown> {
  if (!preset || typeof preset !== "object" || Array.isArray(preset)) return permission;
  const expected = preset as Record<string, unknown>;
  const restored = cloneJson(permission);
  for (const surface of ["read", "write", "edit", "external_directory"] as const) {
    if (surface in expected) restored[surface] = cloneJson(expected[surface]);
    else delete restored[surface];
  }
  if (
    restored.path && typeof restored.path === "object" && !Array.isArray(restored.path) &&
    expected.path && typeof expected.path === "object" && !Array.isArray(expected.path)
  ) {
    restored.path = cloneJson(expected.path);
  }
  return restored;
}

function withSandboxAuthorizerChain(chain: unknown, approvalControllerActive = false): string[] {
  const names = isStringArray(chain)
    ? chain.filter((name) => name !== APPROVAL_PERMISSION_AUTHORIZER_NAME)
    : [];
  if (approvalControllerActive) {
    names.push(APPROVAL_PERMISSION_AUTHORIZER_NAME);
  }
  if (!names.includes(SANDBOX_PERMISSION_AUTHORIZER_NAME)) {
    names.push(SANDBOX_PERMISSION_AUTHORIZER_NAME);
  }
  return names;
}

function sameStringArray(left: unknown, right: readonly string[]): boolean {
  return isStringArray(left) && left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function loadPermissionConfigFile(filePath: string): { config: Record<string, unknown> } {
  if (!existsSync(filePath)) {
    return { config: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    invalidPermissionConfig(
      `The permission config at ${filePath} is not valid JSON.`,
      error instanceof Error ? error.message : "parse failed",
    );
  }
  return { config: assertSupportedPermissionConfig(parsed, filePath) };
}

function assertSupportedPermissionConfig(value: unknown, filePath?: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidPermissionConfig("Permission config must be a JSON object.", filePath);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      invalidPermissionConfig(`Permission config has unrecognized field "${key}".`, filePath);
    }
  }
  if (record.$schema !== undefined && typeof record.$schema !== "string") {
    invalidPermissionConfig("Permission config $schema must be a string.", filePath);
  }
  for (const key of ["debugLog", "permissionReviewLog", "yoloMode", "doublePressToConfirm"]) {
    assertOptionalBoolean(record, key, filePath);
  }
  for (const key of ["toolInputPreviewMaxLength", "toolTextSummaryMaxLength"]) {
    assertOptionalPositiveInt(record, key, filePath);
  }
  for (const key of ["piInfrastructureReadPaths", "authorizerChain"]) {
    if (record[key] !== undefined && !isStringArray(record[key])) {
      invalidPermissionConfig(`Permission config ${key} must be a string array.`, filePath);
    }
  }
  if (record.permission !== undefined) {
    assertPermissionPolicy(record.permission, filePath);
  }
  if (record.shellTools !== undefined) {
    assertShellTools(record.shellTools, filePath);
  }
  return record;
}

function assertPermissionPolicy(value: unknown, filePath?: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidPermissionConfig("Permission policy must be an object.", filePath);
  }
  for (const [surface, entry] of Object.entries(value as Record<string, unknown>)) {
    if (surface.length === 0) {
      invalidPermissionConfig("Permission policy surfaces must be non-empty.", filePath);
    }
    if (isPermissionDecision(entry)) {
      continue;
    }
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      invalidPermissionConfig(`Permission policy for "${surface}" is not a supported value.`, filePath);
    }
    for (const [pattern, patternValue] of Object.entries(entry as Record<string, unknown>)) {
      if (pattern.length === 0) {
        invalidPermissionConfig(`Permission pattern for "${surface}" must be non-empty.`, filePath);
      }
      if (!isPermissionDecision(patternValue) && !isDenyWithReason(patternValue)) {
        invalidPermissionConfig(`Permission pattern "${pattern}" on "${surface}" is not a supported value.`, filePath);
      }
    }
  }
}

function assertShellTools(value: unknown, filePath?: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidPermissionConfig("Permission config shellTools must be an object.", filePath);
  }
  for (const [tool, mapping] of Object.entries(value as Record<string, unknown>)) {
    if (tool.length === 0 || mapping === null || typeof mapping !== "object" || Array.isArray(mapping)) {
      invalidPermissionConfig("Permission config shellTools entries must be objects.", filePath);
    }
    const record = mapping as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== "commandArgument" && key !== "workdirArgument")) {
      invalidPermissionConfig("Permission config shellTools entries have unrecognized fields.", filePath);
    }
    if (typeof record.commandArgument !== "string" || record.commandArgument.length === 0) {
      invalidPermissionConfig("Permission config shellTools.commandArgument must be a string.", filePath);
    }
    if (
      record.workdirArgument !== undefined &&
      (typeof record.workdirArgument !== "string" || record.workdirArgument.length === 0)
    ) {
      invalidPermissionConfig("Permission config shellTools.workdirArgument must be a string.", filePath);
    }
  }
}

function permissionPoliciesEquivalent(left: unknown, right: unknown): boolean {
  return JSON.stringify(collapsePermissionPolicy(left)) === JSON.stringify(collapsePermissionPolicy(right));
}

function collapsePermissionPolicy(value: unknown): unknown {
  if (isPermissionDecision(value) || isDenyWithReason(value)) {
    return value;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const collapsed: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    collapsed[key] = collapsePermissionPolicy(record[key]);
  }
  const keys = Object.keys(collapsed);
  if (keys.length === 1 && keys[0] === "*" && isPermissionDecision(collapsed["*"])) {
    return collapsed["*"];
  }
  return collapsed;
}

function atomicWriteJson(filePath: string, value: Record<string, unknown>): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  try {
    writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      if (existsSync(tmpPath)) {
        unlinkSync(tmpPath);
      }
    } catch {
      // Best-effort temp cleanup; the original file is unchanged.
    }
    invalidPermissionConfig(
      "Unable to write the permission config.",
      error instanceof Error ? error.message : "write failed",
    );
  }
}

function assertOptionalBoolean(record: Record<string, unknown>, key: string, filePath?: string): void {
  if (record[key] !== undefined && typeof record[key] !== "boolean") {
    invalidPermissionConfig(`Permission config ${key} must be a boolean.`, filePath);
  }
}

function assertOptionalPositiveInt(record: Record<string, unknown>, key: string, filePath?: string): void {
  const value = record[key];
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    invalidPermissionConfig(`Permission config ${key} must be a positive integer.`, filePath);
  }
}

function isPermissionDecision(value: unknown): value is PermissionDecision {
  return value === "allow" || value === "ask" || value === "deny";
}

function isDenyWithReason(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (record.action !== "deny") {
    return false;
  }
  if (record.reason !== undefined && (typeof record.reason !== "string" || record.reason.length > 500)) {
    return false;
  }
  return keys.every((key) => key === "action" || key === "reason");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function invalidPermissionConfig(message: string, detail?: string): never {
  failCommand(
    "updatePermissionSettings",
    message,
    HARNESS_ERROR_CODES.invalidPermissionConfig,
    detail ? { detail } : undefined,
  );
}
