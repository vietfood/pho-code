let started = false;

/** Load KaTeX CSS once, and only when a settled message actually contains math. */
export function ensureKatexCss(): void {
  if (started) {
    return;
  }
  started = true;
  // Dedicated module so Vite can split the stylesheet off the default renderer chunk.
  void import("./katex-css");
}
