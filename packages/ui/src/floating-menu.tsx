import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./lib/cn";
import { clampMenuPosition } from "./lib/clamp-menu-position";
import { documentBodyPortalTarget } from "./lib/document-body-portal";

// Portal to document.body so sidebar overflow/backdrop-filter cannot clip the menu.
// Item chrome (inset hover pill, grouped separators, trailing single-key hints)
// follows the desktop menu shape recorded in
// docs/ui/logs/2026-08-21-change-sidebar-claude-layout.md.

function menuItems(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'));
}

export function FloatingMenu({
  x,
  y,
  testId,
  onClose,
  children,
}: {
  x: number;
  y: number;
  testId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  const moveFocus = useCallback((step: 1 | -1) => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    const items = menuItems(menu);
    if (items.length === 0) {
      return;
    }
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = current < 0 ? (step === 1 ? 0 : items.length - 1) : (current + step + items.length) % items.length;
    items[next]?.focus();
  }, []);

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
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) {
        return;
      }
      const menu = menuRef.current;
      const shortcut = menu?.querySelector<HTMLButtonElement>(
        `[role="menuitem"][data-menu-key="${event.key.toLowerCase()}"]:not([disabled])`,
      );
      if (shortcut) {
        event.preventDefault();
        shortcut.click();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [moveFocus, onClose]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    const rect = menu.getBoundingClientRect();
    const next = clampMenuPosition(
      { x, y },
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    menu.style.left = `${next.x}px`;
    menu.style.top = `${next.y}px`;
  }, [x, y]);

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      data-testid={testId}
      className="app-menu"
      style={{ left: x, top: y }}
    >
      {children}
    </div>
  );
  const target = documentBodyPortalTarget();
  return target ? createPortal(menu, target) : menu;
}

export function MenuItem({
  label,
  detail,
  shortcut,
  testId,
  danger = false,
  disabled = false,
  title,
  onSelect,
  onClose,
}: {
  label: string;
  detail?: string;
  shortcut?: string;
  testId: string;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      data-menu-key={shortcut ? shortcut.toLowerCase() : undefined}
      className={cn("app-menu__item", danger && "app-menu__item--danger")}
      disabled={disabled}
      title={title}
      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
        onClose();
      }}
    >
      <span className="app-menu__text">
        <span className="app-menu__label">{label}</span>
        {detail ? <span className="app-menu__detail">{detail}</span> : null}
      </span>
      {shortcut ? <span className="app-menu__key">{shortcut}</span> : null}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="app-menu__separator" />;
}
