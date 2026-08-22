import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Menu chrome adapted from Beautiful UI PromptBar.tsx (MIT, Shane Levine):
// one gliding highlight and a pop-in panel. Dictation, glimm sweep, and
// demo catalogs stay omitted.

export function ComposerPickerMenu({
  label,
  testId,
  hint,
  activeIndex,
  itemCount,
  listKey,
  children,
}: {
  label: string;
  testId: string;
  hint: string;
  activeIndex: number;
  itemCount: number;
  listKey: string;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [rowBox, setRowBox] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || itemCount <= 0) {
      setRowBox(null);
      return;
    }
    const target = list.querySelectorAll<HTMLElement>('[role="option"]')[activeIndex];
    if (!target) {
      setRowBox(null);
      return;
    }
    setRowBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [activeIndex, itemCount, listKey]);

  return (
    <div className="composer-picker-menu" data-testid={testId}>
      <div ref={listRef} className="composer-picker-list" role="listbox" aria-label={label}>
        <span
          aria-hidden="true"
          className="composer-picker-glide"
          data-testid="composer-picker-glide"
          style={{
            top: rowBox?.top ?? 0,
            height: rowBox?.height ?? 0,
            opacity: rowBox ? 1 : 0,
          }}
        />
        {children}
      </div>
      <div className="composer-picker-hint">{hint}</div>
    </div>
  );
}
