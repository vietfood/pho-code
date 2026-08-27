// Surface icon cluster adapted from refs/t3code RightPanelTabs (MIT, T3 Tools
// Inc., 6bc6cb6). Globe, terminal, files, and extra launcher surfaces are
// omitted; Context prompt is a Pho Code surface.
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { BookOpenIcon, FileDiffIcon, MinusIcon, ScrollTextIcon, XIcon, type LucideIcon } from "lucide-react";
import { cn } from "./lib/cn";
import { TileDivider } from "./tile-divider";
import {
  clampReviewSidebarWidth,
  DEFAULT_REVIEW_SIDEBAR_WIDTH_PX,
  MAX_REVIEW_SIDEBAR_WIDTH_PX,
  MIN_REVIEW_SIDEBAR_WIDTH_PX,
  readReviewSidebarWidth,
  REVIEW_SIDEBAR_RESIZE_STEP_PX,
  writeReviewSidebarWidth,
} from "./lib/review-sidebar-width";
import {
  clampTileSplit,
  DEFAULT_TILE_SPLIT,
  RIGHT_SIDEBAR_SURFACES,
  tileOrientation,
  type RightSidebarSurface,
} from "./lib/right-sidebar-tiles";
import { Button } from "./ui/button";
import { SidebarResizeHandle, useSidebarResize } from "./sidebar-resize-handle";

export type { RightSidebarSurface } from "./lib/right-sidebar-tiles";

const SURFACE_META: Record<RightSidebarSurface, { title: string; icon: LucideIcon; testId: string }> = {
  changes: { title: "Changes", icon: FileDiffIcon, testId: "diff" },
  "context-prompt": { title: "Context prompt", icon: BookOpenIcon, testId: "context" },
  plan: { title: "Plan", icon: ScrollTextIcon, testId: "plan" },
};

const REVIEW_SIDEBAR_STORAGE = {
  read: readReviewSidebarWidth,
  write: writeReviewSidebarWidth,
  clamp: clampReviewSidebarWidth,
  defaultWidth: DEFAULT_REVIEW_SIDEBAR_WIDTH_PX,
  minWidth: MIN_REVIEW_SIDEBAR_WIDTH_PX,
  maxWidth: MAX_REVIEW_SIDEBAR_WIDTH_PX,
  step: REVIEW_SIDEBAR_RESIZE_STEP_PX,
};

export interface RightSurfaceIconsProps {
  /** Visible tiles; their icons render pressed. */
  tiles: readonly RightSidebarSurface[];
  /** Parked tiles; their icons also render pressed. */
  minimized?: readonly RightSidebarSurface[];
  contextPromptCustomized?: boolean;
  planDocumentPresent?: boolean;
  changesOverlayOpen?: boolean;
  /** Icon click: opens a closed surface's tile, closes an open one. */
  onToggleSurface: (surface: RightSidebarSurface) => void;
}

/** Always-visible surface launcher embedded at the top-right edge of the chat. */
export function RightSurfaceIcons({
  tiles,
  minimized = [],
  contextPromptCustomized = false,
  planDocumentPresent = false,
  changesOverlayOpen = false,
  onToggleSurface,
}: RightSurfaceIconsProps) {
  return (
    <nav
      className="flex shrink-0 items-center gap-0.5"
      aria-label="Right sidebar surfaces"
      data-testid="right-surface-icons"
    >
      {RIGHT_SIDEBAR_SURFACES.map((surface) => {
        const meta = SURFACE_META[surface];
        const Icon = meta.icon;
        const pressed =
          (surface === "changes" && changesOverlayOpen) ||
          tiles.includes(surface) ||
          minimized.includes(surface);
        const badge =
          surface === "context-prompt"
            ? { show: contextPromptCustomized, testId: "right-sidebar-context-custom", attr: "data-customized" }
            : surface === "plan"
              ? { show: planDocumentPresent, testId: "right-sidebar-plan-document", attr: "data-document" }
              : null;
        return (
          <Button
            key={surface}
            variant="ghost"
            size="icon-sm"
            aria-label={meta.title}
            aria-pressed={pressed}
            data-testid={`right-sidebar-surface-${meta.testId}`}
            {...(badge ? { [badge.attr]: badge.show ? "true" : "false" } : {})}
            className={cn(
              "no-drag size-6",
              pressed
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onToggleSurface(surface)}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {badge?.show ? (
              <span
                className="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-primary"
                data-testid={badge.testId}
              />
            ) : null}
          </Button>
        );
      })}
    </nav>
  );
}

export interface RightSidebarProps {
  /** Visible tiles in layout order. */
  tiles: readonly RightSidebarSurface[];
  /** Parked tiles shown as tray chips; their content stays mounted but hidden. */
  minimized?: readonly RightSidebarSurface[];
  splitRatio?: number;
  /** Session-only hide (⌘R / Escape): the region keeps its tiles mounted. */
  hidden?: boolean;
  onHideRegion: () => void;
  onCloseSurface: (surface: RightSidebarSurface) => void;
  onMinimizeSurface: (surface: RightSidebarSurface) => void;
  /** Tray click: swaps a parked tile in for the least-recently-used visible tile. */
  onActivateSurface: (surface: RightSidebarSurface) => void;
  onSplitChange: (ratio: number) => void;
  renderSurface: (surface: RightSidebarSurface) => ReactNode;
}

export function RightSidebar({
  tiles,
  minimized = [],
  splitRatio = DEFAULT_TILE_SPLIT,
  hidden = false,
  onHideRegion,
  onCloseSurface,
  onMinimizeSurface,
  onActivateSurface,
  onSplitChange,
  renderSurface,
}: RightSidebarProps) {
  const { width, resizing, handle: resizeHandle } = useSidebarResize({
    edge: "start",
    storage: REVIEW_SIDEBAR_STORAGE,
    testId: "right-sidebar-resize",
    label: "Resize right sidebar",
  });
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const tilesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (hidden) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) {
        return;
      }
      event.preventDefault();
      onHideRegion();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [hidden, onHideRegion]);

  const orientation = tileOrientation(width);
  const stacked = orientation === "stack";
  const ratio = clampTileSplit(dragRatio ?? splitRatio);

  return (
    <aside
      className={cn(
        "right-sidebar-host relative flex h-full min-h-0 shrink-0 motion-reduce:transition-none",
        resizing && "select-none",
        hidden && "hidden",
      )}
      style={{ width: `${width}px` }}
      data-testid="right-sidebar"
      data-orientation={orientation}
      aria-label="Right sidebar"
    >
      <SidebarResizeHandle {...resizeHandle} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 py-2 pe-2 ps-1">
        <div
          ref={tilesRef}
          className={cn("flex min-h-0 min-w-0 flex-1", stacked ? "flex-col" : "flex-row")}
          data-testid="right-sidebar-tiles"
        >
          {tiles.map((surface, index) => (
            <TileFrame
              key={surface}
              surface={surface}
              divider={
                index > 0 ? (
                  <TileDivider
                    orientation={orientation}
                    ratio={ratio}
                    containerRef={tilesRef}
                    onDrag={setDragRatio}
                    onCommit={(next) => {
                      setDragRatio(null);
                      onSplitChange(next);
                    }}
                    testId="right-sidebar-tile-divider"
                  />
                ) : null
              }
              style={
                tiles.length > 1
                  ? { flexGrow: index === 0 ? ratio : 1 - ratio, flexBasis: 0 }
                  : { flex: 1 }
              }
              onMinimize={() => onMinimizeSurface(surface)}
              onClose={() => onCloseSurface(surface)}
            >
              {renderSurface(surface)}
            </TileFrame>
          ))}
        </div>
        {minimized.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5" data-testid="right-sidebar-tray">
            {minimized.map((surface) => {
              const meta = SURFACE_META[surface];
              const Icon = meta.icon;
              return (
                <span
                  key={surface}
                  className="flex items-center gap-0.5 rounded-full border border-foreground/20 bg-transparent py-0.5 ps-2 pe-1 text-xs text-muted-foreground shadow-sm"
                >
                  <button
                    type="button"
                    className="flex items-center gap-1.5 hover:text-foreground"
                    aria-label={`Restore ${meta.title}`}
                    data-testid={`right-sidebar-tray-${meta.testId}`}
                    onClick={() => onActivateSurface(surface)}
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>{meta.title}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Close ${meta.title}`}
                    data-testid={`right-sidebar-tray-close-${meta.testId}`}
                    className="no-drag size-4"
                    onClick={() => onCloseSurface(surface)}
                  >
                    <XIcon className="size-2.5" aria-hidden="true" />
                  </Button>
                </span>
              );
            })}
          </div>
        ) : null}
        {minimized.map((surface) => (
          <div key={surface} hidden className="hidden" data-testid={`right-sidebar-hidden-${SURFACE_META[surface].testId}`}>
            {renderSurface(surface)}
          </div>
        ))}
      </div>
    </aside>
  );
}

function TileFrame({
  surface,
  divider,
  style,
  onMinimize,
  onClose,
  children,
}: {
  surface: RightSidebarSurface;
  divider: ReactNode;
  style: CSSProperties;
  onMinimize: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const meta = SURFACE_META[surface];
  const Icon = meta.icon;
  return (
    <>
      {divider}
      <section
        className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-foreground/20 bg-transparent"
        style={style}
        data-testid={`right-sidebar-tile-${meta.testId}`}
        aria-label={meta.title}
      >
        <header className="flex h-8 shrink-0 items-center gap-1.5 border-b border-foreground/10 ps-2 pe-1">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{meta.title}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Minimize ${meta.title}`}
            data-testid={`right-sidebar-tile-minimize-${meta.testId}`}
            className="no-drag size-5"
            onClick={onMinimize}
          >
            <MinusIcon className="size-3" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Close ${meta.title}`}
            data-testid={`right-sidebar-tile-close-${meta.testId}`}
            className="no-drag size-5"
            onClick={onClose}
          >
            <XIcon className="size-3" aria-hidden="true" />
          </Button>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </section>
    </>
  );
}
