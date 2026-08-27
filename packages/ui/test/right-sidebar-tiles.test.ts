import { describe, expect, test } from "bun:test";
import {
  activateTile,
  clampTileSplit,
  closeTile,
  DEFAULT_TILE_SPLIT,
  emptyRightSidebarTiles,
  ensureVisibleTile,
  isTileOpen,
  MAX_VISIBLE_TILES,
  minimizeTile,
  openTile,
  readRightSidebarTiles,
  RIGHT_SIDEBAR_SIDE_BY_SIDE_MIN_WIDTH_PX,
  setTileSplit,
  tileOrientation,
  toggleTile,
  writeRightSidebarTiles,
  type RightSidebarTiles,
} from "../src/lib/right-sidebar-tiles";

function tiles(partial: Partial<RightSidebarTiles>): RightSidebarTiles {
  return { ...emptyRightSidebarTiles(), ...partial };
}

describe("openTile", () => {
  test("fills visible slots up to the cap", () => {
    let state = emptyRightSidebarTiles();
    state = openTile(state, "changes");
    expect(state.visible).toEqual(["changes"]);
    state = openTile(state, "plan");
    expect(state.visible).toEqual(["changes", "plan"]);
    expect(state.minimized).toEqual([]);
  });

  test("parks a third surface in the tray by default", () => {
    let state = tiles({ visible: ["changes", "plan"], recency: ["plan", "changes"] });
    state = openTile(state, "context-prompt");
    expect(state.visible).toEqual(["changes", "plan"]);
    expect(state.minimized).toEqual(["context-prompt"]);
  });

  test("evicts the least-recently-used visible tile when opened visibly at the cap", () => {
    let state = tiles({ visible: ["changes", "plan"], recency: ["plan", "changes"] });
    state = openTile(state, "context-prompt", { visible: true });
    expect(state.visible).toEqual(["context-prompt", "plan"]);
    expect(state.minimized).toEqual(["changes"]);
    expect(state.recency[0]).toBe("context-prompt");
  });

  test("reopening a visible tile only bumps recency", () => {
    let state = tiles({ visible: ["changes", "plan"], recency: ["plan", "changes"] });
    state = openTile(state, "changes");
    expect(state.visible).toEqual(["changes", "plan"]);
    expect(state.recency).toEqual(["changes", "plan"]);
  });

  test("opening a parked tile without the visible flag leaves it parked", () => {
    const state = tiles({ visible: ["changes", "plan"], recency: ["plan", "changes"], minimized: ["context-prompt"] });
    expect(openTile(state, "context-prompt")).toEqual(state);
  });
});

describe("closeTile", () => {
  test("removes a visible tile and promotes the most recently parked tile into the freed slot", () => {
    const state = tiles({
      visible: ["changes", "plan"],
      recency: ["plan", "changes"],
      minimized: ["context-prompt"],
    });
    const next = closeTile(state, "plan");
    expect(next.visible).toEqual(["changes", "context-prompt"]);
    expect(next.minimized).toEqual([]);
    expect(next.recency).toEqual(["context-prompt", "changes"]);
  });

  test("removes a parked tile without touching visible tiles", () => {
    const state = tiles({ visible: ["changes"], recency: ["changes"], minimized: ["plan"] });
    const next = closeTile(state, "plan");
    expect(next.visible).toEqual(["changes"]);
    expect(next.minimized).toEqual([]);
  });

  test("closing an unknown surface is a no-op", () => {
    const state = tiles({ visible: ["changes"], recency: ["changes"] });
    expect(closeTile(state, "plan")).toEqual(state);
  });
});

describe("minimizeTile", () => {
  test("parks the tile and promotes the next parked tile, not itself", () => {
    const state = tiles({
      visible: ["changes", "plan"],
      recency: ["plan", "changes"],
      minimized: ["context-prompt"],
    });
    const next = minimizeTile(state, "plan");
    expect(next.visible).toEqual(["changes", "context-prompt"]);
    expect(next.minimized).toEqual(["plan"]);
  });

  test("minimizing the last visible tile leaves it parked", () => {
    const state = tiles({ visible: ["changes"], recency: ["changes"] });
    const next = minimizeTile(state, "changes");
    expect(next.visible).toEqual([]);
    expect(next.minimized).toEqual(["changes"]);
  });
});

describe("activateTile", () => {
  test("swaps a parked tile in for the least-recently-used visible tile", () => {
    const state = tiles({
      visible: ["changes", "plan"],
      recency: ["plan", "changes"],
      minimized: ["context-prompt"],
    });
    const next = activateTile(state, "context-prompt");
    expect(next.visible).toEqual(["context-prompt", "plan"]);
    expect(next.minimized).toEqual(["changes"]);
    expect(next.recency).toEqual(["context-prompt", "plan"]);
  });

  test("fills a free visible slot without evicting", () => {
    const state = tiles({ visible: ["changes"], recency: ["changes"], minimized: ["plan"] });
    const next = activateTile(state, "plan");
    expect(next.visible).toEqual(["changes", "plan"]);
    expect(next.minimized).toEqual([]);
  });
});

describe("toggleTile", () => {
  test("opens a closed surface and closes an open one", () => {
    let state = emptyRightSidebarTiles();
    state = toggleTile(state, "changes");
    expect(isTileOpen(state, "changes")).toBe(true);
    state = toggleTile(state, "changes");
    expect(isTileOpen(state, "changes")).toBe(false);
  });

  test("closing a parked tile removes it from the tray", () => {
    const state = tiles({
      visible: ["changes", "plan"],
      recency: ["plan", "changes"],
      minimized: ["context-prompt"],
    });
    const next = toggleTile(state, "context-prompt");
    expect(next.minimized).toEqual([]);
    expect(next.visible).toEqual(["changes", "plan"]);
  });
});

describe("ensureVisibleTile", () => {
  test("restores the most recently parked tile when nothing is visible", () => {
    const state = tiles({ visible: [], minimized: ["plan", "changes"] });
    const next = ensureVisibleTile(state);
    expect(next.visible).toEqual(["plan"]);
    expect(next.minimized).toEqual(["changes"]);
  });

  test("is a no-op when a tile is already visible", () => {
    const state = tiles({ visible: ["changes"], recency: ["changes"], minimized: ["plan"] });
    expect(ensureVisibleTile(state)).toEqual(state);
  });
});

describe("tile split and orientation", () => {
  test("clamps the split ratio", () => {
    expect(clampTileSplit(0.1)).toBe(0.25);
    expect(clampTileSplit(0.9)).toBe(0.75);
    expect(clampTileSplit(Number.NaN)).toBe(DEFAULT_TILE_SPLIT);
    expect(setTileSplit(emptyRightSidebarTiles(), 0.6).splitRatio).toBe(0.6);
  });

  test("stacks below the side-by-side threshold and columns at or above it", () => {
    expect(tileOrientation(RIGHT_SIDEBAR_SIDE_BY_SIDE_MIN_WIDTH_PX - 1)).toBe("stack");
    expect(tileOrientation(RIGHT_SIDEBAR_SIDE_BY_SIDE_MIN_WIDTH_PX)).toBe("columns");
  });

  test("visible tiles never exceed the cap", () => {
    expect(MAX_VISIBLE_TILES).toBe(2);
  });
});

describe("right sidebar tiles storage", () => {
  function withStubbedLocalStorage(run: () => void): void {
    const original = globalThis.localStorage;
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });
    try {
      run();
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
    }
  }

  test("defaults to empty and round-trips", () => {
    withStubbedLocalStorage(() => {
      expect(readRightSidebarTiles()).toEqual(emptyRightSidebarTiles());
      const state = tiles({
        visible: ["changes", "plan"],
        recency: ["plan", "changes"],
        minimized: ["context-prompt"],
        splitRatio: 0.6,
      });
      writeRightSidebarTiles(state);
      expect(readRightSidebarTiles()).toEqual(state);
    });
  });

  test("drops unknown surfaces and repairs recency on read", () => {
    withStubbedLocalStorage(() => {
      globalThis.localStorage.setItem(
        "pho-code.rightSidebarTiles",
        JSON.stringify({ visible: ["changes", "bogus"], minimized: ["changes"], recency: [], splitRatio: 2 }),
      );
      const state = readRightSidebarTiles();
      expect(state.visible).toEqual(["changes"]);
      expect(state.minimized).toEqual([]);
      expect(state.recency).toEqual(["changes"]);
      expect(state.splitRatio).toBe(0.75);
    });
  });

  test("corrupt JSON falls back to empty", () => {
    withStubbedLocalStorage(() => {
      globalThis.localStorage.setItem("pho-code.rightSidebarTiles", "{not json");
      expect(readRightSidebarTiles()).toEqual(emptyRightSidebarTiles());
    });
  });
});
