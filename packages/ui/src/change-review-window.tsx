// Changes pane: stacked files filling the Changes tile.
import { useCallback, useEffect, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import {
  CHANGE_REVIEW_COPY,
  isUntrackedChangePath,
  type ChangeDiffPage,
  type ChangeReviewSetSnapshot,
  type FileChangeSummary,
  type UndoPreview,
} from "@pho-code/protocol";
import { splitRelativePath } from "./lib/compact-path";
import { diffLineStat, serializeDiff } from "./lib/change-review-diff";
import { DiffHunks, type RequestFileLines } from "./change-review-diff-view";
import { DiffToolbar, StatusBadge, limitationLabel } from "./change-review-sheet";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { CopyButton } from "./copy-button";

const AUTO_OPEN_FILES = 5;
const EMPTY_FILES: FileChangeSummary[] = [];

export function ChangeReviewTileTitle({ review }: { review: ChangeReviewSetSnapshot | null }) {
  const files = review?.files ?? EMPTY_FILES;
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 text-xs"
      data-testid="change-review-window-title"
    >
      <span className="truncate text-muted-foreground">working tree</span>
      <span className="change-window-arrow" aria-hidden="true">
        →
      </span>
      <span className="truncate font-medium">
        {files.length === 1 ? fileTitle(files[0]) : `${files.length} files`}
      </span>
    </span>
  );
}

export function ChangeReviewWindow({
  review,
  diffs,
  busy = false,
  error = null,
  undoPreview = null,
  contextLines,
  onEnsureDiff,
  onApprove,
  onApproveAll,
  onPrepareUndo,
  onApplyUndo,
  onCancelUndo,
  onRequestFileLines,
  onContextLinesChange,
}: {
  review: ChangeReviewSetSnapshot | null;
  diffs: Readonly<Record<string, ChangeDiffPage>>;
  busy?: boolean;
  error?: string | null;
  undoPreview?: UndoPreview | null;
  contextLines: number;
  onEnsureDiff: (relativePath: string) => void;
  onApprove: (relativePath: string) => void;
  onApproveAll: () => void;
  onPrepareUndo?: (relativePath: string) => void;
  onApplyUndo?: () => void;
  onCancelUndo?: () => void;
  onRequestFileLines?: RequestFileLines;
  onContextLinesChange?: (value: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const files = review?.files ?? EMPTY_FILES;
  const actionable = files.filter((file) => file.status === "pending" || file.status === "conflict");
  const isOpen = useCallback(
    (file: FileChangeSummary, index: number) => open[file.relativePath] ?? index < AUTO_OPEN_FILES,
    [open],
  );

  useEffect(() => {
    files.forEach((file, index) => {
      if (isOpen(file, index) && !diffs[file.relativePath]) {
        onEnsureDiff(file.relativePath);
      }
    });
  }, [diffs, files, isOpen, onEnsureDiff]);

  return (
    <section className="change-window" aria-label={CHANGE_REVIEW_COPY.trackedOnly} data-testid="change-review-window">
      <DiffToolbar
        search={search}
        onSearchChange={setSearch}
        showWhitespace={showWhitespace}
        onToggleWhitespace={() => setShowWhitespace((current) => !current)}
        contextLines={contextLines}
        onContextLinesChange={onContextLinesChange}
      />
      {review?.ledgerUnreadable ? (
        <Alert variant="warning" className="mx-3 my-2 w-auto text-xs" role="status" data-testid="change-review-unreadable">
          <TriangleAlertIcon />
          <AlertDescription className="text-xs">{CHANGE_REVIEW_COPY.ledgerUnreadable}</AlertDescription>
        </Alert>
      ) : null}
      {review?.captureCapped ? (
        <Alert variant="warning" className="mx-3 my-2 w-auto text-xs" role="status" data-testid="change-review-capped">
          <TriangleAlertIcon />
          <AlertDescription className="text-xs">{CHANGE_REVIEW_COPY.captureCapped}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive" className="mx-3 my-2 w-auto text-xs" role="alert" data-testid="change-review-error">
          <TriangleAlertIcon />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="change-window-body" data-testid="change-review-window-body">
        {files.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground" data-testid="change-review-empty">
            No tracked write/edit files to review yet.
          </p>
        ) : null}
        {files.map((file, index) => (
          <FileSection
            key={file.relativePath}
            file={file}
            diff={diffs[file.relativePath] ?? null}
            open={isOpen(file, index)}
            busy={busy}
            search={search}
            showWhitespace={showWhitespace}
            undoPreview={undoPreview?.relativePath === file.relativePath ? undoPreview : null}
            onToggle={() => {
              const next = !isOpen(file, index);
              setOpen((current) => ({ ...current, [file.relativePath]: next }));
              if (next) {
                onEnsureDiff(file.relativePath);
              }
            }}
            onApprove={() => onApprove(file.relativePath)}
            onPrepareUndo={onPrepareUndo ? () => onPrepareUndo(file.relativePath) : undefined}
            onApplyUndo={onApplyUndo}
            onCancelUndo={onCancelUndo}
            onRequestFileLines={onRequestFileLines}
          />
        ))}
      </div>
      <footer className="change-window-footer">
        <span className="text-[11px] text-muted-foreground" data-testid="change-review-window-count">
          {actionable.length} of {files.length} awaiting review
        </span>
        {actionable.length > 1 && !review?.filesTruncated ? (
          <Button size="sm" className="ms-auto" data-testid="change-review-approve-all" disabled={busy} onClick={onApproveAll}>
            Approve all
          </Button>
        ) : null}
      </footer>
    </section>
  );
}

function FileSection({
  file,
  diff,
  open,
  busy,
  search,
  showWhitespace,
  undoPreview,
  onToggle,
  onApprove,
  onPrepareUndo,
  onApplyUndo,
  onCancelUndo,
  onRequestFileLines,
}: {
  file: FileChangeSummary;
  diff: ChangeDiffPage | null;
  open: boolean;
  busy: boolean;
  search: string;
  showWhitespace: boolean;
  undoPreview: UndoPreview | null;
  onToggle: () => void;
  onApprove: () => void;
  onPrepareUndo?: () => void;
  onApplyUndo?: () => void;
  onCancelUndo?: () => void;
  onRequestFileLines?: RequestFileLines;
}) {
  const { directory, name } = splitRelativePath(file.relativePath);
  const stat = diff ? diffLineStat(diff.hunks) : null;
  const copyText = serializeDiff(diff);
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;

  return (
    <section className="change-window-file" data-testid="change-review-window-file" data-path={file.relativePath}>
      <header className="change-window-file-head">
        <button type="button" className="change-window-file-toggle" aria-expanded={open} onClick={onToggle} title={file.relativePath}>
          <Chevron className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate font-medium">
            {isUntrackedChangePath(file.relativePath) ? limitationLabel(file.limitation ?? "capture-failed") : name}
          </span>
          {directory ? <span className="truncate font-mono text-[10px] text-muted-foreground">{directory}</span> : null}
          {stat ? (
            <span className="ms-1 flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums">
              <span className="text-success">+{stat.additions}</span>
              <span className="text-destructive">−{stat.deletions}</span>
            </span>
          ) : null}
        </button>
        <span className="ms-auto flex shrink-0 items-center gap-1.5">
          <StatusBadge status={file.status} compact testId={open ? "change-review-status" : undefined} />
          {copyText ? <CopyButton text={copyText} label="Copy" copiedLabel="Copied" /> : null}
          {file.status === "pending" && onPrepareUndo ? (
            <Button size="sm" variant="outline" data-testid="change-review-undo" disabled={busy} onClick={onPrepareUndo}>
              Undo
            </Button>
          ) : null}
          {file.status === "pending" || file.status === "conflict" ? (
            <Button size="sm" data-testid="change-review-approve" disabled={busy} onClick={onApprove}>
              Approve
            </Button>
          ) : null}
        </span>
      </header>
      {open ? (
        <FileSectionBody
          diff={diff}
          file={file}
          search={search}
          showWhitespace={showWhitespace}
          onRequestFileLines={onRequestFileLines}
        />
      ) : null}
      {undoPreview ? (
        <div
          className="mx-2 mb-2 rounded-md border border-warning/40 bg-warning/5 px-2 py-2 text-xs"
          role="alertdialog"
          aria-label="Confirm safe Undo"
          data-testid="change-review-undo-preview"
        >
          <p>{undoPreview.effect}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Pho Code will recheck the current file before applying this action.</p>
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
    </section>
  );
}

function FileSectionBody({
  diff,
  file,
  search,
  showWhitespace,
  onRequestFileLines,
}: {
  diff: ChangeDiffPage | null;
  file: FileChangeSummary;
  search: string;
  showWhitespace: boolean;
  onRequestFileLines?: RequestFileLines;
}) {
  if (file.limitation) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground" data-testid="change-review-limitation">
        {limitationLabel(file.limitation)}
      </p>
    );
  }
  if (!diff) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>;
  }
  if (diff.limitation) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground" data-testid="change-review-limitation">
        {limitationLabel(diff.limitation)}
      </p>
    );
  }
  if (diff.hunks.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No textual difference is available.</p>;
  }
  return (
    <div data-testid="change-review-diff">
      <DiffHunks diff={diff} search={search} showWhitespace={showWhitespace} onRequestFileLines={onRequestFileLines} />
      {diff.truncated ? <p className="px-3 py-2 text-xs text-muted-foreground">Diff truncated.</p> : null}
    </div>
  );
}

function fileTitle(file: FileChangeSummary | undefined): string {
  if (!file) {
    return "Changes";
  }
  if (isUntrackedChangePath(file.relativePath)) {
    return limitationLabel(file.limitation ?? "capture-failed");
  }
  return splitRelativePath(file.relativePath).name;
}
