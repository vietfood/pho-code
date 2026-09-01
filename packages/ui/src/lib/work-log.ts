import type {
  RunWorkEntry,
  TranscriptBlock,
  TranscriptCompactionBoundary,
  TranscriptItem,
  TranscriptMessage,
  TranscriptToolBlock,
} from "@pho-code/protocol";
import { isTranscriptCompactionBoundary } from "@pho-code/protocol";
import {
  describeToolInputTarget,
  conciseChipText,
  toolWorkEntryIcon,
  type WorkEntryIconName,
} from "../tool-presentation";

export interface WorkLogCounts {
  thoughts: number;
  tools: number;
  steps: number;
}

export type TranscriptSegment =
  | { kind: "user"; message: TranscriptMessage }
  | { kind: "assistantTurn"; key: string; messages: TranscriptMessage[] }
  | { kind: "compaction"; boundary: TranscriptCompactionBoundary };

/**
 * Group consecutive assistant messages into one Codex-style turn (all work
 * under one collapse). A compaction boundary is a hard separator: assistant
 * work never merges across it, so the pre-boundary turn keeps its own work log.
 */
export function groupTranscriptSegments(items: readonly TranscriptItem[]): TranscriptSegment[] {
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

  for (const item of items) {
    if (isTranscriptCompactionBoundary(item)) {
      flushAssistant();
      segments.push({ kind: "compaction", boundary: item });
      continue;
    }
    if (item.role === "user") {
      flushAssistant();
      segments.push({ kind: "user", message: item });
      continue;
    }
    pending.push(item);
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

export type WorkPhaseEntry = { type: "thinking"; text: string } | TranscriptToolBlock;

export interface WorkPhase {
  /** The pre-tool assistant text that opens the phase; absent for work before the first narration. */
  narration?: { type: "text"; text: string };
  entries: WorkPhaseEntry[];
}

/**
 * Narrative phases for one assistant turn: each pre-tool text block opens a
 * phase, and the contiguous thinking tail of the previous phase moves under it
 * (that thinking produced the narration). Output text never enters a phase.
 */
export function groupWorkPhases(blocks: readonly TranscriptBlock[]): WorkPhase[] {
  return collectWorkPhases(blocks, (block, index) => block.type === "text" && !isTurnOutputText(blocks, index));
}

/** Live work entries: every committed text entry is narration; the answer tail lives in streamingText. */
export function groupLiveWorkPhases(work: readonly RunWorkEntry[]): WorkPhase[] {
  return collectWorkPhases(work, (block) => block.type === "text");
}

function collectWorkPhases(
  blocks: readonly TranscriptBlock[],
  isNarration: (block: TranscriptBlock, index: number) => boolean,
): WorkPhase[] {
  const phases: WorkPhase[] = [];
  blocks.forEach((block, index) => {
    if (block.type === "image") {
      return;
    }
    if (block.type === "text") {
      if (!isNarration(block, index)) {
        return;
      }
      const phase: WorkPhase = { narration: { type: "text", text: block.text }, entries: [] };
      phases.push(phase);
      const previous = phases[phases.length - 2];
      if (previous) {
        let thinkingTail = 0;
        while (previous.entries[previous.entries.length - 1 - thinkingTail]?.type === "thinking") {
          thinkingTail += 1;
        }
        if (thinkingTail > 0) {
          phase.entries.push(...previous.entries.splice(previous.entries.length - thinkingTail, thinkingTail));
        }
        if (!previous.narration && previous.entries.length === 0) {
          phases.splice(phases.length - 2, 1);
        }
      }
      return;
    }
    if (phases.length === 0) {
      phases.push({ entries: [] });
    }
    phases[phases.length - 1]?.entries.push(block);
  });
  return phases;
}

const PHASE_GERUND_BY_ICON: Readonly<Partial<Record<WorkEntryIconName, string>>> = {
  edit: "editing",
  write: "writing",
  read: "reading",
  list: "reading",
  run: "running",
  search: "searching",
  find: "searching",
  "web-search": "searching the web",
  fetch: "fetching",
  trash: "trashing",
  ask: "asking",
  todos: "planning",
  plan: "planning",
  execute: "executing",
  github: "calling github",
  skill: "reading a skill",
};

const PHASE_COUNT_NOUN: Readonly<Record<string, string>> = {
  editing: "files",
  writing: "files",
  reading: "files",
  running: "commands",
  searching: "queries",
  fetching: "pages",
};

/**
 * Terse tool-derived label for a work phase ("editing theme.css", "running 2
 * commands"): the dominant activity's gerund plus its only target, or a count
 * when the phase touches several. Null when the phase has no tools.
 */
export function workPhaseSummary(entries: readonly WorkPhaseEntry[]): string | null {
  const tools = entries.filter((entry): entry is TranscriptToolBlock => entry.type === "tool");
  if (tools.length === 0) {
    return null;
  }
  const activities = tools.map((tool) => ({
    gerund: PHASE_GERUND_BY_ICON[toolWorkEntryIcon(tool.name, tool.kind)] ?? "working",
    target: phaseTargetText(tool),
  }));
  const counts = new Map<string, number>();
  for (const { gerund } of activities) {
    counts.set(gerund, (counts.get(gerund) ?? 0) + 1);
  }
  const gerund = activities.reduce((best, activity) =>
    (counts.get(activity.gerund) ?? 0) > (counts.get(best) ?? 0) ? activity.gerund : best, activities[0]?.gerund ?? "working");
  // Only file/command/search activities carry a target; the rest read clean
  // alone. Targets pool across the dominant activity's family (a write counts
  // toward an editing phase's files).
  const noun = PHASE_COUNT_NOUN[gerund];
  const targets = noun
    ? [
        ...new Set(
          activities
            .filter((activity) => PHASE_COUNT_NOUN[activity.gerund] === noun && activity.target)
            .map((activity) => activity.target),
        ),
      ]
    : [];
  if (targets.length === 1) {
    return `${gerund} ${targets[0]}`;
  }
  if (targets.length > 1 && noun) {
    return `${gerund} ${targets.length} ${noun}`;
  }
  return gerund;
}

function phaseTargetText(tool: TranscriptToolBlock): string | null {
  const target = describeToolInputTarget(tool.name, tool.inputPreview);
  if (!target) {
    return null;
  }
  const text = conciseChipText(target.label, target.value);
  if (!text) {
    return null;
  }
  return text.length > 32 ? `${text.slice(0, 31)}…` : text;
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
