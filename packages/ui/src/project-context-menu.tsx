import { useEffect, useRef } from "react";
import { compactPath } from "./lib/compact-path";
import { copyText } from "./lib/clipboard";

export function ProjectContextMenu({
  x,
  y,
  path,
  busy,
  onNewSession,
  onRemove,
  onClose,
}: {
  x: number;
  y: number;
  path: string;
  busy: boolean;
  onNewSession: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      data-testid="project-context-menu"
      className="session-context-menu"
      style={{ left: x, top: y }}
    >
      <button
        type="button"
        role="menuitem"
        data-testid="project-new-session"
        className="session-context-menu__item"
        disabled={busy}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onNewSession();
          onClose();
        }}
      >
        New session
      </button>
      <button
        type="button"
        role="menuitem"
        data-testid="show-project-path"
        className="session-context-menu__item session-context-menu__item--stacked"
        title={path}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void copyText(path);
          onClose();
        }}
      >
        <span>Copy pathname</span>
        <span className="session-context-menu__item-meta">{compactPath(path, 36)}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        data-testid="remove-project"
        className="session-context-menu__item session-context-menu__item--danger"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRemove();
          onClose();
        }}
      >
        Remove project
      </button>
    </div>
  );
}
