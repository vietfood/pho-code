import { type CxOptions, cx } from "class-variance-authority";
import { twMerge } from "tailwind-merge";

// cn() adapted from refs/t3code/apps/web/src/lib/utils.ts (MIT, T3 Tools Inc., 6bc6cb6).

export function cn(...inputs: CxOptions): string {
  return twMerge(cx(inputs));
}
