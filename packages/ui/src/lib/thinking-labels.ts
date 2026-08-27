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

/** 0–1 intensity of the current choice within the available ladder. */
export function thinkingIntensity(
  level: ThinkingLevel,
  available: readonly ThinkingLevel[],
): number {
  if (available.length <= 1) {
    return level === "off" || level === "none" ? 0 : 1;
  }
  const index = available.indexOf(level);
  if (index < 0) {
    return 0;
  }
  return index / (available.length - 1);
}

export function thinkingHint(intensity: number, atMax: boolean): string {
  if (atMax || intensity >= 0.95) {
    return "Consumes usage limits faster";
  }
  if (intensity <= 0.01) {
    return "No extended thinking";
  }
  if (intensity < 0.34) {
    return "Faster responses";
  }
  if (intensity < 0.67) {
    return "Balanced reasoning";
  }
  return "Deeper reasoning";
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
