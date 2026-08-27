import { useCallback, useRef, useState } from "react";
import {
  activateTile,
  closeTile,
  isTileOpen,
  minimizeTile,
  openTile,
  readRightSidebarTiles,
  readSidebarCollapsed,
  setTileSplit,
  toggleTile,
  writeRightSidebarTiles,
  writeSidebarCollapsed,
  type RightSidebarSurface,
  type RightSidebarTiles,
} from "@pho-code/ui";

export interface LayoutChrome {
  sidebarCollapsed: boolean;
  /** Session-only hide of the whole tile region (⌘R / Escape); tiles stay mounted. */
  rightRegionHidden: boolean;
  rightSidebarTiles: RightSidebarTiles;
  toggleSidebar(): void;
  /** Hide/show the tile region. */
  toggleRightSidebar(): void;
  hideRightRegion(): void;
  /** Show Changes docked in the right region and load the latest review. */
  dockChanges(): void;
  /** Icon click: opens a closed surface's tile, closes an open one. */
  toggleRightSurface(surface: RightSidebarSurface): void;
  /** Reveal a surface's tile visibly (transcript review buttons, plan auto-open). */
  revealRightSurface(surface: RightSidebarSurface): void;
  closeRightSurface(surface: RightSidebarSurface): void;
  minimizeRightSurface(surface: RightSidebarSurface): void;
  /** Tray click: swaps a parked tile in for the least-recently-used visible tile. */
  activateRightSurface(surface: RightSidebarSurface): void;
  setRightTileSplit(ratio: number): void;
  /** Show the docked Changes tile without asking for the latest review. */
  revealChanges(): void;
}

/**
 * Owns the window chrome: sidebar collapse and the right-region tiling tab host.
 *
 * Tile state is persisted, and every path that changes it must also write it —
 * that pairing was previously repeated at each call site, where missing the
 * write silently lost the layout across relaunch. Region hide is session-only.
 * `onRevealChanges` runs whenever the Changes tile becomes visible.
 */
export function useLayoutChrome(onRevealChanges: () => void): LayoutChrome {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed());
  const [rightRegionHidden, setRightRegionHidden] = useState(false);
  const [rightSidebarTiles, setRightSidebarTiles] = useState(() => readRightSidebarTiles());

  const rightRegionHiddenRef = useRef(rightRegionHidden);
  rightRegionHiddenRef.current = rightRegionHidden;
  const tilesRef = useRef(rightSidebarTiles);
  tilesRef.current = rightSidebarTiles;

  const applyTiles = useCallback((next: RightSidebarTiles) => {
    setRightSidebarTiles(next);
    writeRightSidebarTiles(next);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      writeSidebarCollapsed(next);
      return next;
    });
  }, []);

  const revealChanges = useCallback(() => {
    applyTiles(openTile(tilesRef.current, "changes", { visible: true }));
    setRightRegionHidden(false);
  }, [applyTiles]);

  const dockChanges = useCallback(() => {
    revealChanges();
    onRevealChanges();
  }, [onRevealChanges, revealChanges]);

  const toggleRightSidebar = useCallback(() => {
    const current = tilesRef.current;
    if (current.visible.length === 0 && current.minimized.length === 0) {
      return;
    }
    const next = !rightRegionHiddenRef.current;
    if (!next && current.visible.includes("changes")) {
      onRevealChanges();
    }
    setRightRegionHidden(next);
  }, [onRevealChanges]);

  const hideRightRegion = useCallback(() => {
    setRightRegionHidden(true);
  }, []);

  const toggleRightSurface = useCallback(
    (surface: RightSidebarSurface) => {
      const current = tilesRef.current;
      const wasOpen = isTileOpen(current, surface);
      applyTiles(toggleTile(current, surface));
      if (!wasOpen) {
        setRightRegionHidden(false);
        if (surface === "changes") {
          onRevealChanges();
        }
      }
    },
    [applyTiles, onRevealChanges],
  );

  const revealRightSurface = useCallback(
    (surface: RightSidebarSurface) => {
      if (surface === "changes") {
        dockChanges();
        return;
      }
      applyTiles(openTile(tilesRef.current, surface, { visible: true }));
      setRightRegionHidden(false);
    },
    [applyTiles, dockChanges],
  );

  const closeRightSurface = useCallback(
    (surface: RightSidebarSurface) => {
      applyTiles(closeTile(tilesRef.current, surface));
    },
    [applyTiles],
  );

  const minimizeRightSurface = useCallback(
    (surface: RightSidebarSurface) => {
      applyTiles(minimizeTile(tilesRef.current, surface));
    },
    [applyTiles],
  );

  const activateRightSurface = useCallback(
    (surface: RightSidebarSurface) => {
      applyTiles(activateTile(tilesRef.current, surface));
      setRightRegionHidden(false);
    },
    [applyTiles],
  );

  const setRightTileSplit = useCallback(
    (ratio: number) => {
      applyTiles(setTileSplit(tilesRef.current, ratio));
    },
    [applyTiles],
  );

  return {
    sidebarCollapsed,
    rightRegionHidden,
    rightSidebarTiles,
    toggleSidebar,
    toggleRightSidebar,
    hideRightRegion,
    dockChanges,
    toggleRightSurface,
    revealRightSurface,
    closeRightSurface,
    minimizeRightSurface,
    activateRightSurface,
    setRightTileSplit,
    revealChanges,
  };
}
