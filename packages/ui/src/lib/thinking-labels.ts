import type { ThinkingLevel } from "@pho-code/protocol";

const LABELS: Record<ThinkingLevel, string> = {
  default: "Default",
  off: "Off",
  none: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
  ultra: "Ultra",
};

export function thinkingLevelLabel(level: ThinkingLevel): string {
  return LABELS[level] ?? level;
}

export function isMaxThinkingLevel(
  level: ThinkingLevel,
  available: readonly ThinkingLevel[],
): boolean {
  if (available.length === 0) {
    return false;
  }
  return available[available.length - 1] === level;
}
