// Unified-diff chrome adapted from refs/t3code FilePreviewPanel, DiffPanelShell,
// StyledDiffCodeView, RightPanelTabs, and index.css --code-background (MIT, T3 Tools Inc., 6bc6cb6).
// Shared toolbar and status chrome for the changes surface; the panel itself lives in
// change-review-window.tsx.
import {
  DEFAULT_CHANGE_CONTEXT_LINES,
  MAX_CHANGE_CONTEXT_LINES,
  type ChangeReviewSetSnapshot,
  type FileChangeSummary,
  type ReviewStatus,
} from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { Button } from "./ui/button";


export function DiffToolbar({
  search,
  onSearchChange,
  showWhitespace,
  onToggleWhitespace,
  contextLines,
  onContextLinesChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  showWhitespace: boolean;
  onToggleWhitespace: () => void;
  contextLines: number;
  onContextLinesChange?: (value: number) => void;
}) {
  return (
    <div className="change-review-toolbar">
      <label className="change-review-search">
        <span className="sr-only">Search diff</span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search"
          data-testid="change-review-search"
          className="change-review-search-input"
        />
      </label>
      <Button
        size="sm"
        variant={showWhitespace ? "default" : "outline"}
        data-testid="change-review-whitespace"
        aria-pressed={showWhitespace}
        onClick={onToggleWhitespace}
      >
        Whitespace
      </Button>
      <label className="change-review-context">
        <span className="text-[11px] text-muted-foreground">Context</span>
        <select
          data-testid="change-review-context"
          value={contextLines}
          onChange={(event) => onContextLinesChange?.(Number(event.target.value))}
          disabled={!onContextLinesChange}
          className="change-review-context-select"
        >
          <option value={0}>0</option>
          <option value={DEFAULT_CHANGE_CONTEXT_LINES}>{DEFAULT_CHANGE_CONTEXT_LINES}</option>
          <option value={MAX_CHANGE_CONTEXT_LINES}>{MAX_CHANGE_CONTEXT_LINES}</option>
        </select>
      </label>
    </div>
  );
}

export function StatusBadge({
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

const STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  conflict: "Conflict",
  unavailable: "Unavailable",
  capturing: "Capturing",
  indeterminate: "Incomplete",
  undoing: "Undoing",
  undone: "Undone",
};

const STATUS_TONES: Record<ReviewStatus, string> = {
  approved: "bg-success/15 text-success",
  undone: "bg-success/15 text-success",
  conflict: "bg-warning/15 text-warning",
  indeterminate: "bg-warning/15 text-warning",
  unavailable: "bg-destructive/15 text-destructive",
  pending: "bg-muted text-muted-foreground",
  capturing: "bg-muted text-muted-foreground",
  undoing: "bg-muted text-muted-foreground",
};

const LIMITATION_LABELS: Record<NonNullable<FileChangeSummary["limitation"]>, string> = {
  "too-large": "Too large to capture",
  "too-complex": "Diff is too complex to render",
  binary: "Binary or unsupported encoding",
  "unsupported-kind": "Unsupported file kind",
  "outside-workspace": "Outside the workspace",
  "capture-failed": "Recovery was not captured",
  sensitive: "Sensitive path skipped",
};

const statusLabel = (status: ReviewStatus): string => STATUS_LABELS[status];
const statusTone = (status: ReviewStatus): string => STATUS_TONES[status];
export const limitationLabel = (limitation: NonNullable<FileChangeSummary["limitation"]>): string =>
  LIMITATION_LABELS[limitation];

export function firstSelectablePath(review: ChangeReviewSetSnapshot | null): string | null {
  return review?.files[0]?.relativePath ?? null;
}
