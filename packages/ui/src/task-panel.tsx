import { useEffect, useState } from "react";
import { CheckIcon, PencilIcon, PlusIcon, RotateCcwIcon, Trash2Icon, XIcon } from "lucide-react";
import {
  emptyTaskSnapshot,
  type AgentTaskSnapshot,
  type RecordOwnerVerificationInput,
  type TaskBriefContent,
  type VerificationOutcome,
} from "@pho-code/protocol";
import { Button } from "./ui/button";

interface TaskPanelProps {
  task?: AgentTaskSnapshot;
  idle?: boolean;
  busy?: boolean;
  onSave?: (content: TaskBriefContent, expectedRevision?: string, status?: "draft" | "active") => void | Promise<void>;
  onReset?: (expectedRevision?: string) => void | Promise<void>;
  onReopen?: () => void | Promise<void>;
  onRecordVerification?: (
    input: Pick<RecordOwnerVerificationInput, "criterionId" | "outcome" | "summary">,
  ) => void | Promise<void>;
  onAcceptGaps?: () => void | Promise<void>;
}

interface TaskDraft {
  objective: string;
  status: "draft" | "active";
  constraints: string;
  acceptanceCriteria: Array<{ id: string; text: string }>;
  assumptions: string;
  openQuestions: string;
  nonGoals: string;
}

const EMPTY_DRAFT: TaskDraft = {
  objective: "",
  status: "active",
  constraints: "",
  acceptanceCriteria: [{ id: "done", text: "" }],
  assumptions: "",
  openQuestions: "",
  nonGoals: "",
};

export function TaskPanel({
  task = emptyTaskSnapshot(),
  idle = true,
  busy = false,
  onSave,
  onReset,
  onReopen,
  onRecordVerification,
  onAcceptGaps,
}: TaskPanelProps) {
  const brief = task.brief;
  const editable = idle && !busy;
  const [editing, setEditing] = useState(!brief);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<TaskDraft>(() => draftFromBrief(brief));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [verification, setVerification] = useState<{
    criterionId: string;
    outcome: VerificationOutcome;
    summary: string;
  }>({ criterionId: "", outcome: "observed", summary: "" });

  useEffect(() => {
    setDraft(draftFromBrief(brief));
    setEditing(!brief);
    setValidationError(null);
    setVerification((current) => ({
      ...current,
      criterionId: brief?.acceptanceCriteria[0]?.id ?? "",
      summary: "",
    }));
  }, [brief?.revision]);

  async function run(work: () => void | Promise<void>): Promise<void> {
    setSaving(true);
    setValidationError(null);
    try {
      await work();
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "The task command failed.");
    } finally {
      setSaving(false);
    }
  }

  async function saveBrief(): Promise<void> {
    if (!onSave || !editable) return;
    const content = contentFromDraft(draft);
    if (!content.objective || content.acceptanceCriteria.some((criterion) => !criterion.id || !criterion.text)) {
      setValidationError("Add an objective and complete every acceptance criterion.");
      return;
    }
    await run(async () => {
      await onSave(content, brief?.revision, draft.status);
      setEditing(false);
    });
  }

  const completion = task.completion;
  const canAcceptGaps =
    editable &&
    completion?.status === "incomplete" &&
    completion.criteria.some((criterion) => criterion.outcome === "unverified") &&
    completion.criteria.every((criterion) => criterion.outcome !== "failed");

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      aria-labelledby="task-panel-heading"
      data-testid="task-panel"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-3.5 pt-3.5">
        <div className="flex min-w-0 items-center gap-1">
          <h2 id="task-panel-heading" className="text-[13px] font-medium tracking-tight">Task</h2>
          {brief && editable && !editing ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6 text-muted-foreground"
              aria-label="Edit Task Brief"
              data-testid="task-edit"
              onClick={() => setEditing(true)}
            >
              <PencilIcon className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
          {editing && brief ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6 text-muted-foreground"
              aria-label="Cancel Task Brief edit"
              disabled={saving}
              onClick={() => {
                setDraft(draftFromBrief(brief));
                setEditing(false);
              }}
            >
              <XIcon className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {brief?.status ?? "empty"}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3.5 py-3 text-xs">
        {editing ? (
          <TaskBriefEditor
            draft={draft}
            disabled={!editable || saving}
            onChange={setDraft}
            onSave={() => void saveBrief()}
          />
        ) : brief ? (
          <section data-testid="task-brief-summary">
            <SectionHeading>Brief</SectionHeading>
            <p className="mt-1.5 leading-relaxed text-foreground">{brief.objective}</p>
            <ol className="mt-2 space-y-1.5 ps-4">
              {brief.acceptanceCriteria.map((criterion) => (
                <li key={criterion.id}>
                  <span className="font-medium">{criterion.id}</span>: {criterion.text}
                </li>
              ))}
            </ol>
            {brief.constraints.length > 0 ? (
              <p className="mt-2 text-muted-foreground">Constraints: {brief.constraints.join(" · ")}</p>
            ) : null}
          </section>
        ) : (
          <p className="leading-relaxed text-muted-foreground">Create a living brief for nontrivial work. It defines outcomes; Plan still defines the approach.</p>
        )}

        <section data-testid="task-evidence">
          <SectionHeading>Evidence</SectionHeading>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Selected excerpts enter the model request as bounded, untrusted context.
          </p>
          {task.evidence ? (
            <div className="mt-2 space-y-2">
              {task.evidence.items.map((item) => (
                <article key={item.id} className="rounded-md border border-border/70 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <strong className="font-medium">{item.title}</strong>
                    <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{item.freshness}</span>
                  </div>
                  <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{item.excerpt}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{item.providerId} · {item.selectionReason}</p>
                </article>
              ))}
              <p className="text-[10px] text-muted-foreground">
                {task.evidence.characterCount.toLocaleString()} chars · ~{task.evidence.estimatedTokens.toLocaleString()} tokens
                {task.evidence.omittedCount ? ` · ${task.evidence.omittedCount} omitted` : ""}
                {task.evidence.failedProviders.length ? ` · ${task.evidence.failedProviders.length} provider failed` : ""}
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-muted-foreground">No evidence pack has been supplied for this session.</p>
          )}
        </section>

        <section data-testid="task-verification">
          <SectionHeading>Verification</SectionHeading>
          {task.verification.records.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {task.verification.records.map((record) => (
                <li key={record.id} className="rounded-md border border-border/70 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{record.criterionId ?? "General"}</span>
                    <span className="text-[10px] uppercase text-muted-foreground">{record.outcome} · {record.freshness}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed">{record.summary}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Source: {record.sourceAdapterId}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-muted-foreground">No authoritative verification has been recorded.</p>
          )}
          {brief && editable && onRecordVerification ? (
            <div className="mt-2 grid gap-2 rounded-md border border-border/70 p-2" data-testid="owner-verification-form">
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">Criterion</span>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2"
                    value={verification.criterionId}
                    disabled={saving}
                    onChange={(event) => setVerification({ ...verification, criterionId: event.target.value })}
                  >
                    <option value="">General</option>
                    {brief.acceptanceCriteria.map((criterion) => <option key={criterion.id} value={criterion.id}>{criterion.id}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">Outcome</span>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2"
                    value={verification.outcome}
                    disabled={saving}
                    onChange={(event) => setVerification({ ...verification, outcome: event.target.value as VerificationOutcome })}
                  >
                    <option value="observed">Observed</option>
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                    <option value="unverified">Unverified</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-1">
                <span className="text-[10px] font-medium uppercase text-muted-foreground">Owner note</span>
                <textarea
                  className="min-h-16 resize-y rounded-md border border-input bg-background p-2"
                  value={verification.summary}
                  disabled={saving}
                  onChange={(event) => setVerification({ ...verification, summary: event.target.value })}
                />
              </label>
              <Button
                size="sm"
                variant="outline"
                disabled={saving || !verification.summary.trim()}
                onClick={() => void run(async () => {
                  await onRecordVerification({
                    ...(verification.criterionId ? { criterionId: verification.criterionId } : {}),
                    outcome: verification.outcome,
                    summary: verification.summary.trim(),
                  });
                  setVerification({ ...verification, summary: "" });
                })}
              >
                <PlusIcon className="size-3.5" aria-hidden="true" /> Record owner verification
              </Button>
            </div>
          ) : null}
        </section>

        <section data-testid="task-completion">
          <SectionHeading>Completion</SectionHeading>
          {completion ? (
            <div className="mt-2 rounded-md border border-border/70 p-2">
              <p className="font-medium capitalize">{completion.status.replaceAll("_", " ")}</p>
              <ul className="mt-1.5 space-y-1 text-[11px]">
                {completion.criteria.map((criterion) => (
                  <li key={criterion.criterionId}>
                    <span className="font-medium">{criterion.criterionId}</span>: {criterion.outcome}
                    {criterion.note ? ` — ${criterion.note}` : ""}
                  </li>
                ))}
              </ul>
              {canAcceptGaps && onAcceptGaps ? (
                <Button className="mt-2" size="sm" variant="outline" disabled={saving} onClick={() => void run(onAcceptGaps)}>
                  Accept disclosed gaps
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="mt-1.5 text-muted-foreground">The agent has not submitted a completion assessment.</p>
          )}
        </section>

        {validationError ? <p role="alert" className="text-destructive" data-testid="task-error">{validationError}</p> : null}

        {brief && editable ? (
          <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
            {(brief.status === "completed" || brief.status === "cancelled") && onReopen ? (
              <Button size="sm" variant="outline" disabled={saving} onClick={() => void run(onReopen)}>
                <RotateCcwIcon className="size-3.5" aria-hidden="true" /> Reopen
              </Button>
            ) : null}
            {onReset ? (
              <Button size="sm" variant="ghost" className="text-destructive" disabled={saving} onClick={() => void run(() => onReset(brief.revision))}>
                <Trash2Icon className="size-3.5" aria-hidden="true" /> Reset brief
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TaskBriefEditor({
  draft,
  disabled,
  onChange,
  onSave,
}: {
  draft: TaskDraft;
  disabled: boolean;
  onChange: (draft: TaskDraft) => void;
  onSave: () => void;
}) {
  const textFields = [
    ["Constraints", "constraints"],
    ["Assumptions", "assumptions"],
    ["Open questions", "openQuestions"],
    ["Non-goals", "nonGoals"],
  ] as const;
  return (
    <section className="grid gap-3" data-testid="task-brief-editor">
      <label className="grid gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Objective</span>
        <textarea
          className="min-h-20 resize-y rounded-md border border-input bg-background p-2"
          value={draft.objective}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, objective: event.target.value })}
        />
      </label>
      <label className="grid gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Status</span>
        <select
          className="h-8 rounded-md border border-input bg-background px-2"
          value={draft.status}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, status: event.target.value as TaskDraft["status"] })}
        >
          <option value="active">Active</option>
          <option value="draft">Draft</option>
        </select>
      </label>
      <fieldset className="grid gap-2">
        <legend className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Acceptance criteria</legend>
        {draft.acceptanceCriteria.map((criterion, index) => (
          <div key={`${index}:${criterion.id}`} className="grid grid-cols-[minmax(4rem,0.35fr)_minmax(0,1fr)_auto] gap-1.5">
            <input
              className="h-8 min-w-0 rounded-md border border-input bg-background px-2"
              aria-label={`Criterion ${index + 1} id`}
              placeholder="id"
              value={criterion.id}
              disabled={disabled}
              onChange={(event) => onChange({
                ...draft,
                acceptanceCriteria: draft.acceptanceCriteria.map((item, itemIndex) => itemIndex === index ? { ...item, id: event.target.value } : item),
              })}
            />
            <input
              className="h-8 min-w-0 rounded-md border border-input bg-background px-2"
              aria-label={`Criterion ${index + 1} text`}
              placeholder="Measurable result"
              value={criterion.text}
              disabled={disabled}
              onChange={(event) => onChange({
                ...draft,
                acceptanceCriteria: draft.acceptanceCriteria.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item),
              })}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove criterion ${index + 1}`}
              disabled={disabled || draft.acceptanceCriteria.length === 1}
              onClick={() => onChange({ ...draft, acceptanceCriteria: draft.acceptanceCriteria.filter((_, itemIndex) => itemIndex !== index) })}
            >
              <XIcon className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="justify-self-start"
          disabled={disabled || draft.acceptanceCriteria.length >= 32}
          onClick={() => onChange({ ...draft, acceptanceCriteria: [...draft.acceptanceCriteria, { id: `criterion-${draft.acceptanceCriteria.length + 1}`, text: "" }] })}
        >
          <PlusIcon className="size-3.5" aria-hidden="true" /> Add criterion
        </Button>
      </fieldset>
      {textFields.map(([label, key]) => (
        <label key={key} className="grid gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <textarea
            className="min-h-14 resize-y rounded-md border border-input bg-background p-2"
            value={draft[key]}
            disabled={disabled}
            placeholder="One item per line"
            onChange={(event) => onChange({ ...draft, [key]: event.target.value })}
          />
        </label>
      ))}
      <Button size="sm" disabled={disabled} onClick={onSave}>
        <CheckIcon className="size-3.5" aria-hidden="true" /> Save Task Brief
      </Button>
    </section>
  );
}

function SectionHeading({ children }: { children: string }) {
  return <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

function draftFromBrief(brief: AgentTaskSnapshot["brief"]): TaskDraft {
  if (!brief) return { ...EMPTY_DRAFT, acceptanceCriteria: [...EMPTY_DRAFT.acceptanceCriteria] };
  return {
    objective: brief.objective,
    status: brief.status === "draft" ? "draft" : "active",
    constraints: brief.constraints.join("\n"),
    acceptanceCriteria: brief.acceptanceCriteria.map((criterion) => ({ ...criterion })),
    assumptions: brief.assumptions.join("\n"),
    openQuestions: brief.openQuestions.join("\n"),
    nonGoals: brief.nonGoals.join("\n"),
  };
}

function contentFromDraft(draft: TaskDraft): TaskBriefContent {
  return {
    objective: draft.objective.trim(),
    constraints: lines(draft.constraints),
    acceptanceCriteria: draft.acceptanceCriteria.map((criterion) => ({ id: criterion.id.trim(), text: criterion.text.trim() })),
    assumptions: lines(draft.assumptions),
    openQuestions: lines(draft.openQuestions),
    nonGoals: lines(draft.nonGoals),
  };
}

function lines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}
