import type { ImageMimeType } from "./attachments";
import type { ChangeReviewSetSummary } from "./change-review";
import type { SessionContextPrompt } from "./context-prompt";
import type { HarnessError } from "./errors";
import type { SessionPlanSnapshot } from "./plan-agent";
import type { FeatureSnapshot } from "./resources";
import type { WorkspaceReferenceToken } from "./retrieval";
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

export function isQueueMode(value: unknown): value is QueueMode {
  return value === "all" || value === "one-at-a-time";
}

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

/** Ordered think/tool segments for the in-flight assistant turn. */
export type RunWorkEntry = { type: "thinking"; text: string } | TranscriptToolBlock;

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
  messages: TranscriptMessage[];
  run: RunState;
  model?: ModelSummary;
  models: ModelSummary[];
  sessions: SessionSummary[];
  features: FeatureSnapshot;
  thinkingLevel: ThinkingLevel;
  availableThinkingLevels: ThinkingLevel[];
  supportsThinking: boolean;
  modelError?: string;
  contextUsage?: ContextUsageSummary;
  usage?: SessionUsageSummary;
  queue?: SessionQueueState;
  contextPrompt?: SessionContextPrompt;
  /** Plan/Agent add-on projection. Absent on snapshots from before the factory existed. */
  plan?: SessionPlanSnapshot;
  /** Bounded per-run write/edit review summaries for this chat. Diff bodies are fetched on demand. */
  changeReviews?: ChangeReviewSetSummary[];
}

export interface PromptAdmission {
  sessionId: string;
  workspaceId?: string;
  runId: string;
  admitted: boolean;
}

export interface OpenSessionInput {
  sessionId: string;
  /** Composite session owner. Required when more than one live session exists. */
  workspaceId?: string;
}

export interface CreateSessionInput {
  /** When set and different from the active workspace, switch workspace before creating. */
  workspaceId?: string;
}

export interface SendPromptInput {
  sessionId: string;
  workspaceId?: string;
  text: string;
  /** Optional extra workspace-relative paths. Inline `@path` mentions in `text` are also extracted. */
  references?: WorkspaceReferenceToken[];
  /** Prepared image ids from `pickImages` / `pasteImages`. Dropped after successful admission. */
  imageIds?: string[];
}

export interface SteerRunInput {
  sessionId: string;
  workspaceId?: string;
  runId: string;
  text: string;
  references?: WorkspaceReferenceToken[];
  imageIds?: string[];
}

export interface QueueFollowUpInput {
  sessionId: string;
  workspaceId?: string;
  runId: string;
  text: string;
  references?: WorkspaceReferenceToken[];
  imageIds?: string[];
}

export interface QueueAdmission {
  sessionId: string;
  workspaceId?: string;
  runId: string;
  admitted: boolean;
  queue: SessionQueueState;
}

export interface AbortRunInput {
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
  sessionId: string;
  workspaceId?: string;
  provider: string;
  id: string;
}

export interface SetThinkingLevelInput {
  sessionId: string;
  workspaceId?: string;
  level: ThinkingLevel;
}

/** Owner-edited assistant markdown. Display overlay only; Pi JSONL messages stay unchanged. */
export const MAX_ASSISTANT_REWRITE_CHARS = 100_000;

export interface RewriteAssistantOutputInput {
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
