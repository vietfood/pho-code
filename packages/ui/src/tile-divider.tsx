import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { cn } from "./lib/cn";
import { clampTileSplit } from "./lib/right-sidebar-tiles";

export type TileSplitOrientation = "stack" | "columns";

const TILE_SPLIT_KEY_STEP = 0.05;

/** Draggable divider living in the gap between two tiles; the handle line
 * appears only on hover/focus/drag. Shared by the right-sidebar host and the
 * chat tile host. */
export function TileDivider({
  orientation,
  ratio,
  containerRef,
  onDrag,
  onCommit,
  testId = "tile-divider",
}: {
  orientation: TileSplitOrientation;
  ratio: number;
  containerRef: RefObject<HTMLDivElement | null>;
  onDrag: (ratio: number) => void;
  onCommit: (ratio: number) => void;
  testId?: string;
}) {
  const stacked = orientation === "stack";
  const dragRef = useRef<number | null>(null);

  function ratioFromPointer(client: number): number | null {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }
    const size = stacked ? rect.height : rect.width;
    if (size <= 0) {
      return null;
    }
    const offset = client - (stacked ? rect.top : rect.left);
    return clampTileSplit(offset / size);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = event.pointerId;
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (dragRef.current !== event.pointerId) {
      return;
    }
    const next = ratioFromPointer(stacked ? event.clientY : event.clientX);
    if (next != null) {
      onDrag(next);
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (dragRef.current !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const next = ratioFromPointer(stacked ? event.clientY : event.clientX);
    if (next != null) {
      onCommit(next);
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const decrease = stacked ? "ArrowUp" : "ArrowLeft";
    const increase = stacked ? "ArrowDown" : "ArrowRight";
    if (event.key === decrease || event.key === increase) {
      event.preventDefault();
      onCommit(ratio + (event.key === increase ? TILE_SPLIT_KEY_STEP : -TILE_SPLIT_KEY_STEP));
    }
  }

  return (
    <div
      className={cn(
        "no-drag group relative shrink-0 touch-none",
        stacked ? "h-2 w-full cursor-row-resize" : "h-full w-2 cursor-col-resize",
      )}
      role="separator"
      aria-orientation={stacked ? "horizontal" : "vertical"}
      aria-label="Resize tiles"
      aria-valuemin={25}
      aria-valuemax={75}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      data-testid={testId}
      title="Drag to resize tiles"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div
        className={cn(
          "absolute rounded-full bg-transparent transition-colors group-hover:bg-accent-foreground/40 group-focus-visible:bg-accent-foreground/40 group-active:bg-accent-foreground/40",
          stacked ? "inset-x-1 top-1/2 h-0.5 -translate-y-1/2" : "inset-y-1 left-1/2 w-0.5 -translate-x-1/2",
        )}
        aria-hidden="true"
      />
    </div>
  );
}
