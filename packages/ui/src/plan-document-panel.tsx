import { useEffect, useRef, useState } from "react";
import { ArrowUpIcon, CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { emptySessionPlanSnapshot, type SessionPlanSnapshot } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { ConservativeMarkdown } from "./markdown";
import { SessionTodoList } from "./session-todo-list";
import { Button } from "./ui/button";

export function PlanDocumentPanel({
  plan = emptySessionPlanSnapshot(),
  idle = true,
  busy = false,
  onSave,
  onExecute,
  onRefine,
}: {
  plan?: SessionPlanSnapshot;
  idle?: boolean;
  busy?: boolean;
  onSave?: (documentMarkdown: string) => void | Promise<void>;
  onExecute?: () => void | Promise<void>;
  onRefine?: (comment: string) => void | Promise<void>;
}) {
  const executing = plan.executing;
  const viewingIdle = idle && !executing;
  const editable = viewingIdle && !busy;
  const [draft, setDraft] = useState(plan.documentMarkdown);
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(plan.documentMarkdown);
    setEditing(false);
  }, [plan.documentMarkdown]);

  const dirty = draft !== plan.documentMarkdown;
  const inPlan = plan.mode === "plan";
  const emptyDocument = draft.trim().length === 0;
  const showPlanLoop = inPlan || executing;
  const showExecute = showPlanLoop;
  const canComment = viewingIdle && !emptyDocument && showPlanLoop && Boolean(onRefine);
  const canSendComment = canComment && comment.trim().length > 0 && !saving && !busy;

  async function save(): Promise<boolean> {
    if (!onSave || !editable) {
      return false;
    }
    if (!dirty) {
      setEditing(false);
      return true;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      return true;
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit(): void {
    setDraft(plan.documentMarkdown);
    setEditing(false);
  }

  async function sendComment(): Promise<void> {
    if (!canComment || !onRefine) {
      return;
    }
    if (dirty) {
      try {
        const saved = await save();
        if (!saved) {
          return;
        }
      } catch {
        return;
      }
    }
    const text = comment.trim();
    if (text.length === 0) {
      commentRef.current?.focus();
      return;
    }
    try {
      await onRefine(text);
      setComment("");
    } catch {
      // Keep the comment so the owner can retry after a failed send.
    }
  }

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      aria-labelledby="plan-document-heading"
      data-testid="plan-document-panel"
      data-mode={plan.mode}
      data-editing={editing ? "true" : "false"}
      data-executing={executing ? "true" : "false"}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-3.5 pt-3.5">
        <div className="flex min-w-0 items-center gap-1">
          <h2 id="plan-document-heading" className="text-[13px] font-medium tracking-tight">
            Plan
          </h2>
          {editable && onSave && !emptyDocument && !editing ? (
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-6 text-muted-foreground hover:text-foreground"
              aria-label="Edit plan"
              title="Edit plan"
              data-testid="plan-document-edit"
              disabled={saving}
              onClick={() => setEditing(true)}
            >
              <PencilIcon className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
          {editable && onSave && !emptyDocument && editing ? (
            <>
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-6 text-muted-foreground hover:text-foreground"
                aria-label="Cancel edit"
                title="Cancel"
                data-testid="plan-document-cancel"
                disabled={saving}
                onClick={cancelEdit}
              >
                <XIcon className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-6 text-muted-foreground hover:text-foreground"
                aria-label="Save plan"
                title="Save"
                data-testid="plan-document-save"
                disabled={saving || !dirty}
                onClick={() => {
                  void save();
                }}
              >
                <CheckIcon className="size-3.5" aria-hidden="true" />
              </Button>
            </>
          ) : null}
        </div>
        <span
          className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground"
          data-testid="plan-mode-chip"
        >
          {executing ? "Execute" : inPlan ? "Plan" : "Agent"}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3.5 py-2.5">
        {emptyDocument ? (
          <p className="text-xs leading-relaxed text-muted-foreground" data-testid="plan-empty">
            The agent writes the plan as markdown. It will show up here.
          </p>
        ) : editing && editable ? (
          <textarea
            className="plan-document-source"
            value={draft}
            disabled={saving}
            spellCheck={false}
            aria-label="Plan markdown"
            data-testid="plan-document-editor"
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : (
          <div className="plan-document-preview min-w-0" data-testid="plan-document-preview">
            <ConservativeMarkdown text={draft} />
          </div>
        )}
        {plan.todos.length > 0 ? (
          <div className="shrink-0" data-testid="plan-todo-list">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Todos</p>
            <SessionTodoList todos={plan.todos} />
          </div>
        ) : null}
        {canComment ? (
          <div className="plan-document-comment-row">
            <label className="plan-document-comment-field min-w-0 flex-1">
              <span className="sr-only">Comment on this plan</span>
              <textarea
                ref={commentRef}
                className="plan-document-comment"
                value={comment}
                disabled={saving || busy}
                spellCheck
                placeholder="Add a comment"
                data-testid="plan-document-comment"
                onChange={(event) => setComment(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                    return;
                  }
                  event.preventDefault();
                  void sendComment();
                }}
              />
            </label>
            <button
              type="button"
              className="relative isolate flex size-7 shrink-0 items-center justify-center rounded-full bg-message-action text-message-action-foreground enabled:cursor-pointer hover:opacity-90 disabled:pointer-events-none disabled:opacity-30"
              aria-label="Send comment"
              title="Send comment"
              data-testid="plan-document-comment-send"
              disabled={!canSendComment}
              onClick={() => {
                void sendComment();
              }}
            >
              <ArrowUpIcon className="size-3.5 stroke-[2.2]" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
      {showExecute && onExecute ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-3.5 py-2.5">
          <Button
            size="sm"
            className={cn(executing && "opacity-70")}
            data-testid="plan-execute"
            disabled={!idle || executing || busy || saving}
            onClick={() => {
              void onExecute();
            }}
          >
            Execute
          </Button>
        </div>
      ) : null}
    </section>
  );
}
