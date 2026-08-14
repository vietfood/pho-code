import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clampMenuPosition } from "./lib/clamp-menu-position";
import { documentBodyPortalTarget } from "./lib/document-body-portal";

// Portal to document.body so sidebar overflow/backdrop-filter cannot clip the menu.

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
      className="session-context-menu"
      style={{ left: x, top: y }}
    >
      {children}
    </div>
  );
  const target = documentBodyPortalTarget();
  return target ? createPortal(menu, target) : menu;
}
