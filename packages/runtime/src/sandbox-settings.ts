import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  emptySandboxSettingsSnapshot,
  isSandboxNetworkMode,
  parseSandboxAllowedDomains,
  parseSandboxPathList,
  type SandboxNetworkMode,
  type SandboxSettingsSnapshot,
} from "@pho-code/protocol";
import { expandHomePath } from "./sandbox-policy";
import type { SandboxRuntimeSnapshot } from "./sandbox-runtime";

export const SANDBOX_SETTINGS_FILE = "sandbox-settings.json";

export interface StoredSandboxSettings {
  enabled: boolean;
  networkMode: SandboxNetworkMode;
  allowedDomains: string[];
  includePackageRegistryDefaults: boolean;
  additionalReadPaths: string[];
  additionalWritePaths: string[];
}

export function emptyStoredSandboxSettings(): StoredSandboxSettings {
  return {
    enabled: true,
    networkMode: "deny",
    allowedDomains: [],
    includePackageRegistryDefaults: false,
    additionalReadPaths: [],
    additionalWritePaths: [],
  };
}

export function sandboxSettingsPath(applicationDataDir: string): string {
  return path.join(applicationDataDir, SANDBOX_SETTINGS_FILE);
}

export function loadSandboxSettings(applicationDataDir: string): StoredSandboxSettings {
  const filePath = sandboxSettingsPath(applicationDataDir);
  if (!existsSync(filePath)) {
    return emptyStoredSandboxSettings();
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return coerceStoredSandboxSettings(parsed) ?? emptyStoredSandboxSettings();
  } catch {
    return emptyStoredSandboxSettings();
  }
}

export function saveSandboxSettings(applicationDataDir: string, settings: StoredSandboxSettings): void {
  const filePath = sandboxSettingsPath(applicationDataDir);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  try {
    writeFileSync(tmpPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      if (existsSync(tmpPath)) {
        unlinkSync(tmpPath);
      }
    } catch {
      // Best-effort temp cleanup; the original file is unchanged.
    }
    throw error;
  }
}

export function coerceStoredSandboxSettings(value: unknown): StoredSandboxSettings | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const allowedDomains = record.allowedDomains === undefined ? [] : parseSandboxAllowedDomains(record.allowedDomains);
  const additionalReadPaths =
    record.additionalReadPaths === undefined ? [] : parseSandboxPathList(record.additionalReadPaths);
  const additionalWritePaths =
    record.additionalWritePaths === undefined ? [] : parseSandboxPathList(record.additionalWritePaths);
  if (allowedDomains === undefined || additionalReadPaths === undefined || additionalWritePaths === undefined) {
    return undefined;
  }
  if (record.networkMode !== undefined && !isSandboxNetworkMode(record.networkMode)) {
    return undefined;
  }
  return {
    enabled: record.enabled !== false,
    networkMode: isSandboxNetworkMode(record.networkMode) ? record.networkMode : "deny",
    allowedDomains,
    includePackageRegistryDefaults: record.includePackageRegistryDefaults === true,
    additionalReadPaths,
    additionalWritePaths,
  };
}

export function canonicalizeSandboxPath(value: string): string {
  const expanded = expandHomePath(value);
  const resolved = path.resolve(expanded);
  if (resolved.split(path.sep).includes("..")) {
    throw new Error("Sandbox extra paths cannot contain parent traversal.");
  }
  if (!path.isAbsolute(resolved)) {
    throw new Error("Sandbox extra paths must be absolute.");
  }
  return resolved;
}

export function canonicalizeSandboxPathList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const canonical = canonicalizeSandboxPath(value);
    if (seen.has(canonical)) {
      continue;
    }
    seen.add(canonical);
    result.push(canonical);
  }
  return result;
}

export function applyStoredSandboxPatch(
  current: StoredSandboxSettings,
  patch: {
    enabled?: boolean;
    networkMode?: SandboxNetworkMode;
    allowedDomains?: string[];
    includePackageRegistryDefaults?: boolean;
    additionalReadPaths?: string[];
    additionalWritePaths?: string[];
  },
): StoredSandboxSettings {
  return {
    enabled: patch.enabled ?? current.enabled,
    networkMode: patch.networkMode ?? current.networkMode,
    allowedDomains: patch.allowedDomains ?? current.allowedDomains,
    includePackageRegistryDefaults: patch.includePackageRegistryDefaults ?? current.includePackageRegistryDefaults,
    additionalReadPaths: patch.additionalReadPaths ?? current.additionalReadPaths,
    additionalWritePaths: patch.additionalWritePaths ?? current.additionalWritePaths,
  };
}

export function toSandboxSettingsSnapshot(
  stored: StoredSandboxSettings,
  live: SandboxRuntimeSnapshot,
): SandboxSettingsSnapshot {
  const snapshot: SandboxSettingsSnapshot = {
    ...emptySandboxSettingsSnapshot(),
    enabled: live.enabled,
    status: live.status,
    networkMode: stored.networkMode,
    allowedDomains: [...stored.allowedDomains],
    includePackageRegistryDefaults: stored.includePackageRegistryDefaults,
    additionalReadPaths: [...stored.additionalReadPaths],
    additionalWritePaths: [...stored.additionalWritePaths],
    platformSupported: live.platformSupported,
  };
  if (live.enabled && live.statusReason) {
    snapshot.statusReason = live.statusReason;
  }
  return snapshot;
}
