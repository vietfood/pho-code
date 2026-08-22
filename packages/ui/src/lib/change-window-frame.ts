// Geometry for the floating changes overlay. Kept pure and viewport-parameterised
// so the clamping is testable without a DOM.
import { readStoredValue, writeStoredValue } from "./storage";

const STORAGE_KEY = "pho-code.changesWindowFrame.v2";

export interface WindowFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Narrower than this and a unified diff line wraps into noise. */
export const MIN_CHANGES_WINDOW_WIDTH_PX = 480;
export const MIN_CHANGES_WINDOW_HEIGHT_PX = 320;
/** Air around the overlay so it reads as a pane, not a docked split. */
export const CHANGES_WINDOW_INSET_PX = 12;
/** Keep a grab strip on screen so a window dragged off an edge stays reachable. */
export const CHANGES_WINDOW_EDGE_KEEP_PX = 96;
/** Claude-like share of the host: wide enough to read a diff, chat still visible. */
export const DEFAULT_CHANGES_WINDOW_WIDTH_RATIO = 0.56;

export function defaultChangesWindowFrame(viewport: Viewport): WindowFrame {
  const maxWidth = Math.max(MIN_CHANGES_WINDOW_WIDTH_PX, viewport.width - CHANGES_WINDOW_INSET_PX * 2);
  const width = clampSize(
    Math.round(viewport.width * DEFAULT_CHANGES_WINDOW_WIDTH_RATIO),
    MIN_CHANGES_WINDOW_WIDTH_PX,
    maxWidth,
  );
  const height = clampSize(
    viewport.height - CHANGES_WINDOW_INSET_PX * 2,
    MIN_CHANGES_WINDOW_HEIGHT_PX,
    Math.max(MIN_CHANGES_WINDOW_HEIGHT_PX, viewport.height - CHANGES_WINDOW_INSET_PX),
  );
  return {
    x: Math.max(CHANGES_WINDOW_INSET_PX, viewport.width - width - CHANGES_WINDOW_INSET_PX),
    y: CHANGES_WINDOW_INSET_PX,
    width,
    height,
  };
}

export function clampChangesWindowFrame(frame: WindowFrame, viewport: Viewport): WindowFrame {
  const width = clampSize(frame.width, MIN_CHANGES_WINDOW_WIDTH_PX, viewport.width);
  const height = clampSize(frame.height, MIN_CHANGES_WINDOW_HEIGHT_PX, viewport.height);
  const maxX = Math.max(0, viewport.width - CHANGES_WINDOW_EDGE_KEEP_PX);
  const minX = Math.min(0, viewport.width - width);
  const maxY = Math.max(0, viewport.height - CHANGES_WINDOW_EDGE_KEEP_PX);
  return {
    width,
    height,
    x: Math.round(Math.min(maxX, Math.max(minX, frame.x))),
    y: Math.round(Math.min(maxY, Math.max(0, frame.y))),
  };
}

export function readChangesWindowFrame(viewport: Viewport): WindowFrame {
  const raw = readStoredValue(STORAGE_KEY);
  if (raw == null || raw === "") {
    return defaultChangesWindowFrame(viewport);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isFrame(parsed)) {
      return defaultChangesWindowFrame(viewport);
    }
    return clampChangesWindowFrame(parsed, viewport);
  } catch {
    return defaultChangesWindowFrame(viewport);
  }
}

export function writeChangesWindowFrame(frame: WindowFrame, viewport: Viewport): void {
  writeStoredValue(STORAGE_KEY, JSON.stringify(clampChangesWindowFrame(frame, viewport)));
}

export function currentViewport(): Viewport {
  if (typeof window === "undefined" || !Number.isFinite(window.innerWidth)) {
    return { width: 1280, height: 800 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

export function elementViewport(element: HTMLElement | null): Viewport {
  if (!element) {
    return currentViewport();
  }
  const width = element.clientWidth;
  const height = element.clientHeight;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return currentViewport();
  }
  return { width, height };
}

function clampSize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.round(Math.min(Math.max(min, value), Math.max(min, max)));
}

function isFrame(value: unknown): value is WindowFrame {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const frame = value as Record<string, unknown>;
  return (
    typeof frame.x === "number" &&
    typeof frame.y === "number" &&
    typeof frame.width === "number" &&
    typeof frame.height === "number"
  );
}
