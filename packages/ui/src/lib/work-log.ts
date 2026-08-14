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

function hasLaterTool(blocks: readonly TranscriptBlock[], index: number): boolean {
  for (let cursor = index + 1; cursor < blocks.length; cursor += 1) {
    if (blocks[cursor]?.type === "tool") {
      return true;
    }
  }
  return false;
}

/**
 * Text after the last tool is the turn answer. Text that still has a later tool
 * is step narration and belongs in the work log with thinking/tools.
 */
export function isTurnOutputText(blocks: readonly TranscriptBlock[], index: number): boolean {
  const block = blocks[index];
  return block?.type === "text" && !hasLaterTool(blocks, index);
}

export function isWorkLogBlock(blocks: readonly TranscriptBlock[], index: number): boolean {
  const block = blocks[index];
  if (!block) {
    return false;
  }
  switch (block.type) {
    case "thinking":
    case "tool":
      return true;
    case "text":
      return hasLaterTool(blocks, index);
    case "image":
      return false;
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

export function turnOutputTextBlocks(
  blocks: readonly TranscriptBlock[],
): Extract<TranscriptBlock, { type: "text" }>[] {
  return blocks.filter((block, index): block is Extract<TranscriptBlock, { type: "text" }> => {
    return block.type === "text" && isTurnOutputText(blocks, index);
  });
}

/** Plain-text agent output for a turn (post-tool text only; thinking/tools/narration omitted). */
export function turnTextOutput(blocks: readonly TranscriptBlock[]): string {
  return turnOutputTextBlocks(blocks)
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}

export function lastTextBearingMessage(
  messages: readonly TranscriptMessage[],
): TranscriptMessage | undefined {
  const blocks = collectTurnBlocks(messages);
  let offset = 0;
  let last: TranscriptMessage | undefined;
  for (const message of messages) {
    if (message.role === "assistant") {
      for (let index = 0; index < message.blocks.length; index += 1) {
        if (isTurnOutputText(blocks, offset + index)) {
          last = message;
          break;
        }
      }
    }
    offset += message.blocks.length;
  }
  return last;
}

export function rewrittenOriginalText(blocks: readonly TranscriptBlock[]): string | undefined {
  return turnOutputTextBlocks(blocks).find((block) => block.originalText !== undefined)?.originalText;
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
