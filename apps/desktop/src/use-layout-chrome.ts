import { useCallback, useRef, useState } from "react";
import {
  readRightSidebarCollapsed,
  readSidebarCollapsed,
  writeRightSidebarCollapsed,
  writeSidebarCollapsed,
  type RightSidebarSurface,
} from "@pho-code/ui";

export interface LayoutChrome {
  sidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  rightSidebarSurface: RightSidebarSurface;
  changesWindowOpen: boolean;
  toggleSidebar(): void;
  /** Collapse/expand the right sidebar, or dismiss the overlay when one is open. */
  toggleRightSidebar(): void;
  collapseRightSidebar(): void;
  /** Show Changes docked in the right sidebar and load the latest review. */
  dockChanges(): void;
  /** Float Changes as an overlay, leaving the sidebar collapsed behind it. */
  expandChangesOverlay(): void;
  closeChangesOverlay(restoreSidebar: boolean): void;
  selectRightSurface(next: RightSidebarSurface): void;
  /** Show the docked Changes surface without asking for the latest review. */
  revealChanges(): void;
  closeChangesWindow(): void;
}

/**
 * Owns the window chrome: sidebar collapse, the right-sidebar surface, and the
 * floating Changes overlay.
 *
 * Collapse state is persisted, and every path that changes it must also write
 * it — that pairing was previously repeated at each call site, where missing
 * the write silently lost the preference across relaunch. `onRevealChanges`
 * runs whenever the Changes surface becomes visible.
 */
export function useLayoutChrome(onRevealChanges: () => void): LayoutChrome {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed());
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(() => readRightSidebarCollapsed());
  const [rightSidebarSurface, setRightSidebarSurface] = useState<RightSidebarSurface>("changes");
  const [changesWindowOpen, setChangesWindowOpen] = useState(false);

  const changesWindowOpenRef = useRef(changesWindowOpen);
  changesWindowOpenRef.current = changesWindowOpen;
  const rightSidebarSurfaceRef = useRef(rightSidebarSurface);
  rightSidebarSurfaceRef.current = rightSidebarSurface;

  const applyRightCollapsed = useCallback((next: boolean) => {
    setRightSidebarCollapsed(next);
    writeRightSidebarCollapsed(next);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      writeSidebarCollapsed(next);
      return next;
    });
  }, []);

  const revealChanges = useCallback(() => {
    setRightSidebarSurface("changes");
    applyRightCollapsed(false);
    setChangesWindowOpen(false);
  }, [applyRightCollapsed]);

  const dockChanges = useCallback(() => {
    revealChanges();
    onRevealChanges();
  }, [onRevealChanges, revealChanges]);

  const expandChangesOverlay = useCallback(() => {
    setRightSidebarSurface("changes");
    applyRightCollapsed(true);
    setChangesWindowOpen(true);
    onRevealChanges();
  }, [applyRightCollapsed, onRevealChanges]);

  const closeChangesOverlay = useCallback(
    (restoreSidebar: boolean) => {
      setChangesWindowOpen(false);
      if (restoreSidebar) {
        applyRightCollapsed(false);
      }
    },
    [applyRightCollapsed],
  );

  const toggleRightSidebar = useCallback(() => {
    if (changesWindowOpenRef.current) {
      closeChangesOverlay(false);
      return;
    }
    setRightSidebarCollapsed((current) => {
      const next = !current;
      writeRightSidebarCollapsed(next);
      if (!next && rightSidebarSurfaceRef.current === "changes") {
        onRevealChanges();
      }
      return next;
    });
  }, [closeChangesOverlay, onRevealChanges]);

  const collapseRightSidebar = useCallback(() => {
    applyRightCollapsed(true);
  }, [applyRightCollapsed]);

  const selectRightSurface = useCallback(
    (next: RightSidebarSurface) => {
      if (next === "changes") {
        dockChanges();
        return;
      }
      setChangesWindowOpen(false);
      setRightSidebarSurface(next);
      applyRightCollapsed(false);
    },
    [applyRightCollapsed, dockChanges],
  );

  const closeChangesWindow = useCallback(() => {
    setChangesWindowOpen(false);
  }, []);

  return {
    sidebarCollapsed,
    rightSidebarCollapsed,
    rightSidebarSurface,
    changesWindowOpen,
    toggleSidebar,
    toggleRightSidebar,
    collapseRightSidebar,
    dockChanges,
    expandChangesOverlay,
    closeChangesOverlay,
    selectRightSurface,
    revealChanges,
    closeChangesWindow,
  };
}
