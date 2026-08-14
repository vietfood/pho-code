export function clampMenuPosition(
  preferred: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  padding = 4,
): { x: number; y: number } {
  const maxX = Math.max(padding, viewport.width - size.width - padding);
  const maxY = Math.max(padding, viewport.height - size.height - padding);
  return {
    x: Math.min(Math.max(padding, preferred.x), maxX),
    y: Math.min(Math.max(padding, preferred.y), maxY),
  };
}
