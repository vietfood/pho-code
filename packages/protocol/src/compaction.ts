import type { AgentCompactionDetail } from "@pho-agent/protocol/compaction";

export {
  AGENT_COMPACTION_OUTCOMES,
  AGENT_COMPACTION_REASONS,
  AGENT_COMPACTION_STATUSES,
  idleAgentCompactionState,
  isAgentCompactionBoundary,
  isAgentCompactionDetail,
  isAgentCompactionOutcome,
  isAgentCompactionReason,
  isAgentCompactionState,
  MAX_COMPACTION_ERROR_CHARS,
  MAX_COMPACTION_SUMMARY_CHARS,
  sanitizeCompactionError,
} from "@pho-agent/protocol/compaction";
export type {
  AgentCompactionBoundary,
  AgentCompactionDetail,
  AgentCompactionOutcome,
  AgentCompactionReason,
  AgentCompactionState,
} from "@pho-agent/protocol/compaction";

/** Compaction lifecycle state carried on every session snapshot. */
export type { AgentCompactionState as SessionCompactionState } from "@pho-agent/protocol/compaction";

/** Transcript boundary item projected into `SessionSnapshot.messages`. */
export type { AgentCompactionBoundary as TranscriptCompactionBoundary } from "@pho-agent/protocol/compaction";

/**
 * Command inputs follow the session-command convention: `workspaceId` may be
 * omitted for the selected session; the application layer resolves scope.
 */
export interface CompactSessionInput {
  backendId?: string;
  sessionId: string;
  workspaceId?: string;
}

export type CancelSessionCompactionInput = CompactSessionInput;

export interface GetCompactionDetailInput {
  backendId?: string;
  sessionId: string;
  workspaceId?: string;
  compactionId: string;
}

export interface CompactionDetail extends AgentCompactionDetail {
  backendId?: string;
  workspaceId: string;
  sessionId: string;
  compactionId: string;
}

/** Owner-facing copy for the compaction surface. */
export const COMPACTION_COPY = {
  action: "Compact context",
  actionBusy: "Compacting…",
  cancel: "Cancel",
  unavailableRunning: "Wait for the current run to finish before compacting.",
  unavailableModel: "Select a model before compacting.",
  boundaryLabel: "Context compacted",
  boundaryLabelFromNotes: "Context compacted from notes",
  boundaryFromNotesHint:
    "Notes and recent messages were kept. Earlier work left the model context and stays searchable.",
  boundaryShowSummary: "Show summary",
  boundaryHideSummary: "Hide summary",
  summaryUnavailable: "No summary was recorded for this compaction.",
  usageNote: "Context is the current window. Input, output, cache, and cost are cumulative for the session.",
} as const;
