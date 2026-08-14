import { FloatingMenu } from "./floating-menu";

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
  return (
    <FloatingMenu x={x} y={y} testId="session-context-menu" onClose={onClose}>
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
    </FloatingMenu>
  );
}
