// Unified-diff chrome adapted from refs/t3code FilePreviewPanel, DiffPanelShell,
// StyledDiffCodeView, RightPanelTabs, and index.css --code-background (MIT, T3 Tools Inc., 6bc6cb6).
// Pierre Diffs, review comments, split/before/after tabs, explorer, and extra rail
// surfaces (terminal, files, browser) are omitted. The persistent pill/rail lives
// in RightSidebar; this file is the changes surface only.
import { useMemo } from "react";
import { FileIcon } from "lucide-react";
import {
  CHANGE_REVIEW_COPY,
  type ChangeDiffHunk,
  type ChangeDiffPage,
  type ChangeKind,
  type ChangeReviewSetSnapshot,
  type FileChangeSummary,
  type ReviewStatus,
  type UndoPreview,
} from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { splitRelativePath } from "./lib/compact-path";
import {
  diffLineStat,
  diffPrefix,
  fileChangeVerb,
  serializeDiff,
  unifiedLineNumber,
  unmodifiedCountBeforeHunk,
  unmodifiedLabel,
} from "./lib/change-review-diff";
import { Button } from "./ui/button";
import { CopyButton } from "./copy-button";

export function ChangeReviewSheet({
  review,
  selectedPath,
  diff,
  loading = false,
  error = null,
  busy = false,
  onSelectPath,
  onApprove,
  onApproveAll,
  undoPreview = null,
  onPrepareUndo = () => undefined,
  onApplyUndo = () => undefined,
  onCancelUndo = () => undefined,
  onLoadMore,
}: {
  review: ChangeReviewSetSnapshot | null;
  selectedPath: string | null;
  diff: ChangeDiffPage | null;
  loading?: boolean;
  error?: string | null;
  busy?: boolean;
  onSelectPath: (relativePath: string) => void;
  onApprove: (relativePath: string) => void;
  onApproveAll: () => void;
  undoPreview?: UndoPreview | null;
  onPrepareUndo?: (relativePath: string) => void;
  onApplyUndo?: () => void;
  onCancelUndo?: () => void;
  onLoadMore?: () => void;
}) {
  const selected = review?.files.find((file) => file.relativePath === selectedPath);
  const pending = review?.files.filter((file) => file.status === "pending") ?? [];
  const groups = useMemo(() => groupFiles(review?.files ?? []), [review?.files]);
  const showFileList = (review?.files.length ?? 0) > 1;
  const copyText = serializeDiff(diff);

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-testid="change-review-sheet"
      aria-label={CHANGE_REVIEW_COPY.trackedOnly}
    >
      {CHANGE_REVIEW_COPY.alreadyApplied || CHANGE_REVIEW_COPY.notAllChanges ? (
        <div className="border-b border-border/60 px-3 py-1.5">
          {CHANGE_REVIEW_COPY.alreadyApplied ? (
            <p className="text-[11px] leading-snug text-muted-foreground">{CHANGE_REVIEW_COPY.alreadyApplied}</p>
          ) : null}
          {CHANGE_REVIEW_COPY.notAllChanges ? (
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/80">{CHANGE_REVIEW_COPY.notAllChanges}</p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="px-3 py-2 text-xs text-destructive" role="alert" data-testid="change-review-error">
          {error}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showFileList ? (
          <nav
            className="flex w-[12.5rem] shrink-0 flex-col overflow-y-auto border-e border-border/60 bg-sidebar/40 px-1.5 py-2"
            aria-label="Changed files"
          >
            {groups.created.length > 0 ? (
              <FileGroup heading="Created" files={groups.created} selectedPath={selectedPath} onSelectPath={onSelectPath} />
            ) : null}
            {groups.modified.length > 0 ? (
              <FileGroup heading="Modified" files={groups.modified} selectedPath={selectedPath} onSelectPath={onSelectPath} />
            ) : null}
          </nav>
        ) : null}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto" data-testid="change-review-content">
            {loading ? <p className="px-3 py-3 text-xs text-muted-foreground">Loading…</p> : null}
            {!loading && review && review.files.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">No tracked write/edit files in this run.</p>
            ) : null}
            {!loading && (!review || review.files.length > 0) ? (
              <UnifiedDiffView diff={diff} kind={selected?.kind ?? "modified"} copyText={copyText} />
            ) : null}
          </div>
          {selected ? (
            <footer className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-background px-2 py-1.5">
              <StatusBadge status={selected.status} testId="change-review-status" />
              {selected.limitation ? (
                <span className="text-[11px] text-muted-foreground">{limitationLabel(selected.limitation)}</span>
              ) : null}
              {diff?.lineEnding ? (
                <span className="text-[11px] tabular-nums text-muted-foreground">{diff.lineEnding.toUpperCase()}</span>
              ) : null}
              <div className="ms-auto flex gap-1.5">
                {selected.status === "pending" ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="change-review-undo"
                      disabled={busy || loading}
                      onClick={() => onPrepareUndo(selected.relativePath)}
                    >
                      Undo
                    </Button>
                    <Button
                      size="sm"
                      data-testid="change-review-approve"
                      disabled={busy || loading}
                      onClick={() => onApprove(selected.relativePath)}
                    >
                      Approve
                    </Button>
                  </>
                ) : null}
                {pending.length > 1 && !review?.filesTruncated ? (
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="change-review-approve-all"
                    disabled={busy || loading}
                    onClick={onApproveAll}
                  >
                    Approve all
                  </Button>
                ) : null}
              </div>
              {undoPreview?.relativePath === selected.relativePath ? (
                <div
                  className="w-full rounded-md border border-warning/40 bg-warning/5 px-2 py-2 text-xs"
                  role="alertdialog"
                  aria-label="Confirm safe Undo"
                  data-testid="change-review-undo-preview"
                >
                  <p>{undoPreview.effect}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Pho Code will recheck the current file before applying this action.
                  </p>
                  <div className="mt-2 flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={onCancelUndo}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="destructive" disabled={busy} data-testid="change-review-undo-confirm" onClick={onApplyUndo}>
                      {undoPreview.action === "move-to-trash" ? "Move to Trash" : "Restore"}
                    </Button>
                  </div>
                </div>
              ) : null}
              {review?.filesTruncated ? (
                <p className="w-full text-[11px] text-muted-foreground">
                  The file list is truncated. Approve visible files individually.
                </p>
              ) : null}
              {diff?.nextCursor && onLoadMore ? (
                <Button size="sm" variant="ghost" data-testid="change-review-more" onClick={onLoadMore}>
                  Load more
                </Button>
              ) : null}
            </footer>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function FileGroup({
  heading,
  files,
  selectedPath,
  onSelectPath,
}: {
  heading: string;
  files: readonly FileChangeSummary[];
  selectedPath: string | null;
  onSelectPath: (relativePath: string) => void;
}) {
  return (
    <div className="mb-2">
      <p className="px-1.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-icon-muted">{heading}</p>
      <ul className="flex flex-col gap-px">
        {files.map((file) => {
          const { directory, name } = splitRelativePath(file.relativePath);
          const selected = selectedPath === file.relativePath;
          return (
            <li key={file.relativePath}>
              <button
                type="button"
                className={cn(
                  "flex w-full min-w-0 items-start gap-1.5 rounded-lg px-1.5 py-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "bg-accent" : "hover:bg-accent/50",
                )}
                data-testid="change-review-file"
                data-path={file.relativePath}
                title={file.relativePath}
                onClick={() => onSelectPath(file.relativePath)}
              >
                <FileIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1">
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[10px] font-medium",
                        file.kind === "created" ? "text-success" : "text-warning",
                      )}
                      aria-hidden="true"
                    >
                      {file.kind === "created" ? "A" : "M"}
                    </span>
                    <span className="truncate text-xs font-medium">{name}</span>
                  </span>
                  {directory ? (
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">{directory}</span>
                  ) : null}
                </span>
                <StatusBadge status={file.status} compact />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function UnifiedDiffView({
  diff,
  kind,
  copyText,
}: {
  diff: ChangeDiffPage | null;
  kind: ChangeKind;
  copyText: string;
}) {
  if (!diff) {
    return <p className="px-3 py-3 text-xs text-muted-foreground">Select a file to inspect the unified diff.</p>;
  }
  if (diff.limitation) {
    return (
      <p className="px-3 py-3 text-xs text-muted-foreground" data-testid="change-review-limitation">
        {limitationLabel(diff.limitation)}
      </p>
    );
  }
  if (diff.hunks.length === 0) {
    return <p className="px-3 py-3 text-xs text-muted-foreground">No textual difference is available.</p>;
  }
  const stat = diffLineStat(diff.hunks);
  return (
    <div className="p-3">
      <article className="change-review-diff-card" data-testid="change-review-diff">
        <header className="change-review-diff-header">
          <p className="min-w-0 flex-1 truncate text-[12px] text-foreground">
            {fileChangeVerb(kind)}{" "}
            <code className="font-mono text-[12px]">{diff.relativePath}</code>
          </p>
          <span className="ms-auto flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums">
            <span className="text-success">+{stat.additions}</span>
            <span className="text-destructive">-{stat.deletions}</span>
          </span>
          {copyText ? <CopyButton text={copyText} label="Copy" copiedLabel="Copied" /> : null}
        </header>
        <div className="change-review-diff">
          {diff.hunks.map((hunk, index) => (
            <HunkView key={`${hunk.header}:${index}`} hunk={hunk} previous={index === 0 ? undefined : diff.hunks[index - 1]} />
          ))}
        </div>
        {diff.truncated ? <p className="px-3 py-2 text-xs text-muted-foreground">Diff truncated.</p> : null}
      </article>
    </div>
  );
}

function HunkView({ hunk, previous }: { hunk: ChangeDiffHunk; previous: ChangeDiffHunk | undefined }) {
  const skipped = unmodifiedCountBeforeHunk(hunk.header, previous);
  return (
    <div className="change-review-hunk">
      {skipped === null ? <div className="change-review-hunk-gap">{hunk.header}</div> : null}
      {skipped !== null && skipped > 0 ? (
        <div className="change-review-hunk-gap">
          <span className="change-review-hunk-pill">{unmodifiedLabel(skipped)}</span>
        </div>
      ) : null}
      {hunk.lines.map((line, lineIndex) => {
        const number = unifiedLineNumber(line);
        return (
          <div
            key={`${line.kind}:${line.beforeLine ?? ""}:${line.afterLine ?? ""}:${lineIndex}`}
            className="change-review-diff-line"
            data-kind={line.kind}
          >
            <span className="change-review-diff-gutter">{number ?? ""}</span>
            <span className="change-review-diff-marker">{diffPrefix(line.kind)}</span>
            <span className="change-review-diff-text">{line.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({
  status,
  compact = false,
  testId,
}: {
  status: ReviewStatus;
  compact?: boolean;
  testId?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full font-medium uppercase tracking-wide",
        compact ? "px-1.5 py-px text-[9px]" : "px-2 py-0.5 text-[10px]",
        statusTone(status),
      )}
      data-testid={testId}
    >
      {statusLabel(status)}
    </span>
  );
}

function groupFiles(files: readonly FileChangeSummary[]): { created: FileChangeSummary[]; modified: FileChangeSummary[] } {
  const created: FileChangeSummary[] = [];
  const modified: FileChangeSummary[] = [];
  for (const file of files) {
    if (file.kind === "created") {
      created.push(file);
    } else {
      modified.push(file);
    }
  }
  return { created, modified };
}

function statusLabel(status: ReviewStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "conflict":
      return "Conflict";
    case "unavailable":
      return "Unavailable";
    case "capturing":
      return "Capturing";
    case "indeterminate":
      return "Incomplete";
    case "undoing":
      return "Undoing";
    case "undone":
      return "Undone";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function statusTone(status: ReviewStatus): string {
  switch (status) {
    case "approved":
    case "undone":
      return "bg-success/15 text-success";
    case "conflict":
    case "indeterminate":
      return "bg-warning/15 text-warning";
    case "unavailable":
      return "bg-destructive/15 text-destructive";
    case "pending":
    case "capturing":
    case "undoing":
      return "bg-muted text-muted-foreground";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function limitationLabel(limitation: NonNullable<FileChangeSummary["limitation"]>): string {
  switch (limitation) {
    case "too-large":
      return "Too large to capture";
    case "binary":
      return "Binary or unsupported encoding";
    case "unsupported-kind":
      return "Unsupported file kind";
    case "outside-workspace":
      return "Outside the workspace";
    case "capture-failed":
      return "Recovery was not captured";
    case "sensitive":
      return "Sensitive path skipped";
    default: {
      const exhaustive: never = limitation;
      return exhaustive;
    }
  }
}

export function isWriteOrEditTool(name: string): boolean {
  return name === "write" || name === "edit";
}

export function firstSelectablePath(review: ChangeReviewSetSnapshot | null): string | null {
  return review?.files[0]?.relativePath ?? null;
}

export function changeKindLabel(kind: ChangeKind): string {
  return kind === "created" ? "Created" : "Modified";
}
