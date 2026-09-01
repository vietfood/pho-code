import type { AgentToolKind } from "@pho-agent/protocol";
import type { SessionApprovalSnapshot } from "./approval-modes";
import type { ImageMimeType } from "./attachments";
import type { ChangeReviewSetSummary } from "./change-review";
import type { SessionCompactionState, TranscriptCompactionBoundary } from "./compaction";
import type { SessionContextPrompt } from "./context-prompt";
import type { HarnessError } from "./errors";
import type { SessionPlanSnapshot } from "./plan-agent";
import type { FeatureSnapshot } from "./resources";
import type { WorkspaceReferenceToken } from "./retrieval";
import type { AgentTaskSnapshot } from "./task";
import type { ModelSummary, SessionSummary, ThinkingLevel, WorkspaceSummary } from "./workspace";

export type TranscriptRole = "user" | "assistant";

export type ToolStatus = "running" | "completed" | "failed" | "cancelled";

export type RunStatus = "idle" | "admitted" | "streaming" | "settled" | "failed" | "cancelled";

export interface TranscriptTextBlock {
  type: "text";
  text: string;
  /** Present when the owner rewrote this block; Pi JSONL still holds this original. */
  originalText?: string;
}

export interface TranscriptThinkingBlock {
  type: "thinking";
  text: string;
}

export interface ToolActivity {
  callId: string;
  name: string;
  /** Backend-neutral presentation hint; backend-specific names remain available as fallback. */
  kind?: AgentToolKind;
  status: ToolStatus;
  inputPreview: string;
  outputPreview: string;
  /** True when this bash/user_bash call ran through a healthy Seatbelt wrap. */
  sandboxed?: boolean;
}

export interface TranscriptToolBlock extends ToolActivity {
  type: "tool";
}

/**
 * Admitted image in the transcript. Never includes an absolute path.
 * `previewDataUrl` is a bounded `data:` URL for display/lightbox when available.
 */
export interface TranscriptImageBlock {
  type: "image";
  name: string;
  mimeType: ImageMimeType;
  previewDataUrl?: string;
}

export type TranscriptBlock =
  | TranscriptTextBlock
  | TranscriptThinkingBlock
  | TranscriptToolBlock
  | TranscriptImageBlock;

export const QUEUE_MODES = ["all", "one-at-a-time"] as const;

export type QueueMode = (typeof QUEUE_MODES)[number];

export interface QueueMessagePreview {
  text: string;
}

export interface SessionQueueState {
  steering: QueueMessagePreview[];
  followUp: QueueMessagePreview[];
  steeringMode: QueueMode;
  followUpMode: QueueMode;
}

export function emptyQueueState(): SessionQueueState {
  return {
    steering: [],
    followUp: [],
    steeringMode: "all",
    followUpMode: "all",
  };
}

export interface TranscriptMessage {
  id: string;
  role: TranscriptRole;
  blocks: TranscriptBlock[];
  /** ISO timestamp when the underlying Pi message was created. */
  createdAt?: string;
}

/**
 * Display-transcript element: a projected message or a compaction boundary.
 * The full active branch stays visible; boundaries mark where the model
 * context was compacted. Reducers and UI grouping must branch on the
 * compaction kind before reading message fields.
 */
export type TranscriptItem = TranscriptMessage | TranscriptCompactionBoundary;

export function isTranscriptCompactionBoundary(item: TranscriptItem): item is TranscriptCompactionBoundary {
  return (item as { kind?: unknown }).kind === "compaction";
}

/**
 * Ordered think/narration/tool segments for the in-flight assistant turn.
 * A `text` entry is pre-tool narration committed when a new tool starts; the
 * post-last-tool answer tail stays in `RunState.streamingText`.
 */
export type RunWorkEntry =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | TranscriptToolBlock;

export interface RunState {
  runId?: string;
  status: RunStatus;
  streamingText: string;
  /** Live think → tool → think sequence; mirrors settled assistant work blocks. */
  work: RunWorkEntry[];
  /** ISO timestamp when the current run was admitted (for live “Working for…” duration). */
  startedAt?: string;
  error?: HarnessError;
}

/** Projected from Pi `ContextUsage` for the live session. */
export interface ContextUsageSummary {
  /** Estimated context tokens, or null when unknown (e.g. right after compaction). */
  tokens: number | null;
  contextWindow: number;
  /** Percent of context window used, or null when tokens is unknown. */
  percent: number | null;
}

/** Cumulative session token/cost totals from Pi `SessionStats`. */
export interface SessionUsageSummary {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  costUsd: number;
}

export interface SessionSnapshot {
  session: SessionSummary;
  workspace: WorkspaceSummary;
  messages: TranscriptItem[];
  run: RunState;
  /** Compaction lifecycle state; always present, idle by default. */
  compaction: SessionCompactionState;
  model?: ModelSummary;
  models: ModelSummary[];
  sessions: SessionSummary[];
  features: FeatureSnapshot;
  thinkingLevel: ThinkingLevel;
  availableThinkingLevels: ThinkingLevel[];
  supportsThinking: boolean;
  fastMode?: {
    enabled: boolean;
    description?: string;
  };
  modelError?: string;
  contextUsage?: ContextUsageSummary;
  usage?: SessionUsageSummary;
  queue?: SessionQueueState;
  contextPrompt?: SessionContextPrompt;
  /** Plan/Agent add-on projection. Absent on snapshots from before the factory existed. */
  plan?: SessionPlanSnapshot;
  /** Bounded per-run write/edit review summaries for this chat. Diff bodies are fetched on demand. */
  changeReviews?: ChangeReviewSetSummary[];
  /** Approval-mode state is authoritative when present; older snapshots normalize to Ask in the renderer. */
  approval?: SessionApprovalSnapshot;
  /** V5 living brief, bounded evidence, verification ledger, and completion assessment. */
  task?: AgentTaskSnapshot;
}

export interface PromptAdmission {
  backendId?: string;
  sessionId: string;
  workspaceId?: string;
  runId: string;
  admitted: boolean;
}

export interface OpenSessionInput {
  backendId?: string;
  sessionId: string;
  /** Composite session owner. Required when more than one live session exists. */
  workspaceId?: string;
}

export interface CreateSessionInput {
  /** Defaults to Pi for compatibility with existing callers. */
  backendId?: string;
  /** When set and different from the active workspace, switch workspace before creating. */
  workspaceId?: string;
}

export interface SendPromptInput {
  backendId?: string;
  sessionId: string;
  workspaceId?: string;
  text: string;
  /** Optional extra workspace-relative paths. Inline `@path` mentions in `text` are also extracted. */
  references?: WorkspaceReferenceToken[];
  /** Prepared image ids from `pickImages` / `pasteImages`. Dropped after successful admission. */
  imageIds?: string[];
}

export interface SteerRunInput {
  backendId?: string;
  sessionId: string;
  workspaceId?: string;
  runId: string;
  text: string;
  references?: WorkspaceReferenceToken[];
  imageIds?: string[];
}

export interface QueueFollowUpInput {
  backendId?: string;
  sessionId: string;
  workspaceId?: string;
  runId: string;
  text: string;
  references?: WorkspaceReferenceToken[];
  imageIds?: string[];
}

export interface QueueAdmission {
  backendId?: string;
  sessionId: string;
  workspaceId?: string;
  runId: string;
  admitted: boolean;
  queue: SessionQueueState;
}

export interface AbortRunInput {
  backendId?: string;
  sessionId: string;
  workspaceId?: string;
  runId: string;
}

export interface OpenRecentWorkspaceInput {
  workspaceId: string;
}

export interface ListWorkspaceSessionsInput {
  workspaceId: string;
}

export interface ReorderRecentWorkspacesInput {
  workspaceIds: string[];
}

export interface SetSessionModelInput {
  backendId?: string;
  sessionId: string;
  workspaceId?: string;
  provider: string;
  id: string;
}

export interface SetThinkingLevelInput {
  backendId?: string;
  sessionId: string;
  workspaceId?: string;
  level: ThinkingLevel;
}

export interface SetFastModeInput {
  backendId?: string;
  sessionId: string;
  workspaceId?: string;
  enabled: boolean;
}

/** Owner-edited assistant markdown. Display overlay only; Pi JSONL messages stay unchanged. */
export const MAX_ASSISTANT_REWRITE_CHARS = 100_000;

export interface RewriteAssistantOutputInput {
  backendId?: string;
  sessionId: string;
  workspaceId?: string;
  messageId: string;
  text: string;
}

export function idleRunState(): RunState {
  return {
    status: "idle",
    streamingText: "",
    work: [],
  };
}
