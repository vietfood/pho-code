/** Distance from the bottom (px) that still counts as "following" the live transcript. */
export const STICK_TO_BOTTOM_THRESHOLD_PX = 80;

export function isNearBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  thresholdPx = STICK_TO_BOTTOM_THRESHOLD_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= thresholdPx;
}
