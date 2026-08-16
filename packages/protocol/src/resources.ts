import type { AskUserAnswer, AskUserQuestion } from "./plan-agent";

export const FEATURE_TRUST_NOTICE =
  "Baked features run with this application's local permissions. Skills and later MCP features can cause tools or external actions to run. Renderer sandboxing does not sandbox feature code.";

export type ResourceDiagnosticType = "warning" | "error" | "collision" | "compatibility";

export interface ResourceDiagnostic {
  type: ResourceDiagnosticType;
  message: string;
  path?: string;
}

export type FeatureStatus = "loaded" | "degraded" | "failed";

export interface HarnessFeatureSummary {
  id: string;
  version: string;
  status: FeatureStatus;
  diagnostics: ResourceDiagnostic[];
}

export interface FeatureSnapshot {
  features: HarnessFeatureSummary[];
  diagnostics: ResourceDiagnostic[];
  trustNotice: string;
}

export type HostDialogKind = "confirm" | "select" | "input" | "questionnaire";

export interface HostDialogRequest {
  requestId: string;
  kind: HostDialogKind;
  title: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  questions?: AskUserQuestion[];
  workspaceId?: string;
  sessionId?: string;
}

export interface ExtensionNotification {
  requestId: string;
  message: string;
  level: "info" | "warning" | "error";
}

export interface ResolveHostDialogInput {
  requestId: string;
  workspaceId?: string;
  sessionId?: string;
  cancelled?: boolean;
  confirmed?: boolean;
  selected?: string;
  /** Input text, or an optional permission denial reason sent with `selected`. */
  value?: string;
  answers?: AskUserAnswer[];
}

export function emptyFeatureSnapshot(): FeatureSnapshot {
  return {
    features: [],
    diagnostics: [],
    trustNotice: FEATURE_TRUST_NOTICE,
  };
}
