import { generateUnifiedPatch } from "@earendil-works/pi-coding-agent";
import {
  MAX_CHANGE_DIFF_CHARS,
  MAX_CHANGE_DIFF_HUNKS_PER_PAGE,
  MAX_CHANGE_DIFF_LINES_PER_PAGE,
  MAX_CHANGE_FILE_VIEW_CHARS,
  type ChangeDiffHunk,
  type ChangeDiffLine,
  type ChangeDiffLineKind,
  type ChangeDiffPage,
  type ChangeFileViewPage,
} from "@pho-code/protocol";
import { languageFromRelativePath, splitLines } from "./change-text";

export function pageFileText(
  relativePath: string,
  text: string,
  cursor: string | undefined,
): Pick<ChangeFileViewPage, "text" | "nextCursor" | "truncated" | "language"> {
  const start = parseLineCursor(cursor);
  const lines = splitLines(text);
  let used = 0;
  const out: string[] = [];
  let index = start.line;
  let nextChar: number | undefined;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const charStart = index === start.line ? start.char : 0;
    const remaining = line.slice(charStart);
    const separator = out.length === 0 ? 0 : 1;
    const room = MAX_CHANGE_FILE_VIEW_CHARS - used - separator;
    if (out.length > 0 && room <= 0) {
      break;
    }
    if (remaining.length > room) {
      if (out.length === 0 || room > 0) {
        if (room > 0) {
          out.push(remaining.slice(0, room));
          used += separator + room;
        }
        nextChar = charStart + Math.max(room, 0);
        break;
      }
      break;
    }
    out.push(remaining);
    used += separator + remaining.length;
    index += 1;
  }
  const truncated = index < lines.length || nextChar !== undefined;
  const page: Pick<ChangeFileViewPage, "text" | "nextCursor" | "truncated" | "language"> = {
    text: out.join("\n"),
    truncated,
    language: languageFromRelativePath(relativePath),
  };
  if (truncated) {
    page.nextCursor = nextChar !== undefined ? `line:${index}:char:${nextChar}` : `line:${index}`;
  }
  return page;
}

export function buildUnifiedDiffPage(input: {
  relativePath: string;
  beforeText: string;
  afterText: string;
  cursor?: string;
  contextLines?: number;
}): Pick<ChangeDiffPage, "hunks" | "nextCursor" | "truncated" | "language"> {
  const contextLines = clampContextLines(input.contextLines);
  const patch = generateUnifiedPatch(input.relativePath, input.beforeText, input.afterText, contextLines);
  const hunks = parseUnifiedDiff(patch);
  const start = parseHunkCursor(input.cursor);
  const pageHunks: ChangeDiffHunk[] = [];
  let chars = 0;
  let lines = 0;
  let index = start.hunk;
  let nextHunkLine: number | undefined;
  while (index < hunks.length && pageHunks.length < MAX_CHANGE_DIFF_HUNKS_PER_PAGE) {
    const hunk = hunks[index];
    if (!hunk) {
      break;
    }
    const lineStart = index === start.hunk ? start.line : 0;
    const sliced = sliceHunk(hunk, lineStart, MAX_CHANGE_DIFF_CHARS - chars, MAX_CHANGE_DIFF_LINES_PER_PAGE - lines);
    if (sliced.lines.length === 0) {
      if (pageHunks.length === 0 && lineStart < hunk.lines.length) {
        const first = hunk.lines[lineStart];
        if (first) {
          const take = Math.max(1, MAX_CHANGE_DIFF_CHARS - chars - hunk.header.length);
          pageHunks.push({
            header: hunk.header,
            lines: [{ ...first, text: first.text.slice(0, take) }],
          });
          chars += hunk.header.length + take + 1;
          lines += 1;
          nextHunkLine = lineStart + 1;
        }
      }
      break;
    }
    if (pageHunks.length > 0 && (chars + sliced.chars > MAX_CHANGE_DIFF_CHARS || lines + sliced.lines.length > MAX_CHANGE_DIFF_LINES_PER_PAGE)) {
      break;
    }
    pageHunks.push({ header: hunk.header, lines: sliced.lines });
    chars += sliced.chars;
    lines += sliced.lines.length;
    if (!sliced.complete) {
      nextHunkLine = sliced.nextLine;
      break;
    }
    index += 1;
  }
  const truncated = index < hunks.length || nextHunkLine !== undefined;
  const page: Pick<ChangeDiffPage, "hunks" | "nextCursor" | "truncated" | "language"> = {
    hunks: pageHunks,
    truncated,
    language: languageFromRelativePath(input.relativePath),
  };
  if (truncated) {
    page.nextCursor = nextHunkLine !== undefined ? `hunk:${index}:line:${nextHunkLine}` : `hunk:${index}`;
  }
  return page;
}

export function parseUnifiedDiff(patch: string): ChangeDiffHunk[] {
  const hunks: ChangeDiffHunk[] = [];
  let current: ChangeDiffHunk | undefined;
  let beforeLine = 0;
  let afterLine = 0;
  for (const raw of splitLines(patch)) {
    if (raw.startsWith("@@")) {
      const header = parseHunkHeader(raw);
      current = { header: raw, lines: [] };
      hunks.push(current);
      beforeLine = header.beforeStart;
      afterLine = header.afterStart;
      continue;
    }
    if (!current) {
      continue;
    }
    const kind = diffLineKind(raw);
    if (!kind) {
      continue;
    }
    const line: ChangeDiffLine = { kind, text: raw.slice(1) };
    if (kind === "context" || kind === "removed") {
      line.beforeLine = beforeLine;
      beforeLine += 1;
    }
    if (kind === "context" || kind === "added") {
      line.afterLine = afterLine;
      afterLine += 1;
    }
    current.lines.push(line);
  }
  return hunks;
}

function sliceHunk(
  hunk: ChangeDiffHunk,
  startLine: number,
  maxChars: number,
  maxLines: number,
): { lines: ChangeDiffLine[]; chars: number; nextLine: number; complete: boolean } {
  const lines: ChangeDiffLine[] = [];
  let chars = hunk.header.length;
  let index = Math.max(0, startLine);
  while (index < hunk.lines.length && lines.length < maxLines) {
    const line = hunk.lines[index];
    if (!line) {
      break;
    }
    const addition = line.text.length + 1;
    if (lines.length > 0 && chars + addition > maxChars) {
      break;
    }
    if (lines.length === 0 && chars + addition > maxChars) {
      break;
    }
    lines.push(line);
    chars += addition;
    index += 1;
  }
  return {
    lines,
    chars,
    nextLine: index,
    complete: index >= hunk.lines.length,
  };
}

function parseHunkHeader(header: string): { beforeStart: number; afterStart: number } {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(header);
  return {
    beforeStart: match ? Number(match[1]) : 1,
    afterStart: match ? Number(match[2]) : 1,
  };
}

function diffLineKind(line: string): ChangeDiffLineKind | undefined {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "added";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "removed";
  }
  if (line.startsWith(" ")) {
    return "context";
  }
  return undefined;
}

function parseLineCursor(cursor: string | undefined): { line: number; char: number } {
  if (!cursor) {
    return { line: 0, char: 0 };
  }
  const match = /^line:(\d+)(?::char:(\d+))?$/u.exec(cursor);
  if (!match) {
    return { line: 0, char: 0 };
  }
  return {
    line: Math.max(0, Number(match[1])),
    char: Math.max(0, Number(match[2] ?? 0)),
  };
}

function parseHunkCursor(cursor: string | undefined): { hunk: number; line: number } {
  if (!cursor) {
    return { hunk: 0, line: 0 };
  }
  const match = /^hunk:(\d+)(?::line:(\d+))?$/u.exec(cursor);
  if (!match) {
    return { hunk: 0, line: 0 };
  }
  return {
    hunk: Math.max(0, Number(match[1])),
    line: Math.max(0, Number(match[2] ?? 0)),
  };
}

function clampContextLines(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 3;
  }
  return Math.min(8, Math.max(0, Math.floor(value)));
}
