// Floating changes window: the same review data as the docked sheet, presented
// as a draggable, resizable pane that stacks every changed file in one scroll —
// the shape a reviewer wants when the sidebar is too narrow to read a diff in.
// Non-modal on purpose: chat stays usable while it is open.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, Minimize2Icon, Maximize2Icon, XIcon } from "lucide-react";
import {
  isUntrackedChangePath,
  type ChangeDiffPage,
  type ChangeReviewSetSnapshot,
  type FileChangeSummary,
} from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { splitRelativePath } from "./lib/compact-path";
import { diffLineStat, serializeDiff } from "./lib/change-review-diff";
import { DiffHunks, type RequestFileLines } from "./change-review-diff-view";
import { DiffToolbar, StatusBadge, limitationLabel } from "./change-review-sheet";
import {
  clampChangesWindowFrame,
  currentViewport,
  MIN_CHANGES_WINDOW_HEIGHT_PX,
  MIN_CHANGES_WINDOW_WIDTH_PX,
  readChangesWindowFrame,
  writeChangesWindowFrame,
  type WindowFrame,
} from "./lib/change-window-frame";
import { Button } from "./ui/button";
import { CopyButton } from "./copy-button";

/** Files opened automatically; past this the reviewer expands what they care about. */
const AUTO_OPEN_FILES = 5;

export function ChangeReviewWindow({
  review,
  diffs,
  busy = false,
  error = null,
  contextLines,
  onEnsureDiff,
  onRequestFileLines,
  onApprove,
  onApproveAll,
  onContextLinesChange,
  onClose,
}: {
  review: ChangeReviewSetSnapshot | null;
  diffs: Readonly<Record<string, ChangeDiffPage>>;
  busy?: boolean;
  error?: string | null;
  contextLines: number;
  onEnsureDiff: (relativePath: string) => void;
  onRequestFileLines?: RequestFileLines;
  onApprove: (relativePath: string) => void;
  onApproveAll: () => void;
  onContextLinesChange?: (value: number) => void;
  onClose: () => void;
}) {
  const [frame, setFrame] = useState<WindowFrame>(() => readChangesWindowFrame(currentViewport()));
  const [maximized, setMaximized] = useState(false);
  const [search, setSearch] = useState("");
  const [showWhitespace, setShowWhitespace] = useState(false);
  const files = useMemo(() => review?.files ?? [], [review?.files]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ pointerId: number; startX: number; startY: number; width: number; height: number } | null>(null);

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onClose();
    };
    // Capture phase so the right sidebar's Escape handler sees defaultPrevented.
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  useEffect(() => {
    const onResize = () => {
      setFrame((current) => clampChangesWindowFrame(current, currentViewport()));
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const commitFrame = useCallback((next: WindowFrame) => {
    const viewport = currentViewport();
    const clamped = clampChangesWindowFrame(next, viewport);
    setFrame(clamped);
    writeChangesWindowFrame(clamped, viewport);
  }, []);

  const onTitlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (maximized || event.button !== 0 || (event.target as HTMLElement).closest("button")) {
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
        currentViewport(),
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
        currentViewport(),
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
    <section
      className={cn("change-window", maximized && "change-window-maximized")}
      style={style}
      role="dialog"
      aria-label="Changes"
      data-testid="change-review-window"
    >
      <header
        className="change-window-title"
        data-testid="change-review-window-title"
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate font-medium">{workspaceLabel(review)}</span>
        <span className="change-window-arrow" aria-hidden="true">
          →
        </span>
        <span className="truncate text-muted-foreground">working tree</span>
        <span className="ms-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="change-review-icon-button"
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
        </span>
      </header>
      <DiffToolbar
        search={search}
        onSearchChange={setSearch}
        showWhitespace={showWhitespace}
        onToggleWhitespace={() => setShowWhitespace((current) => !current)}
        contextLines={contextLines}
        onContextLinesChange={onContextLinesChange}
      />
      {error ? (
        <p className="px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </p>
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
            onToggle={() => {
              const next = !isOpen(file, index);
              setOpen((current) => ({ ...current, [file.relativePath]: next }));
              if (next) {
                onEnsureDiff(file.relativePath);
              }
            }}
            onApprove={() => onApprove(file.relativePath)}
            onRequestFileLines={onRequestFileLines}
          />
        ))}
      </div>
      <footer className="change-window-footer">
        <span className="text-[11px] text-muted-foreground" data-testid="change-review-window-count">
          {actionable.length} of {files.length} awaiting review
        </span>
        {actionable.length > 1 && !review?.filesTruncated ? (
          <Button
            size="sm"
            className="ms-auto"
            data-testid="change-review-window-approve-all"
            disabled={busy}
            onClick={onApproveAll}
          >
            Approve all
          </Button>
        ) : null}
      </footer>
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
  onToggle,
  onApprove,
  onRequestFileLines,
}: {
  file: FileChangeSummary;
  diff: ChangeDiffPage | null;
  open: boolean;
  busy: boolean;
  search: string;
  showWhitespace: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onRequestFileLines?: RequestFileLines;
}) {
  const { directory, name } = splitRelativePath(file.relativePath);
  const stat = diff ? diffLineStat(diff.hunks) : null;
  const copyText = serializeDiff(diff);
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;

  return (
    <section className="change-window-file" data-testid="change-review-window-file" data-path={file.relativePath}>
      <header className="change-window-file-head">
        <button
          type="button"
          className="change-window-file-toggle"
          aria-expanded={open}
          onClick={onToggle}
          title={file.relativePath}
        >
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
          <StatusBadge status={file.status} compact />
          {copyText ? <CopyButton text={copyText} label="Copy" copiedLabel="Copied" /> : null}
          {file.status === "pending" || file.status === "conflict" ? (
            <Button
              size="sm"
              variant="outline"
              data-testid="change-review-window-approve"
              disabled={busy}
              onClick={onApprove}
            >
              Approve
            </Button>
          ) : null}
        </span>
      </header>
      {open ? <FileSectionBody diff={diff} file={file} search={search} showWhitespace={showWhitespace} onRequestFileLines={onRequestFileLines} /> : null}
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
    return <p className="px-3 py-2 text-xs text-muted-foreground">{limitationLabel(file.limitation)}</p>;
  }
  if (!diff) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>;
  }
  if (diff.limitation) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">{limitationLabel(diff.limitation)}</p>;
  }
  if (diff.hunks.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No textual difference is available.</p>;
  }
  return (
    <>
      <DiffHunks diff={diff} search={search} showWhitespace={showWhitespace} onRequestFileLines={onRequestFileLines} />
      {diff.truncated ? <p className="px-3 py-2 text-xs text-muted-foreground">Diff truncated.</p> : null}
    </>
  );
}

function workspaceLabel(review: ChangeReviewSetSnapshot | null): string {
  const id = review?.workspaceId ?? "";
  const parts = id.split("/").filter((part) => part !== "");
  return parts.at(-1) ?? "Workspace";
}
