import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  isDurableApprovalMode,
  type ApprovalModeSettingsSnapshot,
  type UpdateApprovalModeSettingsInput,
} from "@pho-code/protocol";
import type { PermissionSettings } from "@pho-code/protocol";
import type { SandboxRuntimeSnapshot } from "./sandbox-runtime";

export const APPROVAL_MODE_SETTINGS_FILE = "approval-modes.json";
const APPROVAL_MODE_SETTINGS_VERSION = 1;

export interface StoredApprovalModeSettings {
  version: typeof APPROVAL_MODE_SETTINGS_VERSION;
  defaultMode: "ask" | "auto";
  autoEnabled: boolean;
  fullAccessEnabled: boolean;
  reviewer: { selection: "automatic" } | { selection: "model"; providerId: string; modelId: string };
  decisionHistoryEnabled: boolean;
  migrationComplete: boolean;
}

export function defaultApprovalModeSettings(): StoredApprovalModeSettings {
  return {
    version: APPROVAL_MODE_SETTINGS_VERSION,
    defaultMode: "ask",
    autoEnabled: false,
    fullAccessEnabled: false,
    reviewer: { selection: "automatic" },
    decisionHistoryEnabled: true,
    migrationComplete: false,
  };
}

export function approvalModeSettingsPath(applicationDataDir: string): string {
  return path.join(applicationDataDir, APPROVAL_MODE_SETTINGS_FILE);
}

export function createApprovalModeSettingsStore(applicationDataDir: string) {
  const filePath = approvalModeSettingsPath(applicationDataDir);
  let current = load(filePath);

  function persist(next: StoredApprovalModeSettings): StoredApprovalModeSettings {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.${process.pid}.tmp`;
    try {
      writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      renameSync(temp, filePath);
    } catch (error) {
      try {
        if (existsSync(temp)) unlinkSync(temp);
      } catch {
        // The original settings file remains authoritative.
      }
      throw error;
    }
    current = next;
    return current;
  }

  return {
    get current(): StoredApprovalModeSettings {
      return current;
    },
    update(patch: UpdateApprovalModeSettingsInput): StoredApprovalModeSettings {
      const reviewer = patch.reviewer ?? current.reviewer;
      const next: StoredApprovalModeSettings = {
        ...current,
        ...(patch.defaultMode ? { defaultMode: patch.defaultMode } : {}),
        ...(patch.autoEnabled !== undefined ? { autoEnabled: patch.autoEnabled } : {}),
        ...(patch.fullAccessEnabled !== undefined ? { fullAccessEnabled: patch.fullAccessEnabled } : {}),
        ...(patch.decisionHistoryEnabled !== undefined
          ? { decisionHistoryEnabled: patch.decisionHistoryEnabled }
          : {}),
        reviewer,
      };
      if (!next.autoEnabled && next.defaultMode === "auto") next.defaultMode = "ask";
      return persist(next);
    },
    markMigrationComplete(): StoredApprovalModeSettings {
      return persist({ ...current, migrationComplete: true });
    },
  };
}

export function projectApprovalModeSettings(input: {
  stored: StoredApprovalModeSettings;
  permission: PermissionSettings;
  sandbox: SandboxRuntimeSnapshot;
  reviewer?: { available: boolean; effectiveModelId?: string; reason?: string };
}): ApprovalModeSettingsSnapshot {
  const reviewer = input.reviewer ?? { available: false, reason: "No compatible authenticated reviewer model is available." };
  const custom = input.permission.profile === "custom";
  const migrationState = input.stored.migrationComplete
    ? "complete"
    : custom
      ? "custom-blocked"
      : input.permission.appliesToSharedPiAgentDir
        ? "shared-root-warning"
        : "ready";
  return {
    defaultMode: input.stored.defaultMode,
    autoEnabled: input.stored.autoEnabled,
    fullAccessEnabled: input.stored.fullAccessEnabled,
    reviewer: {
      ...input.stored.reviewer,
      available: reviewer.available,
      ...(reviewer.effectiveModelId ? { effectiveModelId: reviewer.effectiveModelId } : {}),
      ...(reviewer.reason ? { reason: reviewer.reason } : {}),
    },
    decisionHistoryEnabled: input.stored.decisionHistoryEnabled,
    migration: { state: migrationState },
    legacy: {
      profile: input.permission.profile,
      yoloMode: input.permission.yoloMode,
      custom,
      sharedAgentDir: input.permission.appliesToSharedPiAgentDir,
    },
    boundary: {
      sandboxAvailable: input.sandbox.enabled && input.sandbox.status === "healthy",
      status: input.sandbox.status,
    },
  };
}

function load(filePath: string): StoredApprovalModeSettings {
  if (!existsSync(filePath)) return defaultApprovalModeSettings();
  try {
    return parse(JSON.parse(readFileSync(filePath, "utf8"))) ?? defaultApprovalModeSettings();
  } catch {
    return defaultApprovalModeSettings();
  }
}

function parse(value: unknown): StoredApprovalModeSettings | undefined {
  if (!plainRecord(value) || value.version !== APPROVAL_MODE_SETTINGS_VERSION) return undefined;
  if (!isDurableApprovalMode(value.defaultMode)) return undefined;
  if (
    typeof value.autoEnabled !== "boolean" ||
    typeof value.fullAccessEnabled !== "boolean" ||
    typeof value.decisionHistoryEnabled !== "boolean" ||
    typeof value.migrationComplete !== "boolean" ||
    !plainRecord(value.reviewer)
  ) {
    return undefined;
  }
  const reviewer = value.reviewer;
  if (reviewer.selection === "automatic") {
    return { ...(value as unknown as StoredApprovalModeSettings), reviewer: { selection: "automatic" } };
  }
  if (
    reviewer.selection !== "model" ||
    typeof reviewer.providerId !== "string" ||
    !reviewer.providerId.trim() ||
    typeof reviewer.modelId !== "string" ||
    !reviewer.modelId.trim()
  ) {
    return undefined;
  }
  return {
    ...(value as unknown as StoredApprovalModeSettings),
    reviewer: { selection: "model", providerId: reviewer.providerId, modelId: reviewer.modelId },
  };
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
