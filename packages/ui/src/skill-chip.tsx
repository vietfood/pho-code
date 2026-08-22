import { SKILL_SOURCE_LABELS, formatSkillToken, type SkillSourceId } from "@pho-code/protocol";
import { InlineChip } from "./inline-chip-shell";
import { cn } from "./lib/cn";

export function SkillChip({
  sourceId,
  skillName,
  className,
}: {
  sourceId: SkillSourceId;
  skillName: string;
  className?: string;
}) {
  return (
    <InlineChip
      className={cn("skill-chip", className)}
      data={{ "data-skill-source": sourceId, "data-skill-name": skillName }}
      title={`${SKILL_SOURCE_LABELS[sourceId]} · ${skillName}`}
      ariaLabel={formatSkillToken(sourceId, skillName)}
      label={skillName}
    />
  );
}
