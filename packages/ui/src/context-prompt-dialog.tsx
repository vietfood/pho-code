import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import {
  CONTEXT_PROMPT_SECTION_KINDS,
  type ContextPromptSection,
  type ContextPromptSectionKind,
  type SessionContextPrompt,
} from "@pho-code/protocol";
import { handleDialogTab } from "./lib/dialog-focus";
import { cn } from "./lib/cn";
import { Button } from "./ui/button";

export function ContextPromptDialog({
  contextPrompt,
  busy = false,
  onSave,
  onReset,
  onClose,
}: {
  contextPrompt: SessionContextPrompt;
  busy?: boolean;
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
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
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
  }, [busy, onClose]);

  const sections = useMemo(
    () => contextPrompt.sections.map((section) => ({ ...section, enabled: !disabledIds.has(section.id) })),
    [contextPrompt.sections, disabledIds],
  );
  const groups = useMemo(() => groupSections(sections), [sections]);

  function toggleSection(id: string) {
    if (!editable) {
      return;
    }
    setDisabledIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleGroup(kind: ContextPromptSectionKind) {
    if (!editable) {
      return;
    }
    const ids = sections.filter((section) => section.kind === kind).map((section) => section.id);
    const allEnabled = ids.every((id) => !disabledIds.has(id));
    setDisabledIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (allEnabled) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
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
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="context-prompt-heading"
        data-testid="context-prompt-dialog"
        className="context-prompt-dialog flex w-[min(40rem,calc(100dvw-2rem))] max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
        onKeyDown={(event) => {
          if (dialogRef.current) {
            handleDialogTab(event.nativeEvent, dialogRef.current);
          }
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-3.5 pt-3.5">
          <div className="min-w-0">
            <h2 id="context-prompt-heading" className="text-[13px] font-medium tracking-tight">
              Context prompt
            </h2>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {editable
                ? "This chat starts with the default system prompt. Edit the preamble and turn sections off before the first message. That compiled prompt is what this session sends."
                : "This session’s system prompt is frozen. You can inspect it, but it cannot be changed after the first message."}
            </p>
          </div>
          {contextPrompt.customized ? (
            <span
              className="shrink-0 rounded-full bg-accent px-1.5 py-px text-[10px] font-medium tracking-wide"
              data-testid="context-prompt-customized"
            >
              Custom
            </span>
          ) : (
            <span
              className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground"
              data-testid="context-prompt-default"
            >
              Default
            </span>
          )}
        </div>
        <label className="grid shrink-0 gap-1 px-3.5 pt-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Preamble</span>
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
  const enabledCount = group.sections.filter((section) => section.enabled).length;
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
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {enabledCount}/{group.sections.length}
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

function groupSections(sections: readonly ContextPromptSection[]): ContextPromptGroup[] {
  const groups: ContextPromptGroup[] = [];
  for (const kind of CONTEXT_PROMPT_SECTION_KINDS) {
    const grouped = sections.filter((section) => section.kind === kind);
    if (grouped.length === 0) {
      continue;
    }
    groups.push({ kind, label: sectionGroupLabel(kind), sections: grouped });
  }
  return groups;
}

function sectionGroupLabel(kind: ContextPromptSectionKind): string {
  switch (kind) {
    case "agents":
      return "Context files";
    case "tool":
      return "Tools";
    case "optional":
      return "Optional";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
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
