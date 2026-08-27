import { useEffect, useRef, type RefObject } from "react";

/**
 * Shared popover dismissal: outside pointerdown or Escape while `open`.
 *
 * `onKeyDown` receives the keys Escape did not consume, so a caller can keep
 * menu-specific typeahead on the same listener and preserve handler ordering.
 * Escape's `preventDefault` is opt-in because only the composer chips need to
 * stop the key from reaching an enclosing surface.
 */
export function useDismissOnOutside({
  open,
  ref,
  onDismiss,
  preventDefaultOnEscape = false,
  onKeyDown,
}: {
  open: boolean;
  ref: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  preventDefaultOnEscape?: boolean;
  onKeyDown?: (event: KeyboardEvent) => void;
}): void {
  // Latch the callbacks so listeners bind once per `open` toggle, matching the
  // hand-written effects this replaces, without going stale.
  const latest = useRef({ onDismiss, onKeyDown });
  latest.current = { onDismiss, onKeyDown };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        latest.current.onDismiss();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (preventDefaultOnEscape) {
          event.preventDefault();
        }
        latest.current.onDismiss();
        return;
      }
      latest.current.onKeyDown?.(event);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, preventDefaultOnEscape, ref]);
}
