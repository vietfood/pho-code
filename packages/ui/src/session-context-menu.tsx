import { FloatingMenu, MenuItem, MenuSeparator } from "./floating-menu";

// Right-click session actions adapted from refs/pi-gui ThreadSessionRow
// onContextMenu / use-thread-menu (MIT). Rename, pin, mark-read, and copy
// session id omitted; Restore appears only for archived chats. Label-first
// rows with a trailing single-key hint and a separated destructive group are
// harness-owned chrome.

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
        <MenuItem
          label="Restore chat"
          shortcut="R"
          testId="restore-session"
          onSelect={() => onRestore?.()}
          onClose={onClose}
        />
      ) : (
        <MenuItem
          label="Archive chat"
          shortcut="A"
          testId="archive-session"
          onSelect={() => onArchive?.()}
          onClose={onClose}
        />
      )}
      <MenuSeparator />
      <MenuItem
        label="Move chat to Trash"
        shortcut="D"
        testId="remove-session"
        danger
        onSelect={onRemove}
        onClose={onClose}
      />
    </FloatingMenu>
  );
}
