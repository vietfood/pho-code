import { compactPath } from "./lib/compact-path";
import { copyText } from "./lib/clipboard";
import { FloatingMenu } from "./floating-menu";

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
    </FloatingMenu>
  );
}
