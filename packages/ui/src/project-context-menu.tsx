import { compactPath } from "./lib/compact-path";
import { copyText } from "./lib/clipboard";
import { FloatingMenu, MenuItem, MenuSeparator } from "./floating-menu";

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
  return (
    <FloatingMenu x={x} y={y} testId="project-context-menu" onClose={onClose}>
      <MenuItem
        label="New session"
        shortcut="N"
        testId="project-new-session"
        disabled={busy}
        onSelect={onNewSession}
        onClose={onClose}
      />
      <MenuItem
        label="Copy pathname"
        detail={compactPath(path, 36)}
        shortcut="C"
        testId="show-project-path"
        title={path}
        onSelect={() => {
          void copyText(path);
        }}
        onClose={onClose}
      />
      <MenuSeparator />
      <MenuItem
        label="Remove project"
        shortcut="D"
        testId="remove-project"
        danger
        onSelect={onRemove}
        onClose={onClose}
      />
    </FloatingMenu>
  );
}
