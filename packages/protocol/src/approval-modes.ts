import {
  AGENT_APPROVAL_MODES,
  isAgentApprovalMode,
  type AgentApprovalDecisionOutcome,
  type AgentApprovalMode,
  type AgentApprovalReviewerState,
} from "@pho-agent/protocol";
import type { SessionKey } from "./session-lifecycle";

export const APPROVAL_MODES = AGENT_APPROVAL_MODES;
export const MAX_APPROVAL_REASON_CHARS = 4_000;
export const MAX_APPROVAL_HISTORY_PAGE_SIZE = 100;
export type ApprovalMode = AgentApprovalMode;
export type DurableApprovalMode = Exclude<ApprovalMode, "full">;
export type ApprovalModeOwner = "pho" | "backend";
export type ApprovalModeSupportLevel = "native" | "emulated" | "experimental";

export interface ApprovalModeSupport {
  mode: ApprovalMode;
  owner: ApprovalModeOwner;
  support: ApprovalModeSupportLevel;
  reason?: string;
}

export type ApprovalContainmentState = "contained" | "elevated" | "full" | "unavailable";
export type ApprovalReviewerState = AgentApprovalReviewerState;
export type ApprovalReviewOutcome = "approved" | "blocked" | "owner-required" | "unavailable";

export interface ApprovalReviewActivity {
  requestId: string;
  state: "reviewing" | "settled";
  outcome?: ApprovalReviewOutcome;
  rationale?: string;
  retryArmed?: boolean;
}

export interface ApprovalActionSummary {
  title: string;
  summary: string;
  /** Exact canonical JSON that the runtime fingerprinted; shown only on explicit disclosure. */
  exactInput?: string;
  target?: { label: string; value: string };
}

export interface ApprovalRequest extends SessionKey {
  requestId: string;
  runId?: string;
  action: ApprovalActionSummary;
  reason?: string;
  source: "owner" | "automatic-review";
}

export interface SessionApprovalSnapshot {
  configuredMode: ApprovalMode;
  effectiveMode: ApprovalMode;
  supportedModes: ApprovalModeSupport[];
  containment: ApprovalContainmentState;
  reviewer: {
    state: ApprovalReviewerState;
    modelId?: string;
  };
  pendingRequest?: ApprovalRequest;
  fullAccess: {
    enabled: boolean;
    active: boolean;
    acknowledgedThisProcess: boolean;
  };
  fallbackReason?: string;
  activity?: ApprovalReviewActivity;
  policyGeneration: number;
  activeSessionGrants: number;
}

export type ApprovalMigrationState =
  | "not-needed"
  | "ready"
  | "custom-blocked"
  | "shared-root-warning"
  | "complete"
  | "failed";

export interface ApprovalModeSettingsSnapshot {
  defaultMode: DurableApprovalMode;
  autoEnabled: boolean;
  fullAccessEnabled: boolean;
  reviewer: {
    selection: "automatic" | "model";
    providerId?: string;
    modelId?: string;
    effectiveModelId?: string;
    available: boolean;
    reason?: string;
  };
  decisionHistoryEnabled: boolean;
  migration: {
    state: ApprovalMigrationState;
    reason?: string;
  };
  legacy: {
    profile: string;
    yoloMode: boolean;
    custom: boolean;
    sharedAgentDir: boolean;
  };
  boundary: {
    sandboxAvailable: boolean;
    status: string;
  };
}

export interface UpdateApprovalModeSettingsInput {
  defaultMode?: DurableApprovalMode;
  autoEnabled?: boolean;
  fullAccessEnabled?: boolean;
  reviewer?:
    | { selection: "automatic" }
    | { selection: "model"; providerId: string; modelId: string };
  decisionHistoryEnabled?: boolean;
}

export interface SetSessionApprovalModeInput extends SessionKey {
  mode: ApprovalMode;
  acknowledgeFullRisk?: boolean;
}

export type ApprovalRequestResolution = "allow-once" | "allow-session" | "deny";

export interface ResolveApprovalRequestInput extends SessionKey {
  requestId: string;
  resolution: ApprovalRequestResolution;
  reason?: string;
}

export interface AuthorizeApprovalRetryInput extends SessionKey {
  requestId: string;
}

export interface RevokeApprovalGrantInput extends SessionKey {
  grantId?: string;
  all?: boolean;
}

export interface MigrateLegacyPermissionSettingsInput {
  acknowledgeCustom?: boolean;
  acknowledgeSharedAgentDir?: boolean;
}

export interface ListApprovalDecisionHistoryInput {
  cursor?: string;
  limit?: number;
}

export interface ApprovalDecisionHistoryEntry {
  id: string;
  occurredAt: string;
  backendId?: string;
  workspaceId: string;
  sessionId: string;
  runId: string;
  mode: ApprovalMode;
  outcome: AgentApprovalDecisionOutcome | "cancelled" | "stale";
  source: "policy" | "session-grant" | "owner" | "reviewer";
  ruleId: string;
  toolName: string;
  reviewerModelId?: string;
  action: ApprovalActionSummary;
  rationale?: string;
}

export interface ApprovalDecisionHistoryPage {
  entries: ApprovalDecisionHistoryEntry[];
  nextCursor?: string;
}

export interface ApprovalRequestSettledPayload extends SessionKey {
  requestId: string;
}

export function isApprovalMode(value: unknown): value is ApprovalMode {
  return isAgentApprovalMode(value);
}

export function isDurableApprovalMode(value: unknown): value is DurableApprovalMode {
  return value === "ask" || value === "auto";
}

export function isApprovalRequestResolution(value: unknown): value is ApprovalRequestResolution {
  return value === "allow-once" || value === "allow-session" || value === "deny";
}

export function defaultSessionApprovalSnapshot(): SessionApprovalSnapshot {
  return {
    configuredMode: "ask",
    effectiveMode: "ask",
    supportedModes: [{ mode: "ask", owner: "pho", support: "native" }],
    containment: "contained",
    reviewer: { state: "user" },
    activeSessionGrants: 0,
    fullAccess: { enabled: false, active: false, acknowledgedThisProcess: false },
    policyGeneration: 0,
  };
}
