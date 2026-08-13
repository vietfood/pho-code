import type { FeatureSnapshot } from "./resources";

export interface RecentWorkspaceRecord {
  id: string;
  path: string;
  displayName: string;
  lastOpenedAt: string;
}

export interface WorkspaceSummary extends RecentWorkspaceRecord {
  projectResourcesApproved: boolean;
}

export interface ModelSummary {
  provider: string;
  id: string;
  name: string;
}

/** Pi thinking levels projected for JSON-safe UI selectors. */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export const THINKING_LEVELS: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && (THINKING_LEVELS as readonly string[]).includes(value);
}

export interface WorkspaceSnapshot {
  workspace: WorkspaceSummary;
  sessions: SessionSummary[];
  models: ModelSummary[];
  features: FeatureSnapshot;
  modelError?: string;
}

export interface SessionSummary {
  id: string;
  workspaceId: string;
  title: string;
  updatedAt: string;
  preview?: string;
}
