// Word-level (intra-line) diff for the change-review unified view. Removed and
// added runs inside one hunk are paired, then compared token-by-token so only
// the bytes that actually moved carry the strong tint. Everything here is pure
// so the UI can compute it during render without a protocol round trip.
import type { ChangeDiffHunk, ChangeDiffLine } from "@pho-code/protocol";

export interface TextRange {
  start: number;
  end: number;
}

interface Token {
  text: string;
  start: number;
  end: number;
}

/** Runs longer than this are left as whole-line highlights; pairing them is guesswork. */
const MAX_PAIR_RUN = 24;
/** Upper bound on LCS table cells so a pathological line cannot stall a frame. */
const MAX_LCS_CELLS = 60_000;
/** Below this shared-character ratio the two lines are rewrites, not edits. */
const MIN_SIMILARITY = 0.4;
/** Cheap pre-pass threshold used to decide which lines belong together. */
const MIN_PAIR_SIMILARITY = 0.3;
/** Lines beyond this length skip word diffing entirely. */
const MAX_LINE_CHARS = 2_000;

const TOKEN_PATTERN = /[A-Za-z0-9_$]+|\s+|[^A-Za-z0-9_$\s]/g;

export function tokenizeWords(text: string): Token[] {
  const tokens: Token[] = [];
  TOKEN_PATTERN.lastIndex = 0;
  let match = TOKEN_PATTERN.exec(text);
  while (match) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    match = TOKEN_PATTERN.exec(text);
  }
  return tokens;
}

/**
 * Changed character ranges on both sides of a paired removed/added line, or
 * null when the lines are too dissimilar to be worth aligning.
 */
export function wordDiffRanges(before: string, after: string): { before: TextRange[]; after: TextRange[] } | null {
  if (before === after || before.length > MAX_LINE_CHARS || after.length > MAX_LINE_CHARS) {
    return null;
  }
  const beforeTokens = tokenizeWords(before);
  const afterTokens = tokenizeWords(after);
  if (beforeTokens.length === 0 || afterTokens.length === 0) {
    return null;
  }

  let head = 0;
  while (
    head < beforeTokens.length &&
    head < afterTokens.length &&
    beforeTokens[head]!.text === afterTokens[head]!.text
  ) {
    head += 1;
  }
  let tail = 0;
  while (
    tail < beforeTokens.length - head &&
    tail < afterTokens.length - head &&
    beforeTokens[beforeTokens.length - 1 - tail]!.text === afterTokens[afterTokens.length - 1 - tail]!.text
  ) {
    tail += 1;
  }

  const beforeMiddle = beforeTokens.slice(head, beforeTokens.length - tail);
  const afterMiddle = afterTokens.slice(head, afterTokens.length - tail);
  const matchedEdges = sumLength(beforeTokens.slice(0, head)) + sumLength(beforeTokens.slice(beforeTokens.length - tail));

  let beforeChanged: Token[];
  let afterChanged: Token[];
  let matchedMiddle = 0;
  if ((beforeMiddle.length + 1) * (afterMiddle.length + 1) > MAX_LCS_CELLS) {
    beforeChanged = beforeMiddle;
    afterChanged = afterMiddle;
  } else {
    const aligned = alignTokens(beforeMiddle, afterMiddle);
    beforeChanged = aligned.beforeChanged;
    afterChanged = aligned.afterChanged;
    matchedMiddle = aligned.matchedChars;
  }

  const matched = matchedEdges + matchedMiddle;
  const total = before.length + after.length;
  if (total === 0 || (matched * 2) / total < MIN_SIMILARITY) {
    return null;
  }
  const beforeRanges = mergeRanges(beforeChanged);
  const afterRanges = mergeRanges(afterChanged);
  if (beforeRanges.length === 0 && afterRanges.length === 0) {
    return null;
  }
  return { before: beforeRanges, after: afterRanges };
}

/** Changed ranges per line of a hunk, parallel to `hunk.lines`; undefined means highlight the whole row. */
export function hunkChangedRanges(hunk: ChangeDiffHunk): (readonly TextRange[] | undefined)[] {
  const result: (readonly TextRange[] | undefined)[] = new Array(hunk.lines.length).fill(undefined);
  let index = 0;
  while (index < hunk.lines.length) {
    if (hunk.lines[index]?.kind !== "removed") {
      index += 1;
      continue;
    }
    let removedEnd = index;
    while (hunk.lines[removedEnd]?.kind === "removed") {
      removedEnd += 1;
    }
    let addedEnd = removedEnd;
    while (hunk.lines[addedEnd]?.kind === "added") {
      addedEnd += 1;
    }
    const removed = indexRange(index, removedEnd);
    const added = indexRange(removedEnd, addedEnd);
    if (added.length > 0 && removed.length <= MAX_PAIR_RUN && added.length <= MAX_PAIR_RUN) {
      for (const [beforeIndex, afterIndex] of pairRuns(hunk.lines, removed, added)) {
        const ranges = wordDiffRanges(hunk.lines[beforeIndex]!.text, hunk.lines[afterIndex]!.text);
        if (ranges) {
          result[beforeIndex] = ranges.before;
          result[afterIndex] = ranges.after;
        }
      }
    }
    index = Math.max(addedEnd, removedEnd);
  }
  return result;
}

/** Monotonic pairing of a removed run against the added run that follows it. */
function pairRuns(
  lines: readonly ChangeDiffLine[],
  removed: readonly number[],
  added: readonly number[],
): [number, number][] {
  const pairs: [number, number][] = [];
  if (removed.length === added.length) {
    for (let offset = 0; offset < removed.length; offset += 1) {
      pairs.push([removed[offset]!, added[offset]!]);
    }
    return pairs;
  }
  let left = 0;
  let right = 0;
  while (left < removed.length && right < added.length) {
    const beforeText = lines[removed[left]!]!.text;
    const afterText = lines[added[right]!]!.text;
    if (quickSimilarity(beforeText, afterText) >= MIN_PAIR_SIMILARITY) {
      pairs.push([removed[left]!, added[right]!]);
      left += 1;
      right += 1;
      continue;
    }
    if (removed.length - left > added.length - right) {
      left += 1;
    } else {
      right += 1;
    }
  }
  return pairs;
}

/** Token-multiset overlap: cheap enough to run over every candidate pair. */
export function quickSimilarity(before: string, after: string): number {
  if (before === after) {
    return 1;
  }
  const counts = new Map<string, number>();
  for (const token of tokenizeWords(before)) {
    counts.set(token.text, (counts.get(token.text) ?? 0) + 1);
  }
  let shared = 0;
  for (const token of tokenizeWords(after)) {
    const remaining = counts.get(token.text) ?? 0;
    if (remaining > 0) {
      counts.set(token.text, remaining - 1);
      shared += token.text.length;
    }
  }
  const total = before.length + after.length;
  return total === 0 ? 0 : (shared * 2) / total;
}

function alignTokens(
  before: readonly Token[],
  after: readonly Token[],
): { beforeChanged: Token[]; afterChanged: Token[]; matchedChars: number } {
  const rows = before.length;
  const columns = after.length;
  const width = columns + 1;
  const table = new Int32Array((rows + 1) * width);
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      table[row * width + column] =
        before[row]!.text === after[column]!.text
          ? table[(row + 1) * width + column + 1]! + 1
          : Math.max(table[(row + 1) * width + column]!, table[row * width + column + 1]!);
    }
  }
  const beforeChanged: Token[] = [];
  const afterChanged: Token[] = [];
  let matchedChars = 0;
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (before[row]!.text === after[column]!.text) {
      matchedChars += before[row]!.text.length;
      row += 1;
      column += 1;
      continue;
    }
    if (table[(row + 1) * width + column]! >= table[row * width + column + 1]!) {
      beforeChanged.push(before[row]!);
      row += 1;
    } else {
      afterChanged.push(after[column]!);
      column += 1;
    }
  }
  for (; row < rows; row += 1) {
    beforeChanged.push(before[row]!);
  }
  for (; column < columns; column += 1) {
    afterChanged.push(after[column]!);
  }
  return { beforeChanged, afterChanged, matchedChars };
}

function mergeRanges(tokens: readonly Token[]): TextRange[] {
  const ranges: TextRange[] = [];
  for (const token of tokens) {
    const last = ranges.at(-1);
    if (last && last.end === token.start) {
      last.end = token.end;
      continue;
    }
    ranges.push({ start: token.start, end: token.end });
  }
  return ranges;
}

function indexRange(start: number, end: number): number[] {
  const values: number[] = [];
  for (let value = start; value < end; value += 1) {
    values.push(value);
  }
  return values;
}

function sumLength(tokens: readonly Token[]): number {
  let total = 0;
  for (const token of tokens) {
    total += token.text.length;
  }
  return total;
}
