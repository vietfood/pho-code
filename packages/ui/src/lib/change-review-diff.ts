import type { ChangeDiffHunk, ChangeDiffLineKind, ChangeDiffPage, ChangeKind } from "@pho-code/protocol";
import type { TextRange } from "./change-review-word-diff";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export interface ParsedHunkHeader {
  beforeStart: number;
  beforeCount: number;
  afterStart: number;
  afterCount: number;
}

export function parseHunkHeader(header: string): ParsedHunkHeader | null {
  const match = HUNK_HEADER.exec(header);
  if (!match) {
    return null;
  }
  return {
    beforeStart: Number(match[1]),
    beforeCount: match[2] === undefined ? 1 : Number(match[2]),
    afterStart: Number(match[3]),
    afterCount: match[4] === undefined ? 1 : Number(match[4]),
  };
}

export function lastAfterLine(hunk: ChangeDiffHunk): number {
  let last = 0;
  for (const line of hunk.lines) {
    if (line.afterLine !== undefined) {
      last = line.afterLine;
    }
  }
  return last;
}

/** Count of omitted source lines before this hunk, or null when the header cannot be parsed. */
export function unmodifiedCountBeforeHunk(header: string, previous: ChangeDiffHunk | undefined): number | null {
  const parsed = parseHunkHeader(header);
  if (!parsed) {
    return null;
  }
  if (!previous) {
    return Math.max(0, parsed.afterStart - 1);
  }
  const previousEnd = lastAfterLine(previous);
  if (previousEnd === 0) {
    return Math.max(0, parsed.afterStart - 1);
  }
  return Math.max(0, parsed.afterStart - previousEnd - 1);
}

export function unmodifiedLabel(count: number): string {
  return count === 1 ? "1 unmodified line" : `${count} unmodified lines`;
}

export function diffLineStat(hunks: readonly ChangeDiffHunk[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      switch (line.kind) {
        case "added":
          additions += 1;
          break;
        case "removed":
          deletions += 1;
          break;
        case "context":
          break;
        default: {
          const exhaustive: never = line.kind;
          return exhaustive;
        }
      }
    }
  }
  return { additions, deletions };
}

export function diffPrefix(kind: ChangeDiffLineKind): string {
  switch (kind) {
    case "added":
      return "+";
    case "removed":
      return "-";
    case "context":
      return " ";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function serializeDiff(diff: ChangeDiffPage | null): string {
  if (!diff || diff.limitation || diff.hunks.length === 0) {
    return "";
  }
  return diff.hunks
    .map((hunk) => [hunk.header, ...hunk.lines.map((line) => `${diffPrefix(line.kind)}${line.text}`)].join("\n"))
    .join("\n");
}

export function fileChangeVerb(kind: ChangeKind): string {
  return kind === "created" ? "Created" : "Edited";
}

export function unifiedLineNumber(line: { beforeLine?: number; afterLine?: number }): number | undefined {
  return line.afterLine ?? line.beforeLine;
}

export function visibleWhitespace(text: string): string {
  return text.replaceAll(" ", "·").replaceAll("\t", "→");
}

export function splitSearchPieces(text: string, query: string): { text: string; hit: boolean }[] {
  const needle = query.trim();
  if (needle === "") {
    return [{ text, hit: false }];
  }
  const pieces: { text: string; hit: boolean }[] = [];
  const haystack = text;
  const lower = haystack.toLowerCase();
  const match = needle.toLowerCase();
  let from = 0;
  let index = lower.indexOf(match, from);
  while (index >= 0) {
    if (index > from) {
      pieces.push({ text: haystack.slice(from, index), hit: false });
    }
    pieces.push({ text: haystack.slice(index, index + needle.length), hit: true });
    from = index + needle.length;
    index = lower.indexOf(match, from);
  }
  if (from < haystack.length) {
    pieces.push({ text: haystack.slice(from), hit: false });
  }
  return pieces.length > 0 ? pieces : [{ text, hit: false }];
}

export interface LinePiece {
  text: string;
  color?: string;
  changed: boolean;
  hit: boolean;
}

/** Case-insensitive match ranges for the diff search box. */
export function searchRanges(text: string, query: string): TextRange[] {
  const needle = query.trim();
  if (needle === "") {
    return [];
  }
  const ranges: TextRange[] = [];
  const lower = text.toLowerCase();
  const match = needle.toLowerCase();
  let index = lower.indexOf(match);
  while (index >= 0) {
    ranges.push({ start: index, end: index + needle.length });
    index = lower.indexOf(match, index + needle.length);
  }
  return ranges;
}

/**
 * Flattens the three overlapping highlight layers — syntax colors, word-diff
 * ranges, and search hits — into one non-overlapping run of spans. Slicing once
 * against merged boundaries keeps the layers independent instead of nesting
 * them, which is what breaks when a search hit straddles two syntax tokens.
 */
export function buildLinePieces(
  text: string,
  tokens: readonly { content: string; color?: string }[] | null,
  changed: readonly TextRange[] | undefined,
  search: string,
): LinePiece[] {
  if (text === "") {
    return [];
  }
  const colored = colorRanges(text, tokens);
  const hits = searchRanges(text, search);
  const boundaries = new Set<number>([0, text.length]);
  for (const range of colored) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }
  for (const range of changed ?? []) {
    boundaries.add(clamp(range.start, text.length));
    boundaries.add(clamp(range.end, text.length));
  }
  for (const range of hits) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }
  const edges = [...boundaries].sort((left, right) => left - right);
  const pieces: LinePiece[] = [];
  for (let index = 0; index < edges.length - 1; index += 1) {
    const start = edges[index]!;
    const end = edges[index + 1]!;
    if (end <= start) {
      continue;
    }
    const piece: LinePiece = {
      text: text.slice(start, end),
      changed: covers(changed, start),
      hit: covers(hits, start),
    };
    const color = colored.find((range) => range.start <= start && range.end > start)?.color;
    if (color) {
      piece.color = color;
    }
    const previous = pieces.at(-1);
    if (previous && previous.color === piece.color && previous.changed === piece.changed && previous.hit === piece.hit) {
      previous.text += piece.text;
      continue;
    }
    pieces.push(piece);
  }
  return pieces;
}

function colorRanges(
  text: string,
  tokens: readonly { content: string; color?: string }[] | null,
): { start: number; end: number; color?: string }[] {
  if (!tokens || tokens.length === 0) {
    return [];
  }
  const ranges: { start: number; end: number; color?: string }[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const end = cursor + token.content.length;
    if (token.color) {
      ranges.push({ start: cursor, end, color: token.color });
    }
    cursor = end;
  }
  return cursor === text.length ? ranges : [];
}

function covers(ranges: readonly TextRange[] | undefined, offset: number): boolean {
  return (ranges ?? []).some((range) => range.start <= offset && range.end > offset);
}

function clamp(value: number, length: number): number {
  return Math.min(Math.max(value, 0), length);
}
