import { generateUnifiedPatch } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_CHANGE_CONTEXT_LINES,
  HARNESS_ERROR_CODES,
  MAX_CHANGE_CONTEXT_LINES,
  MAX_CHANGE_DIFF_CHARS,
  MAX_CHANGE_DIFF_HUNKS_PER_PAGE,
  MAX_CHANGE_DIFF_INPUT_LINES,
  MAX_CHANGE_DIFF_LINES_PER_PAGE,
  MAX_CHANGE_DIFF_PATCH_CHARS,
  MAX_CHANGE_FILE_VIEW_CHARS,
  createHarnessError,
  formatChangeDiffCursor,
  formatChangeFileViewCursor,
  parseChangeDiffCursor,
  parseChangeFileViewCursor,
  type ChangeDiffCursor,
  type ChangeDiffHunk,
  type ChangeDiffLine,
  type ChangeDiffLineKind,
  type ChangeDiffPage,
  type ChangeFileViewCursor,
  type ChangeFileViewPage,
  type ChangeLimitation,
} from "@pho-code/protocol";
import { languageFromRelativePath, splitLines } from "./change-text";

export function pageFileText(
  relativePath: string,
  text: string,
  cursor: string | undefined,
  operation = "getChangeFileView",
): Pick<ChangeFileViewPage, "text" | "nextCursor" | "truncated" | "language"> {
  const start = parseChangeFileViewCursor(cursor, operation);
  const lines = splitLines(text);
  assertFileViewCursorInRange(start, lines, operation);
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
    page.nextCursor = formatChangeFileViewCursor(
      nextChar !== undefined ? { line: index, char: nextChar } : { line: index, char: 0 },
    );
  }
  return page;
}

export function buildUnifiedDiffPage(input: {
  relativePath: string;
  beforeText: string;
  afterText: string;
  cursor?: string;
  contextLines?: number;
  operation?: string;
}): Pick<ChangeDiffPage, "hunks" | "nextCursor" | "truncated" | "language" | "limitation"> {
  const operation = input.operation ?? "getChangeDiff";
  const complexity = diffComplexityLimitation(input.beforeText, input.afterText);
  if (complexity) {
    return {
      hunks: [],
      truncated: false,
      language: languageFromRelativePath(input.relativePath),
      limitation: complexity,
    };
  }
  const contextLines = clampContextLines(input.contextLines);
  const patch = generateUnifiedPatch(input.relativePath, input.beforeText, input.afterText, contextLines);
  if (patch.length > MAX_CHANGE_DIFF_PATCH_CHARS) {
    return {
      hunks: [],
      truncated: false,
      language: languageFromRelativePath(input.relativePath),
      limitation: "too-complex",
    };
  }
  const hunks = parseUnifiedDiff(patch);
  const start = parseChangeDiffCursor(input.cursor, operation);
  assertDiffCursorInRange(start, hunks, operation);
  const pageHunks: ChangeDiffHunk[] = [];
  let chars = 0;
  let lines = 0;
  let index = start.hunk;
  let nextHunkLine: number | undefined;
  let nextHunkChar: number | undefined;
  while (index < hunks.length && pageHunks.length < MAX_CHANGE_DIFF_HUNKS_PER_PAGE) {
    const hunk = hunks[index];
    if (!hunk) {
      break;
    }
    const lineStart = index === start.hunk ? start.line : 0;
    const charStart = index === start.hunk ? start.char : 0;
    const sliced = sliceHunk(
      hunk,
      lineStart,
      charStart,
      MAX_CHANGE_DIFF_CHARS - chars,
      MAX_CHANGE_DIFF_LINES_PER_PAGE - lines,
    );
    if (sliced.lines.length === 0) {
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
      nextHunkChar = sliced.nextChar;
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
    page.nextCursor = formatChangeDiffCursor({
      hunk: index,
      line: nextHunkLine ?? 0,
      char: nextHunkChar ?? 0,
    });
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

function diffComplexityLimitation(beforeText: string, afterText: string): Extract<ChangeLimitation, "too-complex"> | undefined {
  if (countLines(beforeText) > MAX_CHANGE_DIFF_INPUT_LINES || countLines(afterText) > MAX_CHANGE_DIFF_INPUT_LINES) {
    return "too-complex";
  }
  return undefined;
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return splitLines(text).length;
}

function sliceHunk(
  hunk: ChangeDiffHunk,
  startLine: number,
  startChar: number,
  maxChars: number,
  maxLines: number,
): { lines: ChangeDiffLine[]; chars: number; nextLine: number; nextChar?: number; complete: boolean } {
  const lines: ChangeDiffLine[] = [];
  let chars = hunk.header.length;
  let index = Math.max(0, startLine);
  let first = true;
  while (index < hunk.lines.length && lines.length < maxLines) {
    const line = hunk.lines[index];
    if (!line) {
      break;
    }
    const charStart = first ? Math.max(0, startChar) : 0;
    const remaining = line.text.slice(charStart);
    const addition = remaining.length + 1;
    if (lines.length > 0 && chars + addition > maxChars) {
      break;
    }
    if (chars + addition > maxChars) {
      const room = Math.max(0, maxChars - chars - 1);
      if (room <= 0 && lines.length > 0) {
        break;
      }
      const take = Math.max(1, room);
      lines.push({ ...line, text: remaining.slice(0, take) });
      chars += take + 1;
      return {
        lines,
        chars,
        nextLine: index,
        nextChar: charStart + take,
        complete: false,
      };
    }
    lines.push(charStart > 0 ? { ...line, text: remaining } : line);
    chars += addition;
    index += 1;
    first = false;
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

function clampContextLines(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CHANGE_CONTEXT_LINES;
  }
  return Math.min(MAX_CHANGE_CONTEXT_LINES, Math.max(0, Math.floor(value)));
}

function assertFileViewCursorInRange(cursor: ChangeFileViewCursor, lines: readonly string[], operation: string): void {
  if (cursor.line > lines.length) {
    throw invalidCursor(operation);
  }
  if (cursor.line === lines.length) {
    if (cursor.line === 0 && cursor.char === 0) {
      return;
    }
    throw invalidCursor(operation);
  }
  const line = lines[cursor.line] ?? "";
  if (cursor.char > line.length) {
    throw invalidCursor(operation);
  }
}

function assertDiffCursorInRange(cursor: ChangeDiffCursor, hunks: readonly ChangeDiffHunk[], operation: string): void {
  if (cursor.hunk > hunks.length) {
    throw invalidCursor(operation);
  }
  if (cursor.hunk === hunks.length) {
    if (cursor.hunk === 0 && cursor.line === 0 && cursor.char === 0) {
      return;
    }
    throw invalidCursor(operation);
  }
  const hunk = hunks[cursor.hunk];
  if (!hunk) {
    throw invalidCursor(operation);
  }
  if (cursor.line > hunk.lines.length) {
    throw invalidCursor(operation);
  }
  if (cursor.line === hunk.lines.length) {
    throw invalidCursor(operation);
  }
  const line = hunk.lines[cursor.line];
  if (cursor.char > (line?.text.length ?? 0)) {
    throw invalidCursor(operation);
  }
}

function invalidCursor(operation: string): never {
  throw createHarnessError({
    code: HARNESS_ERROR_CODES.invalidCommand,
    message: "That review cursor is invalid.",
    operation,
    recoverable: true,
  });
}
