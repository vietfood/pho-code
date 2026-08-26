import { useState } from "react";
import {
  SKILL_SOURCE_LABELS,
  sourceCompatibilityWarnings,
  type ExternalSkillSourceId,
  type SkillCompatibility,
  type SkillInventoryEntry,
  type SkillSettingsSnapshot,
  type UpdateSkillSourceSettingsInput,
} from "@pho-code/protocol";
import { Button } from "./ui/button";
import { SkillCompatibilityDialog } from "./skill-compatibility-dialog";
import { SkillSourceIcon } from "./skill-source-icon";
import { SettingsDisclosure } from "./settings-disclosure";

const COMPATIBILITY_LABELS: Record<SkillCompatibility, string> = {
  compatible: "Compatible",
  limited: "Limited",
  incompatible: "Incompatible",
  shadowed: "Shadowed",
};

export function SkillsSettingsSection({
  skills,
  busy,
  onSourceChange,
  onRefresh,
}: {
  skills: SkillSettingsSnapshot;
  busy: boolean;
  onSourceChange: (input: UpdateSkillSourceSettingsInput) => void;
  onRefresh: () => void;
}) {
  const [pendingEnable, setPendingEnable] = useState<ExternalSkillSourceId | null>(null);
  const pendingWarnings = pendingEnable ? sourceCompatibilityWarnings(skills, pendingEnable) : [];

  return (
    <section className="grid gap-3" aria-labelledby="skills-heading" data-testid="skill-settings">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1">
          <h2 id="skills-heading" className="text-sm font-medium">Skills</h2>
          <SettingsDisclosure label="About skill trust" text={skills.trustNotice} testId="skill-trust-disclosure" />
        </div>
        <Button size="sm" variant="outline" disabled={busy} data-testid="refresh-skills" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      <div className="grid gap-2">
        {skills.sources.map((source) => {
          const locked = source.sourceId === "pho-code";
          return (
            <label
              key={source.sourceId}
              className="glass-panel flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              data-testid={`skill-source-${source.sourceId}`}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={source.enabled}
                disabled={busy || locked}
                data-testid={`skill-source-enabled-${source.sourceId}`}
                onChange={(event) => {
                  if (locked) {
                    return;
                  }
                  const enabled = event.target.checked;
                  const sourceId = source.sourceId as ExternalSkillSourceId;
                  if (enabled && sourceCompatibilityWarnings(skills, sourceId).length > 0) {
                    setPendingEnable(sourceId);
                    return;
                  }
                  onSourceChange({ sourceId, enabled });
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <SkillSourceIcon sourceId={source.sourceId} className="size-5" />
                  <strong className="font-medium">{source.label}</strong>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {source.rootLabel}
                  {source.available ? "" : " · not found"}
                  {` · ${source.compatibleCount}/${source.skillCount} compatible`}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="grid gap-2" data-testid="skill-inventory">
        <h3 className="text-xs font-medium text-muted-foreground">Inventory</h3>
        {skills.inventory.length === 0 ? (
          <p className="text-xs text-muted-foreground">No skills discovered yet.</p>
        ) : (
          skills.inventory.map((entry) => <SkillInventoryRow key={`${entry.sourceId}:${entry.skillName}`} entry={entry} />)
        )}
      </div>
      {pendingEnable ? (
        <SkillCompatibilityDialog
          title={`Some ${SKILL_SOURCE_LABELS[pendingEnable]} skills aren't fully compatible`}
          message={`${pendingWarnings.length} skill${pendingWarnings.length === 1 ? "" : "s"} in ${SKILL_SOURCE_LABELS[pendingEnable]} include scripts, executables, or invalid Markdown. Enabling the source makes all of its skills available in /. Pho Code will not run those scripts or assets.`}
          confirmLabel="Enable anyway"
          onCancel={() => setPendingEnable(null)}
          onConfirm={() => {
            const sourceId = pendingEnable;
            setPendingEnable(null);
            onSourceChange({ sourceId, enabled: true });
          }}
        />
      ) : null}
    </section>
  );
}

function SkillInventoryRow({ entry }: { entry: SkillInventoryEntry }) {
  return (
    <div
      className="grid gap-1 rounded-lg border border-border px-3 py-2"
      data-testid={`skill-inventory-${entry.sourceId}-${entry.skillName}`}
    >
      <div className="flex items-center gap-2 text-sm">
        <SkillSourceIcon sourceId={entry.sourceId} className="size-5" />
        <span className="min-w-0 flex-1 truncate font-medium">{entry.displayName}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{COMPATIBILITY_LABELS[entry.compatibility]}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {SKILL_SOURCE_LABELS[entry.sourceId]}
        {entry.description ? ` · ${entry.description}` : ""}
      </p>
      {entry.reason ? <p className="text-xs text-warning">{entry.reason}</p> : null}
    </div>
  );
}
