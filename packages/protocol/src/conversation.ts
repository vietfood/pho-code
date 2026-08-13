import type { ImageMimeType } from "./attachments";
import type { HarnessError } from "./errors";
import type { FeatureSnapshot } from "./resources";
import type { WorkspaceReferenceToken } from "./retrieval";
import type { ModelSummary, SessionSummary, ThinkingLevel, WorkspaceSummary } from "./workspace";

export type TranscriptRole = "user" | "assistant";

export type ToolStatus = "running" | "completed" | "failed" | "cancelled";

export type RunStatus = "idle" | "admitted" | "streaming" | "settled" | "failed" | "cancelled";

export interface TranscriptTextBlock {
  type: "text";
  text: string;
}

export interface TranscriptThinkingBlock {
  type: "thinking";
  text: string;
}

export interface TranscriptToolBlock {
  type: "tool";
  callId: string;
  name: string;
  status: ToolStatus;
  inputPreview: string;
  outputPreview: string;
}

/** Reopened/admitted image placeholder. Never includes bytes or an absolute path. */
export interface TranscriptImageBlock {
  type: "image";
  name: string;
  mimeType: ImageMimeType;
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

export interface ToolActivity {
  callId: string;
  name: string;
  status: ToolStatus;
  inputPreview: string;
  outputPreview: string;
}

/** Ordered think/tool segments for the in-flight assistant turn. */
export type RunWorkEntry =
  | { type: "thinking"; text: string }
  | {
      type: "tool";
      callId: string;
      name: string;
      status: ToolStatus;
      inputPreview: string;
      outputPreview: string;
    };

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
}

export interface PromptAdmission {
  sessionId: string;
  runId: string;
  admitted: boolean;
}

export interface OpenSessionInput {
  sessionId: string;
  /** When set and different from the active workspace, switch workspace before opening. */
  workspaceId?: string;
}

export interface CreateSessionInput {
  /** When set and different from the active workspace, switch workspace before creating. */
  workspaceId?: string;
}

export interface SendPromptInput {
  sessionId: string;
  text: string;
  /** Optional extra workspace-relative paths. Inline `@path` mentions in `text` are also extracted. */
  references?: WorkspaceReferenceToken[];
  /** Prepared image ids from `pickImages` / `pasteImages`. Dropped after successful admission. */
  imageIds?: string[];
}

export interface SteerRunInput {
  sessionId: string;
  runId: string;
  text: string;
  references?: WorkspaceReferenceToken[];
  imageIds?: string[];
}

export interface QueueFollowUpInput {
  sessionId: string;
  runId: string;
  text: string;
  references?: WorkspaceReferenceToken[];
  imageIds?: string[];
}

export interface QueueAdmission {
  sessionId: string;
  runId: string;
  admitted: boolean;
  queue: SessionQueueState;
}

export interface AbortRunInput {
  sessionId: string;
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
  provider: string;
  id: string;
}

export interface SetThinkingLevelInput {
  sessionId: string;
  level: ThinkingLevel;
}

export function idleRunState(): RunState {
  return {
    status: "idle",
    streamingText: "",
    work: [],
  };
}
