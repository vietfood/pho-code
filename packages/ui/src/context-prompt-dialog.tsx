import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import {
  CONTEXT_PROMPT_SECTION_KINDS,
  type ContextPromptSection,
  type ContextPromptSectionKind,
  type SessionContextPrompt,
} from "@pho-code/protocol";
import { handleDialogTab } from "./lib/dialog-focus";
import { formatTokenCount } from "./lib/format-tokens";
import { cn } from "./lib/cn";
import { Button } from "./ui/button";

export function ContextPromptDialog({
  contextPrompt,
  busy = false,
  embedded = false,
  onSave,
  onReset,
  onClose,
}: {
  contextPrompt: SessionContextPrompt;
  busy?: boolean;
  embedded?: boolean;
  onSave?: (input: { preamble: string; disabledSectionIds: string[] }) => void | Promise<void>;
  onReset?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const editable = contextPrompt.editable;
  const [preamble, setPreamble] = useState(contextPrompt.preamble);
  const [disabledIds, setDisabledIds] = useState(() => disabledSet(contextPrompt.sections));
  const [expanded, setExpanded] = useState<string | null>(null);

  const sectionSync = contextPrompt.sections.map((section) => `${section.id}:${section.enabled}`).join("|");

  useEffect(() => {
    setPreamble(contextPrompt.preamble);
    setDisabledIds(disabledSet(contextPrompt.sections));
  }, [contextPrompt.preamble, contextPrompt.customized, contextPrompt.editable, sectionSync]);

  useEffect(() => {
    if (embedded) {
      return;
    }
    closeRef.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [busy, embedded, onClose]);

  const sections = useMemo(
    () => contextPrompt.sections.map((section) => ({ ...section, enabled: !disabledIds.has(section.id) })),
    [contextPrompt.sections, disabledIds],
  );
  const groups = useMemo(() => groupSections(sections), [sections]);

  function mutateDisabledIds(mutate: (next: Set<string>) => void) {
    if (!editable) {
      return;
    }
    setDisabledIds((current) => {
      const next = new Set(current);
      mutate(next);
      return next;
    });
  }

  function toggleSection(id: string) {
    mutateDisabledIds((next) => {
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
    });
  }

  function toggleGroup(kind: ContextPromptSectionKind) {
    const ids = sections.filter((section) => section.kind === kind).map((section) => section.id);
    const allEnabled = ids.every((id) => !disabledIds.has(id));
    mutateDisabledIds((next) => {
      for (const id of ids) {
        if (allEnabled) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
    });
  }

  const panel = (
      <section
        ref={dialogRef}
        {...(embedded
          ? {}
          : {
              role: "dialog" as const,
              "aria-modal": true as const,
              onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
                if (dialogRef.current) {
                  handleDialogTab(event.nativeEvent, dialogRef.current);
                }
              },
            })}
        aria-labelledby="context-prompt-heading"
        data-testid="context-prompt-dialog"
        className={cn(
          "context-prompt-dialog flex flex-col overflow-hidden bg-background",
          embedded
            ? "h-full min-h-0 min-w-0 flex-1"
            : "w-[min(40rem,calc(100dvw-2rem))] max-h-[calc(100dvh-2rem)] rounded-xl border border-border shadow-lg",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-3.5 pt-3.5">
          <h2 id="context-prompt-heading" className="min-w-0 text-[13px] font-medium tracking-tight">
            Context prompt
          </h2>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium tracking-wide",
              contextPrompt.customized ? "bg-accent" : "bg-muted text-muted-foreground",
            )}
            data-testid={contextPrompt.customized ? "context-prompt-customized" : "context-prompt-default"}
          >
            {contextPrompt.customized ? "Custom" : "Default"}
          </span>
        </div>
        <label className="grid shrink-0 gap-1 px-3.5 pt-2.5">
          <span className="flex items-baseline justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Preamble
            <span
              className="font-mono text-[10px] font-normal normal-case tabular-nums tracking-normal"
              data-testid="context-prompt-preamble-size"
              title={`${preamble.length.toLocaleString()} characters`}
            >
              {formatTokenCount(preamble.length)}
            </span>
          </span>
          <textarea
            className="context-prompt-preamble"
            data-testid="context-prompt-preamble"
            value={preamble}
            readOnly={!editable}
            disabled={busy}
            rows={4}
            onChange={(event) => setPreamble(event.target.value)}
          />
        </label>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-2.5"
          data-testid="context-prompt-sections"
        >
          {groups.map((group) => (
            <ContextPromptSectionGroup
              key={group.kind}
              group={group}
              editable={editable}
              busy={busy}
              expanded={expanded}
              onToggleGroup={() => toggleGroup(group.kind)}
              onToggleSection={toggleSection}
              onExpand={(id) => setExpanded((current) => (current === id ? null : id))}
            />
          ))}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-3.5 py-2.5">
          {editable && onReset ? (
            <Button
              size="sm"
              variant="ghost"
              data-testid="context-prompt-reset"
              disabled={busy || !contextPrompt.customized}
              onClick={() => {
                void onReset();
              }}
            >
              Reset
            </Button>
          ) : null}
          <Button
            ref={closeRef}
            size="sm"
            variant="outline"
            data-testid="context-prompt-close"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </Button>
          {editable && onSave ? (
            <Button
              size="sm"
              data-testid="context-prompt-save"
              disabled={busy}
              onClick={() => {
                void onSave({ preamble, disabledSectionIds: [...disabledIds] });
              }}
            >
              Save
            </Button>
          ) : null}
        </div>
      </section>
  );

  if (embedded) {
    return panel;
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      data-testid="context-prompt-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      {panel}
    </div>
  );
}

function ContextPromptSectionGroup({
  group,
  editable,
  busy,
  expanded,
  onToggleGroup,
  onToggleSection,
  onExpand,
}: {
  group: ContextPromptGroup;
  editable: boolean;
  busy: boolean;
  expanded: string | null;
  onToggleGroup: () => void;
  onToggleSection: (id: string) => void;
  onExpand: (id: string) => void;
}) {
  let enabledCount = 0;
  let enabledChars = 0;
  for (const section of group.sections) {
    if (!section.enabled) {
      continue;
    }
    enabledCount += 1;
    enabledChars += section.body.length;
  }
  const allEnabled = enabledCount === group.sections.length;
  const mixed = enabledCount > 0 && !allEnabled;
  const headingId = `context-prompt-group-heading-${group.kind}`;
  return (
    <section
      className="context-prompt-group"
      data-testid={`context-prompt-group-${group.kind}`}
      aria-labelledby={headingId}
    >
      <div className="context-prompt-group__heading">
        <input
          type="checkbox"
          className="context-prompt-section__toggle"
          data-testid={`context-prompt-group-toggle-${group.kind}`}
          checked={allEnabled}
          disabled={busy || !editable}
          aria-label={`Include all ${group.label.toLowerCase()}`}
          ref={(node) => {
            if (node) {
              node.indeterminate = mixed;
            }
          }}
          onChange={onToggleGroup}
        />
        <h3 id={headingId} className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {group.label}
        </h3>
        <span
          className="font-mono text-[10px] tabular-nums text-muted-foreground"
          data-testid={`context-prompt-group-size-${group.kind}`}
          title={`${enabledChars.toLocaleString()} characters included`}
        >
          {formatTokenCount(enabledChars)} · {enabledCount}/{group.sections.length}
        </span>
      </div>
      <ul className="list-none">
        {group.sections.map((section) => (
          <ContextPromptSectionRow
            key={section.id}
            section={section}
            expanded={expanded === section.id}
            editable={editable}
            busy={busy}
            onToggle={() => onToggleSection(section.id)}
            onExpand={() => onExpand(section.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function ContextPromptSectionRow({
  section,
  expanded,
  editable,
  busy,
  onToggle,
  onExpand,
}: {
  section: ContextPromptSection;
  expanded: boolean;
  editable: boolean;
  busy: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  const toggleId = `context-prompt-toggle-${section.id}`;
  const secondary = sectionSecondary(section);
  return (
    <li className={cn("context-prompt-section", section.enabled ? "is-on" : "is-off")}>
      <div className="flex items-center gap-1.5 px-2 py-1">
        <input
          id={toggleId}
          type="checkbox"
          className="context-prompt-section__toggle"
          data-testid={`context-prompt-chip-${section.id}`}
          data-kind={section.kind}
          checked={section.enabled}
          disabled={busy || !editable}
          onChange={onToggle}
        />
        <label htmlFor={toggleId} className={cn("min-w-0 flex-1", editable ? "cursor-pointer" : "cursor-default")}>
          <span className="block truncate text-[12px] font-medium leading-4">{section.title}</span>
          {secondary ? (
            <span className="block truncate font-mono text-[10px] leading-3 text-muted-foreground">{secondary}</span>
          ) : null}
        </label>
        <span
          className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground"
          data-testid={`context-prompt-size-${section.id}`}
          title={`${section.body.length.toLocaleString()} characters`}
        >
          {formatTokenCount(section.body.length)}
        </span>
        <button
          type="button"
          className="context-prompt-expand"
          data-testid={`context-prompt-expand-${section.id}`}
          aria-expanded={expanded}
          onClick={onExpand}
        >
          {expanded ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
          <span className="sr-only">Expand {section.title}</span>
        </button>
      </div>
      {expanded ? (
        <pre className="context-prompt-body" data-testid={`context-prompt-body-${section.id}`}>
          {section.body}
        </pre>
      ) : null}
    </li>
  );
}

interface ContextPromptGroup {
  kind: ContextPromptSectionKind;
  label: string;
  sections: ContextPromptSection[];
}

const SECTION_GROUP_LABELS: Record<ContextPromptSectionKind, string> = {
  agents: "Context files",
  tool: "Tools",
  optional: "Optional",
};

function groupSections(sections: readonly ContextPromptSection[]): ContextPromptGroup[] {
  return CONTEXT_PROMPT_SECTION_KINDS.flatMap((kind) => {
    const grouped = sections.filter((section) => section.kind === kind);
    return grouped.length === 0 ? [] : [{ kind, label: SECTION_GROUP_LABELS[kind], sections: grouped }];
  });
}

function sectionSecondary(section: ContextPromptSection): string | undefined {
  if (section.kind !== "agents") {
    return undefined;
  }
  const relative = section.id.startsWith("agents:") ? section.id.slice("agents:".length) : section.title;
  return relative !== section.title ? relative : undefined;
}

function disabledSet(sections: readonly ContextPromptSection[]): Set<string> {
  return new Set(sections.filter((section) => !section.enabled).map((section) => section.id));
}
