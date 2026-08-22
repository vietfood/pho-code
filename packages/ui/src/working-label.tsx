import { cn } from "./lib/cn";
import { SparkleIcon } from "./sparkle-icon";

export function WorkingLabel({ text, live }: { text: string; live: boolean }) {
  return (
    <span className="working-label">
      <SparkleIcon className={cn("working-label-star", live ? "is-live" : "is-settled")} />
      <span
        className={cn("min-w-0 truncate font-medium", live && "working-shimmer")}
        {...(live ? { role: "status" } : {})}
      >
        {text}
      </span>
    </span>
  );
}
