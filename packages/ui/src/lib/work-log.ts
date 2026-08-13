import type { RunWorkEntry, TranscriptBlock, TranscriptMessage } from "@pho-code/protocol";

export interface WorkLogCounts {
  thoughts: number;
  tools: number;
  steps: number;
}

export type TranscriptSegment =
  | { kind: "user"; message: TranscriptMessage }
  | { kind: "assistantTurn"; key: string; messages: TranscriptMessage[] };

/** Group consecutive assistant messages into one Codex-style turn (all work under one collapse). */
export function groupTranscriptSegments(messages: readonly TranscriptMessage[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let pending: TranscriptMessage[] = [];

  const flushAssistant = () => {
    if (pending.length === 0) {
      return;
    }
    const first = pending[0];
    if (!first) {
      pending = [];
      return;
    }
    segments.push({ kind: "assistantTurn", key: first.id, messages: pending });
    pending = [];
  };

  for (const message of messages) {
    if (message.role === "user") {
      flushAssistant();
      segments.push({ kind: "user", message });
      continue;
    }
    pending.push(message);
  }
  flushAssistant();
  return segments;
}

export function collectTurnBlocks(messages: readonly TranscriptMessage[]): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  for (const message of messages) {
    blocks.push(...message.blocks);
  }
  return blocks;
}

/** Plain-text agent output for a turn (text blocks only; thinking/tools omitted). */
export function turnTextOutput(blocks: readonly TranscriptBlock[]): string {
  return blocks
    .filter((block): block is Extract<TranscriptBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}

export function lastTextBearingMessage(
  messages: readonly TranscriptMessage[],
): TranscriptMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") {
      continue;
    }
    if (message.blocks.some((block) => block.type === "text")) {
      return message;
    }
  }
  return undefined;
}

export function rewrittenOriginalText(blocks: readonly TranscriptBlock[]): string | undefined {
  const textBlocks = blocks.filter((block): block is Extract<TranscriptBlock, { type: "text" }> => block.type === "text");
  return textBlocks.find((block) => block.originalText !== undefined)?.originalText;
}

export function countWorkBlocks(blocks: readonly TranscriptBlock[] | readonly RunWorkEntry[]): WorkLogCounts {
  let thoughts = 0;
  let tools = 0;
  for (const block of blocks) {
    switch (block.type) {
      case "thinking":
        thoughts += 1;
        break;
      case "tool":
        tools += 1;
        break;
      case "text":
      case "image":
        break;
      default: {
        const exhaustive: never = block;
        void exhaustive;
      }
    }
  }
  return { thoughts, tools, steps: thoughts + tools };
}

export function formatWorkDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${Math.max(1, seconds)}s`;
}

export function workedForLabel(options: {
  live: boolean;
  startedAt?: string;
  endedAt?: string;
  nowMs?: number;
}): string {
  const { live, startedAt, endedAt, nowMs = Date.now() } = options;
  const startMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const endMs = live ? nowMs : endedAt ? Date.parse(endedAt) : Number.NaN;
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
    const duration = formatWorkDuration(endMs - startMs);
    return live ? `Working for ${duration}` : `Worked for ${duration}`;
  }
  return live ? "Working" : "Worked";
}

export function turnTiming(
  messages: readonly TranscriptMessage[],
  previousUserCreatedAt?: string,
): {
  startedAt?: string;
  endedAt?: string;
} {
  let startedAt = previousUserCreatedAt;
  let endedAt: string | undefined;
  for (const message of messages) {
    if (!message.createdAt) {
      continue;
    }
    if (!startedAt || message.createdAt < startedAt) {
      startedAt = message.createdAt;
    }
    if (!endedAt || message.createdAt > endedAt) {
      endedAt = message.createdAt;
    }
  }
  return { ...(startedAt ? { startedAt } : {}), ...(endedAt ? { endedAt } : {}) };
}
