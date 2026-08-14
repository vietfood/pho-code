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

/** Settled turn collapse copy — activity-based, not a stopwatch (Pi timestamps often undercount). */
export function settledWorkSummary(thoughts: number, tools: number): string {
  const safeThoughts = Math.max(0, thoughts);
  const safeTools = Math.max(0, tools);
  if (safeTools === 0 && safeThoughts === 0) {
    return "Behind the scenes";
  }
  if (safeTools === 0) {
    return safeThoughts <= 1 ? "Had a quick think" : "Thought it through";
  }
  if (safeThoughts === 0) {
    return safeTools === 1 ? "Took a peek" : "Looked around a bit";
  }
  if (safeTools === 1) {
    return "Thought, then peeked";
  }
  if (safeTools <= 3) {
    return "Did a little digging";
  }
  return "Went exploring";
}

export function workedForLabel(options: {
  live: boolean;
  thoughts?: number;
  tools?: number;
  startedAt?: string;
  nowMs?: number;
}): string {
  const { live, startedAt, nowMs = Date.now(), thoughts = 0, tools = 0 } = options;
  if (!live) {
    return settledWorkSummary(thoughts, tools);
  }
  const startMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  if (!Number.isNaN(startMs) && nowMs >= startMs) {
    const duration = formatWorkDuration(nowMs - startMs);
    return `Working for ${duration}`;
  }
  return "Working";
}
