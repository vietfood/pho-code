import type { SkillSourceId } from "@pho-code/protocol";
import { SKILL_SOURCE_LABELS } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { ProviderIcon } from "./provider-icon";

const MONOGRAMS: Record<Extract<SkillSourceId, "pho-code" | "pi">, string> = {
  "pho-code": "Ph",
  pi: "Pi",
};

export function SkillSourceIcon({
  sourceId,
  className,
}: {
  sourceId: SkillSourceId;
  className?: string;
}) {
  switch (sourceId) {
    case "codex":
      return <ProviderIcon provider="openai-codex" className={className} />;
    case "claude":
      return <ProviderIcon provider="anthropic" className={className} />;
    case "cursor":
      return <ProviderIcon provider="cursor" className={className} title={SKILL_SOURCE_LABELS[sourceId]} />;
    case "pho-code":
    case "pi":
      return (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-accent font-medium text-[10px] text-foreground",
            className,
          )}
          title={SKILL_SOURCE_LABELS[sourceId]}
        >
          {MONOGRAMS[sourceId]}
        </span>
      );
    default: {
      const exhaustive: never = sourceId;
      return exhaustive;
    }
  }
}
