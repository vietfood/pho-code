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

export function useSidebarResize(): {
  width: number;
  resizing: boolean;
  handle: {
    width: number;
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
    onDoubleClick: () => void;
  };
} {
  const [width, setWidth] = useState(readSidebarWidth);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  function commitWidth(next: number): void {
    const clamped = clampSidebarWidth(next);
    setWidth(clamped);
    writeSidebarWidth(clamped);
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
    setWidth(clampSidebarWidth(drag.startWidth + (event.clientX - drag.startX)));
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
    commitWidth(drag.startWidth + (event.clientX - drag.startX));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        commitWidth(width - SIDEBAR_RESIZE_STEP_PX);
        return;
      case "ArrowRight":
        event.preventDefault();
        commitWidth(width + SIDEBAR_RESIZE_STEP_PX);
        return;
      case "Home":
        event.preventDefault();
        commitWidth(MIN_SIDEBAR_WIDTH_PX);
        return;
      case "End":
        event.preventDefault();
        commitWidth(MAX_SIDEBAR_WIDTH_PX);
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
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onKeyDown,
      onDoubleClick: () => commitWidth(DEFAULT_SIDEBAR_WIDTH_PX),
    },
  };
}

export function SidebarResizeHandle({
  width,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  onDoubleClick,
}: {
  width: number;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      className="sidebar-resize-handle no-drag"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={MIN_SIDEBAR_WIDTH_PX}
      aria-valuemax={MAX_SIDEBAR_WIDTH_PX}
      aria-valuenow={width}
      tabIndex={0}
      data-testid="sidebar-resize"
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
