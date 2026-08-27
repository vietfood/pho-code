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
  changesWindowOpen: boolean;
  toggleSidebar(): void;
  /** Hide/show the tile region, or dismiss the overlay when one is open. */
  toggleRightSidebar(): void;
  hideRightRegion(): void;
  /** Show Changes docked in the right region and load the latest review. */
  dockChanges(): void;
  /** Float Changes as an overlay, parking its tile in the tray behind it. */
  expandChangesOverlay(): void;
  closeChangesOverlay(restoreSidebar: boolean): void;
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
  closeChangesWindow(): void;
}

/**
 * Owns the window chrome: sidebar collapse, the right-region tiling tab host,
 * and the floating Changes overlay.
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
  const [changesWindowOpen, setChangesWindowOpen] = useState(false);

  const changesWindowOpenRef = useRef(changesWindowOpen);
  changesWindowOpenRef.current = changesWindowOpen;
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
    setChangesWindowOpen(false);
  }, [applyTiles]);

  const dockChanges = useCallback(() => {
    revealChanges();
    onRevealChanges();
  }, [onRevealChanges, revealChanges]);

  const expandChangesOverlay = useCallback(() => {
    applyTiles(minimizeTile(tilesRef.current, "changes"));
    setChangesWindowOpen(true);
    onRevealChanges();
  }, [applyTiles, onRevealChanges]);

  const closeChangesOverlay = useCallback(
    (restoreSidebar: boolean) => {
      setChangesWindowOpen(false);
      if (restoreSidebar) {
        applyTiles(openTile(tilesRef.current, "changes", { visible: true }));
        setRightRegionHidden(false);
      }
    },
    [applyTiles],
  );

  const toggleRightSidebar = useCallback(() => {
    if (changesWindowOpenRef.current) {
      closeChangesOverlay(false);
      return;
    }
    const current = tilesRef.current;
    if (current.visible.length === 0 && current.minimized.length === 0) {
      return;
    }
    const next = !rightRegionHiddenRef.current;
    if (!next && current.visible.includes("changes")) {
      onRevealChanges();
    }
    setRightRegionHidden(next);
  }, [closeChangesOverlay, onRevealChanges]);

  const hideRightRegion = useCallback(() => {
    setRightRegionHidden(true);
  }, []);

  const toggleRightSurface = useCallback(
    (surface: RightSidebarSurface) => {
      if (surface === "changes" && changesWindowOpenRef.current) {
        closeChangesOverlay(true);
        return;
      }
      const current = tilesRef.current;
      const wasOpen = isTileOpen(current, surface);
      applyTiles(toggleTile(current, surface));
      if (!wasOpen) {
        setRightRegionHidden(false);
        setChangesWindowOpen(false);
        if (surface === "changes") {
          onRevealChanges();
        }
      }
    },
    [applyTiles, closeChangesOverlay, onRevealChanges],
  );

  const revealRightSurface = useCallback(
    (surface: RightSidebarSurface) => {
      if (surface === "changes") {
        dockChanges();
        return;
      }
      setChangesWindowOpen(false);
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
      if (surface === "changes" && changesWindowOpenRef.current) {
        closeChangesOverlay(true);
        return;
      }
      applyTiles(activateTile(tilesRef.current, surface));
      setRightRegionHidden(false);
    },
    [applyTiles, closeChangesOverlay],
  );

  const setRightTileSplit = useCallback(
    (ratio: number) => {
      applyTiles(setTileSplit(tilesRef.current, ratio));
    },
    [applyTiles],
  );

  const closeChangesWindow = useCallback(() => {
    setChangesWindowOpen(false);
  }, []);

  return {
    sidebarCollapsed,
    rightRegionHidden,
    rightSidebarTiles,
    changesWindowOpen,
    toggleSidebar,
    toggleRightSidebar,
    hideRightRegion,
    dockChanges,
    expandChangesOverlay,
    closeChangesOverlay,
    toggleRightSurface,
    revealRightSurface,
    closeRightSurface,
    minimizeRightSurface,
    activateRightSurface,
    setRightTileSplit,
    revealChanges,
    closeChangesWindow,
  };
}
