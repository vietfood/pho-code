import { useEffect, useRef } from "react";

// Right-click session actions adapted from refs/pi-gui ThreadSessionRow
// onContextMenu / use-thread-menu (MIT). Rename, pin, mark-read, and copy
// session id omitted; Restore appears only for archived chats.

export function SessionContextMenu({
  x,
  y,
  archived,
  onArchive,
  onRestore,
  onRemove,
  onClose,
}: {
  x: number;
  y: number;
  archived: boolean;
  onArchive?: () => void;
  onRestore?: () => void;
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
      data-testid="session-context-menu"
      className="session-context-menu"
      style={{ left: x, top: y }}
    >
      {archived ? (
        <button
          type="button"
          role="menuitem"
          data-testid="restore-session"
          className="session-context-menu__item"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRestore?.();
            onClose();
          }}
        >
          Restore chat
        </button>
      ) : (
        <button
          type="button"
          role="menuitem"
          data-testid="archive-session"
          className="session-context-menu__item"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onArchive?.();
            onClose();
          }}
        >
          Archive chat
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        data-testid="remove-session"
        className="session-context-menu__item session-context-menu__item--danger"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRemove();
          onClose();
        }}
      >
        Move chat to Trash
      </button>
    </div>
  );
}
