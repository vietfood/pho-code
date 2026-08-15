import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH_PX,
  MAX_SIDEBAR_WIDTH_PX,
  MIN_SIDEBAR_WIDTH_PX,
  readSidebarWidth,
  SIDEBAR_RESIZE_STEP_PX,
  writeSidebarWidth,
} from "./lib/sidebar-width";

export type SidebarResizeEdge = "start" | "end";

export interface SidebarResizeStorage {
  read: () => number;
  write: (widthPx: number) => void;
  clamp: (widthPx: number) => number;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  step?: number;
}

const LEFT_SIDEBAR_STORAGE: SidebarResizeStorage = {
  read: readSidebarWidth,
  write: writeSidebarWidth,
  clamp: clampSidebarWidth,
  defaultWidth: DEFAULT_SIDEBAR_WIDTH_PX,
  minWidth: MIN_SIDEBAR_WIDTH_PX,
  maxWidth: MAX_SIDEBAR_WIDTH_PX,
  step: SIDEBAR_RESIZE_STEP_PX,
};

export interface SidebarResizeHandleProps {
  width: number;
  edge?: SidebarResizeEdge;
  minWidth?: number;
  maxWidth?: number;
  testId?: string;
  label?: string;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
}

export function useSidebarResize(options?: {
  edge?: SidebarResizeEdge;
  storage?: SidebarResizeStorage;
  testId?: string;
  label?: string;
}): {
  width: number;
  resizing: boolean;
  handle: SidebarResizeHandleProps;
} {
  const edge = options?.edge ?? "end";
  const storage = options?.storage ?? LEFT_SIDEBAR_STORAGE;
  const step = storage.step ?? SIDEBAR_RESIZE_STEP_PX;
  const direction = edge === "start" ? -1 : 1;
  const [width, setWidth] = useState(storage.read);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  function commitWidth(next: number): void {
    const clamped = storage.clamp(next);
    setWidth(clamped);
    storage.write(clamped);
  }

  function nextFromDelta(startWidth: number, clientX: number, startX: number): number {
    return storage.clamp(startWidth + direction * (clientX - startX));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
    setResizing(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setWidth(nextFromDelta(drag.startWidth, event.clientX, drag.startX));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commitWidth(nextFromDelta(drag.startWidth, event.clientX, drag.startX));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        commitWidth(width - direction * step);
        return;
      case "ArrowRight":
        event.preventDefault();
        commitWidth(width + direction * step);
        return;
      case "Home":
        event.preventDefault();
        commitWidth(storage.minWidth);
        return;
      case "End":
        event.preventDefault();
        commitWidth(storage.maxWidth);
        return;
      default:
        return;
    }
  }

  return {
    width,
    resizing,
    handle: {
      width,
      edge,
      minWidth: storage.minWidth,
      maxWidth: storage.maxWidth,
      testId: options?.testId,
      label: options?.label,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onKeyDown,
      onDoubleClick: () => commitWidth(storage.defaultWidth),
    },
  };
}

export function SidebarResizeHandle({
  width,
  edge = "end",
  minWidth = MIN_SIDEBAR_WIDTH_PX,
  maxWidth = MAX_SIDEBAR_WIDTH_PX,
  testId = "sidebar-resize",
  label = "Resize sidebar",
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  onDoubleClick,
}: SidebarResizeHandleProps) {
  return (
    <div
      className="sidebar-resize-handle no-drag"
      data-edge={edge}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      tabIndex={0}
      data-testid={testId}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    />
  );
}
