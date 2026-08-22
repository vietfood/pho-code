// Unified diff body shared by the docked review sheet and the floating changes
// window. Rows carry three highlight layers — syntax color, word-level change
// ranges, and search hits — flattened into one span run by buildLinePieces.
import { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon } from "lucide-react";
import type { ChangeDiffHunk, ChangeDiffPage } from "@pho-code/protocol";
import {
  buildLinePieces,
  diffPrefix,
  lastAfterLine,
  parseHunkHeader,
  unifiedLineNumber,
  unmodifiedCountBeforeHunk,
  unmodifiedLabel,
  visibleWhitespace,
  type LinePiece,
} from "./lib/change-review-diff";
import { hunkChangedRanges, type TextRange } from "./lib/change-review-word-diff";
import { preferredShikiTheme, tokenizeLines } from "./shiki-highlight";
import { useDocumentAppearance } from "./lib/use-resolved-appearance";

/** Lines revealed per click when a gap is larger than one step. */
export const GAP_EXPAND_STEP = 20;
/** Blocks longer than this stay plain; highlighting them is not worth the frame. */
const MAX_HIGHLIGHT_BLOCK_CHARS = 200_000;

export type LineTokens = readonly { content: string; color?: string }[];

export type RequestFileLines = (relativePath: string) => Promise<readonly string[] | null>;

export function DiffHunks({
  diff,
  search,
  showWhitespace,
  onRequestFileLines,
}: {
  diff: ChangeDiffPage;
  search: string;
  showWhitespace: boolean;
  onRequestFileLines?: RequestFileLines;
}) {
  return (
    <div className="change-review-diff">
      {diff.hunks.map((hunk, index) => (
        <HunkView
          key={`${hunk.header}:${index}`}
          hunk={hunk}
          previous={index === 0 ? undefined : diff.hunks[index - 1]}
          relativePath={diff.relativePath}
          language={diff.language}
          search={search}
          showWhitespace={showWhitespace}
          onRequestFileLines={onRequestFileLines}
        />
      ))}
    </div>
  );
}

function HunkView({
  hunk,
  previous,
  relativePath,
  language,
  search,
  showWhitespace,
  onRequestFileLines,
}: {
  hunk: ChangeDiffHunk;
  previous: ChangeDiffHunk | undefined;
  relativePath: string;
  language?: string;
  search: string;
  showWhitespace: boolean;
  onRequestFileLines?: RequestFileLines;
}) {
  const skipped = unmodifiedCountBeforeHunk(hunk.header, previous);
  const changed = useMemo(() => hunkChangedRanges(hunk), [hunk]);
  const tokens = useHunkTokens(hunk, language);
  const gapEnd = (parseHunkHeader(hunk.header)?.afterStart ?? 1) - 1;
  const gapStart = previous ? lastAfterLine(previous) + 1 : 1;

  return (
    <div className="change-review-hunk">
      {skipped === null ? <div className="change-review-hunk-gap">{hunk.header}</div> : null}
      {skipped !== null && skipped > 0 ? (
        <HunkGap
          count={skipped}
          start={gapStart}
          end={gapEnd}
          leading={!previous}
          relativePath={relativePath}
          language={language}
          search={search}
          showWhitespace={showWhitespace}
          onRequestFileLines={onRequestFileLines}
        />
      ) : null}
      {hunk.lines.map((line, lineIndex) => (
        <DiffRow
          key={`${line.kind}:${line.beforeLine ?? ""}:${line.afterLine ?? ""}:${lineIndex}`}
          kind={line.kind}
          number={unifiedLineNumber(line)}
          text={line.text}
          tokens={tokens?.get(lineIndex) ?? null}
          changed={changed[lineIndex]}
          search={search}
          showWhitespace={showWhitespace}
        />
      ))}
    </div>
  );
}

/** Collapsed run of unchanged lines; clicking reveals them from the near edge. */
function HunkGap({
  count,
  start,
  end,
  leading,
  relativePath,
  language,
  search,
  showWhitespace,
  onRequestFileLines,
}: {
  count: number;
  start: number;
  end: number;
  leading: boolean;
  relativePath: string;
  language?: string;
  search: string;
  showWhitespace: boolean;
  onRequestFileLines?: RequestFileLines;
}) {
  const [head, setHead] = useState(0);
  const [tail, setTail] = useState(0);
  const [lines, setLines] = useState<readonly string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const expandable = Boolean(onRequestFileLines) && !failed;
  const remaining = Math.max(0, count - head - tail);

  const reveal = () => {
    if (!onRequestFileLines || pending || remaining === 0) {
      return;
    }
    const step = Math.min(GAP_EXPAND_STEP, remaining);
    const grow = () => {
      if (leading) {
        setTail((current) => current + step);
        return;
      }
      setHead((current) => current + step);
    };
    if (lines) {
      grow();
      return;
    }
    setPending(true);
    void onRequestFileLines(relativePath)
      .then((next) => {
        if (!next) {
          setFailed(true);
          return;
        }
        setLines(next);
        grow();
      })
      .catch(() => setFailed(true))
      .finally(() => setPending(false));
  };

  const headLines = lines ? lines.slice(start - 1, start - 1 + head) : [];
  const tailLines = lines ? lines.slice(end - tail, end) : [];
  const Icon = leading ? ChevronUpIcon : count > GAP_EXPAND_STEP ? ChevronsUpDownIcon : ChevronDownIcon;

  return (
    <>
      <GapLines
        lines={headLines}
        firstNumber={start}
        language={language}
        search={search}
        showWhitespace={showWhitespace}
      />
      {remaining > 0 ? (
        <div className="change-review-hunk-gap" data-expandable={expandable ? "true" : undefined}>
          {expandable ? (
            <button
              type="button"
              className="change-review-hunk-pill change-review-hunk-expand"
              data-testid="change-review-expand-gap"
              aria-label={`Show ${Math.min(GAP_EXPAND_STEP, remaining)} more unmodified lines`}
              disabled={pending}
              onClick={reveal}
            >
              <Icon className="size-3" aria-hidden="true" />
              {unmodifiedLabel(remaining)}
            </button>
          ) : (
            <span className="change-review-hunk-pill">{unmodifiedLabel(remaining)}</span>
          )}
        </div>
      ) : null}
      <GapLines
        lines={tailLines}
        firstNumber={end - tail + 1}
        language={language}
        search={search}
        showWhitespace={showWhitespace}
      />
    </>
  );
}

function GapLines({
  lines,
  firstNumber,
  language,
  search,
  showWhitespace,
}: {
  lines: readonly string[];
  firstNumber: number;
  language?: string;
  search: string;
  showWhitespace: boolean;
}) {
  const text = lines.join("\n");
  const tokens = useBlockTokens(text, language);
  if (lines.length === 0) {
    return null;
  }
  return (
    <>
      {lines.map((line, index) => (
        <DiffRow
          key={`gap:${firstNumber + index}`}
          kind="context"
          number={firstNumber + index}
          text={line}
          tokens={tokens?.[index] ?? null}
          changed={undefined}
          search={search}
          showWhitespace={showWhitespace}
          revealed
        />
      ))}
    </>
  );
}

export function DiffRow({
  kind,
  number,
  text,
  tokens,
  changed,
  search,
  showWhitespace,
  revealed = false,
}: {
  kind: "added" | "removed" | "context";
  number: number | undefined;
  text: string;
  tokens: LineTokens | null;
  changed: readonly TextRange[] | undefined;
  search: string;
  showWhitespace: boolean;
  revealed?: boolean;
}) {
  const pieces = useMemo(
    () => buildLinePieces(text, tokens, changed, search),
    [text, tokens, changed, search],
  );
  return (
    <div
      className="change-review-diff-line"
      data-kind={kind}
      data-revealed={revealed ? "true" : undefined}
    >
      <span className="change-review-diff-gutter">{number ?? ""}</span>
      <span className="change-review-diff-marker">{diffPrefix(kind)}</span>
      <span className="change-review-diff-text">
        {pieces.length === 0 ? "" : pieces.map((piece, index) => (
          <PieceSpan key={`${index}:${piece.text.slice(0, 12)}`} piece={piece} showWhitespace={showWhitespace} />
        ))}
      </span>
    </div>
  );
}

function PieceSpan({ piece, showWhitespace }: { piece: LinePiece; showWhitespace: boolean }) {
  return (
    <span
      className={piece.hit ? "change-review-search-hit" : undefined}
      data-testid={piece.hit ? "change-review-search-hit" : undefined}
      data-changed={piece.changed ? "true" : undefined}
      style={piece.color ? { color: piece.color } : undefined}
    >
      {showWhitespace ? visibleWhitespace(piece.text) : piece.text}
    </span>
  );
}

/**
 * One highlighter call per hunk side instead of one per row. Context rows take
 * their colors from the after-side pass; removed rows from the before-side one,
 * so each side is tokenized in the state it actually existed in.
 */
function useHunkTokens(hunk: ChangeDiffHunk, language?: string): Map<number, LineTokens> | null {
  const sides = useMemo(() => {
    const before: number[] = [];
    const after: number[] = [];
    hunk.lines.forEach((line, index) => {
      if (line.kind !== "added") {
        before.push(index);
      }
      if (line.kind !== "removed") {
        after.push(index);
      }
    });
    return {
      before,
      after,
      beforeText: before.map((index) => hunk.lines[index]!.text).join("\n"),
      afterText: after.map((index) => hunk.lines[index]!.text).join("\n"),
    };
  }, [hunk]);

  const { appearance, palette } = useDocumentAppearance();
  const theme = preferredShikiTheme(appearance === "dark", palette);
  const [tokens, setTokens] = useState<Map<number, LineTokens> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!language || language === "text") {
      setTokens(null);
      return () => {
        cancelled = true;
      };
    }
    if (sides.beforeText.length + sides.afterText.length > MAX_HIGHLIGHT_BLOCK_CHARS) {
      setTokens(null);
      return () => {
        cancelled = true;
      };
    }
    void Promise.all([
      tokenizeLines(sides.beforeText, language, theme),
      tokenizeLines(sides.afterText, language, theme),
    ]).then(([before, after]) => {
      if (cancelled || (!before && !after)) {
        return;
      }
      const next = new Map<number, LineTokens>();
      before?.forEach((line, offset) => {
        const index = sides.before[offset];
        if (index !== undefined) {
          next.set(index, line);
        }
      });
      after?.forEach((line, offset) => {
        const index = sides.after[offset];
        if (index !== undefined) {
          next.set(index, line);
        }
      });
      setTokens(next);
    });
    return () => {
      cancelled = true;
    };
  }, [language, sides, theme]);

  return tokens;
}

function useBlockTokens(text: string, language?: string): LineTokens[] | null {
  const { appearance, palette } = useDocumentAppearance();
  const theme = preferredShikiTheme(appearance === "dark", palette);
  const [tokens, setTokens] = useState<LineTokens[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!language || language === "text" || text === "" || text.length > MAX_HIGHLIGHT_BLOCK_CHARS) {
      setTokens(null);
      return () => {
        cancelled = true;
      };
    }
    void tokenizeLines(text, language, theme).then((next) => {
      if (!cancelled) {
        setTokens(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [language, text, theme]);

  return tokens;
}
