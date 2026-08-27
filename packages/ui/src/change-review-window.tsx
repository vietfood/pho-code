// Changes pane: stacked files in the right sidebar, with an optional expanded overlay.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  EllipsisIcon,
  Maximize2Icon,
  Minimize2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import {
  CHANGE_REVIEW_COPY,
  isUntrackedChangePath,
  type ChangeDiffPage,
  type ChangeReviewSetSnapshot,
  type FileChangeSummary,
  type UndoPreview,
} from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { splitRelativePath } from "./lib/compact-path";
import { diffLineStat, serializeDiff } from "./lib/change-review-diff";
import { DiffHunks, type RequestFileLines } from "./change-review-diff-view";
import { DiffToolbar, StatusBadge, limitationLabel } from "./change-review-sheet";
import {
  clampChangesWindowFrame,
  elementViewport,
  MIN_CHANGES_WINDOW_HEIGHT_PX,
  MIN_CHANGES_WINDOW_WIDTH_PX,
  readChangesWindowFrame,
  writeChangesWindowFrame,
  type WindowFrame,
} from "./lib/change-window-frame";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { CopyButton } from "./copy-button";

const AUTO_OPEN_FILES = 5;

export function ChangeReviewWindow({
  variant = "sidebar",
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
  onExpand,
  onClose,
}: {
  variant?: "sidebar" | "overlay";
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
  onExpand?: () => void;
  onClose?: () => void;
}) {
  const overlay = variant === "overlay";
  const [search, setSearch] = useState("");
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(!overlay);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const files = review?.files ?? [];
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

  const pane = (
    <StackedPane
      overlay={overlay}
      review={review}
      files={files}
      diffs={diffs}
      actionableCount={actionable.length}
      busy={busy}
      error={error}
      search={search}
      showWhitespace={showWhitespace}
      toolsOpen={toolsOpen}
      contextLines={contextLines}
      undoPreview={undoPreview}
      isOpen={isOpen}
      onSearchChange={setSearch}
      onToggleWhitespace={() => setShowWhitespace((current) => !current)}
      onContextLinesChange={onContextLinesChange}
      onToggleFile={(file, index) => {
        const next = !isOpen(file, index);
        setOpen((current) => ({ ...current, [file.relativePath]: next }));
        if (next) {
          onEnsureDiff(file.relativePath);
        }
      }}
      onApprove={onApprove}
      onApproveAll={onApproveAll}
      onPrepareUndo={onPrepareUndo}
      onApplyUndo={onApplyUndo}
      onCancelUndo={onCancelUndo}
      onRequestFileLines={onRequestFileLines}
      trailing={
        <HeaderActions
          overlay={overlay}
          toolsOpen={toolsOpen}
          onToggleTools={() => setToolsOpen((current) => !current)}
          onExpand={onExpand}
          onClose={onClose}
        />
      }
    />
  );

  if (!overlay) {
    return pane;
  }
  return <OverlayShell onClose={onClose}>{pane}</OverlayShell>;
}

function StackedPane({
  overlay,
  review,
  files,
  diffs,
  actionableCount,
  busy,
  error,
  search,
  showWhitespace,
  toolsOpen,
  contextLines,
  undoPreview,
  isOpen,
  onSearchChange,
  onToggleWhitespace,
  onContextLinesChange,
  onToggleFile,
  onApprove,
  onApproveAll,
  onPrepareUndo,
  onApplyUndo,
  onCancelUndo,
  onRequestFileLines,
  trailing,
}: {
  overlay: boolean;
  review: ChangeReviewSetSnapshot | null;
  files: readonly FileChangeSummary[];
  diffs: Readonly<Record<string, ChangeDiffPage>>;
  actionableCount: number;
  busy: boolean;
  error: string | null;
  search: string;
  showWhitespace: boolean;
  toolsOpen: boolean;
  contextLines: number;
  undoPreview: UndoPreview | null;
  isOpen: (file: FileChangeSummary, index: number) => boolean;
  onSearchChange: (value: string) => void;
  onToggleWhitespace: () => void;
  onContextLinesChange?: (value: number) => void;
  onToggleFile: (file: FileChangeSummary, index: number) => void;
  onApprove: (relativePath: string) => void;
  onApproveAll: () => void;
  onPrepareUndo?: (relativePath: string) => void;
  onApplyUndo?: () => void;
  onCancelUndo?: () => void;
  onRequestFileLines?: RequestFileLines;
  trailing: ReactNode;
}) {
  return (
    <section
      className={cn("change-window", !overlay && "change-window-sidebar")}
      aria-label={CHANGE_REVIEW_COPY.trackedOnly}
      data-testid="change-review-window"
    >
      <header className="change-window-title" data-testid="change-review-window-title">
        <span className="truncate text-muted-foreground">working tree</span>
        <span className="change-window-arrow" aria-hidden="true">
          →
        </span>
        <span className="truncate font-medium">
          {files.length === 1 ? fileTitle(files[0]) : `${files.length} files`}
        </span>
        {trailing}
      </header>
      {toolsOpen ? (
        <DiffToolbar
          search={search}
          onSearchChange={onSearchChange}
          showWhitespace={showWhitespace}
          onToggleWhitespace={onToggleWhitespace}
          contextLines={contextLines}
          onContextLinesChange={onContextLinesChange}
        />
      ) : null}
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
          <p className="px-3 py-3 text-xs text-muted-foreground">No tracked write/edit files to review yet.</p>
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
            onToggle={() => onToggleFile(file, index)}
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
          {actionableCount} of {files.length} awaiting review
        </span>
        {actionableCount > 1 && !review?.filesTruncated ? (
          <Button size="sm" className="ms-auto" data-testid="change-review-approve-all" disabled={busy} onClick={onApproveAll}>
            Approve all
          </Button>
        ) : null}
      </footer>
    </section>
  );
}

function HeaderActions({
  overlay,
  toolsOpen,
  onToggleTools,
  onExpand,
  onClose,
}: {
  overlay: boolean;
  toolsOpen: boolean;
  onToggleTools: () => void;
  onExpand?: () => void;
  onClose?: () => void;
}) {
  return (
    <span className="ms-auto flex shrink-0 items-center gap-0.5">
      {overlay ? (
        <button
          type="button"
          className="change-review-icon-button"
          data-testid="change-review-window-tools"
          aria-pressed={toolsOpen}
          aria-label={toolsOpen ? "Hide diff tools" : "Show diff tools"}
          title="Search and context"
          onClick={onToggleTools}
        >
          <EllipsisIcon className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
      {onExpand && !overlay ? (
        <button
          type="button"
          className="change-review-icon-button"
          data-testid="change-review-expand-window"
          aria-label="Open changes in a window"
          title="Expand"
          onClick={onExpand}
        >
          <Maximize2Icon className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
      {onClose ? (
        <button
          type="button"
          className="change-review-icon-button"
          data-testid="change-review-window-close"
          aria-label="Close changes window"
          title="Close"
          onClick={onClose}
        >
          <XIcon className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

function OverlayShell({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<WindowFrame>(() => readChangesWindowFrame(elementViewport(null)));
  const [maximized, setMaximized] = useState(false);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ pointerId: number; startX: number; startY: number; width: number; height: number } | null>(
    null,
  );
  const hostViewport = useCallback(() => elementViewport(hostRef.current), []);

  useEffect(() => {
    setFrame(readChangesWindowFrame(hostViewport()));
  }, [hostViewport]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onClose?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const apply = () => setFrame((current) => clampChangesWindowFrame(current, hostViewport()));
    const observer = new ResizeObserver(apply);
    observer.observe(host);
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [hostViewport]);

  const commitFrame = useCallback(
    (next: WindowFrame) => {
      const viewport = hostViewport();
      const clamped = clampChangesWindowFrame(next, viewport);
      setFrame(clamped);
      writeChangesWindowFrame(clamped, viewport);
    },
    [hostViewport],
  );

  const onTitlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (maximized || event.button !== 0 || (event.target as HTMLElement).closest("button")) {
      return;
    }
    const title = (event.target as HTMLElement).closest(".change-window-title");
    if (!title) {
      return;
    }
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - frame.x, offsetY: event.clientY - frame.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onTitlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setFrame((current) =>
      clampChangesWindowFrame(
        { ...current, x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY },
        hostViewport(),
      ),
    );
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    commitFrame(frame);
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (maximized || event.button !== 0) {
      return;
    }
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: frame.width,
      height: frame.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }
    setFrame((current) =>
      clampChangesWindowFrame(
        {
          ...current,
          width: Math.max(MIN_CHANGES_WINDOW_WIDTH_PX, resize.width + (event.clientX - resize.startX)),
          height: Math.max(MIN_CHANGES_WINDOW_HEIGHT_PX, resize.height + (event.clientY - resize.startY)),
        },
        hostViewport(),
      ),
    );
  };

  const endResize = (event: ReactPointerEvent<HTMLElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) {
      return;
    }
    resizeRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    commitFrame(frame);
  };

  const style = maximized
    ? undefined
    : { left: `${frame.x}px`, top: `${frame.y}px`, width: `${frame.width}px`, height: `${frame.height}px` };

  return (
    <div ref={hostRef} className="change-window-host" data-testid="change-review-window-host">
      <div
        className={cn("change-window-overlay", maximized && "change-window-maximized")}
        style={style}
        role="dialog"
        aria-label={CHANGE_REVIEW_COPY.trackedOnly}
        data-variant="overlay"
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {children}
        <button
          type="button"
          className="change-review-icon-button change-window-overlay-max"
          data-testid="change-review-window-maximize"
          aria-pressed={maximized}
          aria-label={maximized ? "Restore window" : "Maximize window"}
          title={maximized ? "Restore" : "Maximize"}
          onClick={() => setMaximized((current) => !current)}
        >
          {maximized ? (
            <Minimize2Icon className="size-3.5" aria-hidden="true" />
          ) : (
            <Maximize2Icon className="size-3.5" aria-hidden="true" />
          )}
        </button>
        {maximized ? null : (
          <div
            className="change-window-resize"
            data-testid="change-review-window-resize"
            role="separator"
            aria-label="Resize changes window"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
        )}
      </div>
    </div>
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
