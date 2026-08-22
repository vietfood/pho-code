// Geometry for the floating changes window. Kept pure and viewport-parameterised
// so the clamping is testable without a DOM.
import { readStoredValue, writeStoredValue } from "./storage";

const STORAGE_KEY = "pho-code.changesWindowFrame";

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
/** Keep a grab strip on screen so a window dragged off an edge stays reachable. */
export const CHANGES_WINDOW_EDGE_KEEP_PX = 96;

export function defaultChangesWindowFrame(viewport: Viewport): WindowFrame {
  const width = clampSize(Math.round(viewport.width * 0.62), MIN_CHANGES_WINDOW_WIDTH_PX, viewport.width);
  const height = clampSize(Math.round(viewport.height * 0.78), MIN_CHANGES_WINDOW_HEIGHT_PX, viewport.height);
  return {
    x: Math.max(0, Math.round((viewport.width - width) / 2)),
    y: Math.max(0, Math.round((viewport.height - height) / 2)),
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
