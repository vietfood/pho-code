import { SKILL_SOURCE_LABELS, formatSkillToken, type SkillSourceId } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { SkillSourceIcon } from "./skill-source-icon";

export function SkillChip({
  sourceId,
  skillName,
  className,
}: {
  sourceId: SkillSourceId;
  skillName: string;
  className?: string;
}) {
  const token = formatSkillToken(sourceId, skillName);
  return (
    <span
      className={cn("mention-chip skill-chip", className)}
      data-skill-source={sourceId}
      data-skill-name={skillName}
      title={`${SKILL_SOURCE_LABELS[sourceId]} · ${skillName}`}
      aria-label={token}
    >
      <SkillSourceIcon sourceId={sourceId} className="mention-chip-icon size-3" />
      <span className="mention-chip-label">{skillName}</span>
    </span>
  );
}
