import { readStoredValue, writeStoredValue } from "./storage";

export const RIGHT_SIDEBAR_SURFACES = ["changes", "context-prompt", "plan", "task"] as const;
export type RightSidebarSurface = (typeof RIGHT_SIDEBAR_SURFACES)[number];

export const MAX_VISIBLE_TILES = 2;
/** Below this panel width two tiles stack; at or above it they sit side by side. */
export const RIGHT_SIDEBAR_SIDE_BY_SIDE_MIN_WIDTH_PX = 880;
export const DEFAULT_TILE_SPLIT = 0.5;
export const MIN_TILE_SPLIT = 0.25;
export const MAX_TILE_SPLIT = 0.75;

const STORAGE_KEY = "pho-code.rightSidebarTiles";

export interface RightSidebarTiles {
  /** Visible tiles in layout order; length ≤ MAX_VISIBLE_TILES. */
  visible: RightSidebarSurface[];
  /** Parked tiles, most recently parked first; content stays mounted but hidden. */
  minimized: RightSidebarSurface[];
  /** Visible tiles, most recently used first; the tail is the swap victim. */
  recency: RightSidebarSurface[];
  /** Fraction of the region given to the first visible tile when two are visible. */
  splitRatio: number;
}

export type RightSidebarTileOrientation = "stack" | "columns";

export function emptyRightSidebarTiles(): RightSidebarTiles {
  return { visible: [], minimized: [], recency: [], splitRatio: DEFAULT_TILE_SPLIT };
}

export function clampTileSplit(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return DEFAULT_TILE_SPLIT;
  }
  return Math.min(MAX_TILE_SPLIT, Math.max(MIN_TILE_SPLIT, ratio));
}

export function tileOrientation(panelWidthPx: number): RightSidebarTileOrientation {
  return panelWidthPx >= RIGHT_SIDEBAR_SIDE_BY_SIDE_MIN_WIDTH_PX ? "columns" : "stack";
}

export function isTileOpen(state: RightSidebarTiles, surface: RightSidebarSurface): boolean {
  return state.visible.includes(surface) || state.minimized.includes(surface);
}

function bumpRecency(state: RightSidebarTiles, surface: RightSidebarSurface): RightSidebarSurface[] {
  return [surface, ...state.recency.filter((entry) => entry !== surface)];
}

function swapVictim(state: RightSidebarTiles): RightSidebarSurface {
  return state.recency[state.recency.length - 1] ?? state.visible[0];
}

/** Fills the freed visible slot with the most recently parked tile, if any. */
function promoteParked(
  state: RightSidebarTiles,
  visible: RightSidebarSurface[],
  freedIndex: number,
  minimized: RightSidebarSurface[],
): RightSidebarTiles {
  const [promoted, ...rest] = minimized;
  if (!promoted) {
    return { ...state, visible, minimized: rest, recency: state.recency };
  }
  const nextVisible = [...visible];
  nextVisible.splice(Math.min(freedIndex, nextVisible.length), 0, promoted);
  return { ...state, visible: nextVisible, minimized: rest, recency: [promoted, ...state.recency] };
}

export function openTile(
  state: RightSidebarTiles,
  surface: RightSidebarSurface,
  options?: { visible?: boolean },
): RightSidebarTiles {
  if (state.visible.includes(surface)) {
    return { ...state, recency: bumpRecency(state, surface) };
  }
  if (state.minimized.includes(surface)) {
    return options?.visible ? activateTile(state, surface) : state;
  }
  if (state.visible.length < MAX_VISIBLE_TILES) {
    return { ...state, visible: [...state.visible, surface], recency: bumpRecency(state, surface) };
  }
  if (!options?.visible) {
    return { ...state, minimized: [surface, ...state.minimized] };
  }
  const victim = swapVictim(state);
  return {
    ...state,
    visible: state.visible.map((entry) => (entry === victim ? surface : entry)),
    minimized: [victim, ...state.minimized],
    recency: [surface, ...state.recency.filter((entry) => entry !== victim)],
  };
}

export function closeTile(state: RightSidebarTiles, surface: RightSidebarSurface): RightSidebarTiles {
  if (state.minimized.includes(surface)) {
    return { ...state, minimized: state.minimized.filter((entry) => entry !== surface) };
  }
  if (!state.visible.includes(surface)) {
    return state;
  }
  const freedIndex = state.visible.indexOf(surface);
  const without: RightSidebarTiles = {
    ...state,
    visible: state.visible.filter((entry) => entry !== surface),
    recency: state.recency.filter((entry) => entry !== surface),
  };
  return promoteParked(without, without.visible, freedIndex, state.minimized);
}

export function minimizeTile(state: RightSidebarTiles, surface: RightSidebarSurface): RightSidebarTiles {
  if (!state.visible.includes(surface)) {
    return state;
  }
  const freedIndex = state.visible.indexOf(surface);
  const without: RightSidebarTiles = {
    ...state,
    visible: state.visible.filter((entry) => entry !== surface),
    recency: state.recency.filter((entry) => entry !== surface),
  };
  const promotedState = promoteParked(without, without.visible, freedIndex, state.minimized);
  return { ...promotedState, minimized: [surface, ...promotedState.minimized] };
}

/** Tray click: swaps a parked tile in for the least-recently-used visible tile. */
export function activateTile(state: RightSidebarTiles, surface: RightSidebarSurface): RightSidebarTiles {
  if (!state.minimized.includes(surface)) {
    return state;
  }
  const minimized = state.minimized.filter((entry) => entry !== surface);
  if (state.visible.length < MAX_VISIBLE_TILES) {
    return {
      ...state,
      visible: [...state.visible, surface],
      minimized,
      recency: bumpRecency(state, surface),
    };
  }
  const victim = swapVictim(state);
  return {
    ...state,
    visible: state.visible.map((entry) => (entry === victim ? surface : entry)),
    minimized: [victim, ...minimized],
    recency: [surface, ...state.recency.filter((entry) => entry !== victim)],
  };
}

/** Rail semantics: an open surface closes, a closed surface opens (parked when capped). */
export function toggleTile(state: RightSidebarTiles, surface: RightSidebarSurface): RightSidebarTiles {
  return isTileOpen(state, surface) ? closeTile(state, surface) : openTile(state, surface);
}

/** Reopening a collapsed host with only parked tiles restores the most recently parked one. */
export function ensureVisibleTile(state: RightSidebarTiles): RightSidebarTiles {
  if (state.visible.length > 0 || state.minimized.length === 0) {
    return state;
  }
  const [promoted, ...rest] = state.minimized;
  return { ...state, visible: [promoted], minimized: rest, recency: bumpRecency(state, promoted) };
}

export function setTileSplit(state: RightSidebarTiles, ratio: number): RightSidebarTiles {
  return { ...state, splitRatio: clampTileSplit(ratio) };
}

function validSurfaces(list: unknown): RightSidebarSurface[] {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((entry): entry is RightSidebarSurface =>
    (RIGHT_SIDEBAR_SURFACES as readonly string[]).includes(entry as string),
  );
}

export function readRightSidebarTiles(): RightSidebarTiles {
  const raw = readStoredValue(STORAGE_KEY);
  if (!raw) {
    return emptyRightSidebarTiles();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RightSidebarTiles>;
    const visible = validSurfaces(parsed.visible).slice(0, MAX_VISIBLE_TILES);
    const minimized = validSurfaces(parsed.minimized).filter((entry) => !visible.includes(entry));
    const recency = validSurfaces(parsed.recency).filter((entry) => visible.includes(entry));
    for (const surface of visible) {
      if (!recency.includes(surface)) {
        recency.push(surface);
      }
    }
    return { visible, minimized, recency, splitRatio: clampTileSplit(Number(parsed.splitRatio)) };
  } catch {
    return emptyRightSidebarTiles();
  }
}

export function writeRightSidebarTiles(state: RightSidebarTiles): void {
  writeStoredValue(STORAGE_KEY, JSON.stringify(state));
}
