import type { HarnessError } from "./errors";
import type { FeatureSnapshot } from "./resources";
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

export type TranscriptBlock = TranscriptTextBlock | TranscriptThinkingBlock | TranscriptToolBlock;

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
