import type { ChangeDiffHunk, ChangeDiffLineKind, ChangeDiffPage, ChangeKind } from "@pho-code/protocol";

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
