import { useEffect, useRef, useState } from "react";
import { ArrowUpIcon, XIcon } from "lucide-react";
import type { AskUserQuestion, HostDialogRequest, ResolveHostDialogInput } from "@pho-code/protocol";
import { handleDialogTab } from "./lib/dialog-focus";
import {
  askUserOptionLetter,
  canSubmitAskUserCard,
  createAskUserDrafts,
  draftsToAskUserAnswers,
  isAskUserDraftAnswered,
  isAskUserTextEntryTarget,
  selectAskUserOption,
  setAskUserCustomText,
  shortcutOptionIndex,
  unansweredAskUserHeaders,
  type AskUserCardPhase,
  type AskUserDraft,
} from "./lib/ask-user-card-state";
import { ConservativeMarkdown } from "./markdown";
import { cn } from "./lib/cn";

const EMPTY_QUESTIONS: AskUserQuestion[] = [];

// Questionnaire chrome reuses the compact Beautiful UI approval-card density
// (MIT, Shane Levine, https://www.beautifului.dev/ retrieved 2026-08-16): lettered
// option rows, Type something, header chips / pager, and a review step. Permission
// copy stays in host-dialog.tsx. Focus loop and Escape remain harness-owned.

export function AskUserCard({
  request,
  onResolve,
}: {
  request: HostDialogRequest;
  onResolve: (resolution: Omit<ResolveHostDialogInput, "requestId">) => void;
}) {
  const questions = request.questions ?? EMPTY_QUESTIONS;
  const panelRef = useRef<HTMLDivElement>(null);
  const onResolveRef = useRef(onResolve);
  const [phase, setPhase] = useState<AskUserCardPhase>("question");
  const [activeIndex, setActiveIndex] = useState(0);
  const [drafts, setDrafts] = useState<AskUserDraft[]>(() => createAskUserDrafts(questions.length));
  const phaseRef = useRef(phase);
  const activeIndexRef = useRef(activeIndex);
  const draftsRef = useRef(drafts);

  useEffect(() => {
    onResolveRef.current = onResolve;
  }, [onResolve]);

  useEffect(() => {
    phaseRef.current = phase;
    activeIndexRef.current = activeIndex;
    draftsRef.current = drafts;
  }, [phase, activeIndex, drafts]);

  useEffect(() => {
    setPhase("question");
    setActiveIndex(0);
    setDrafts(createAskUserDrafts(questions.length));
  }, [request.requestId, questions.length]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onResolveRef.current({ cancelled: true });
        return;
      }
      const plain =
        !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.isComposing;
      const currentIndex = activeIndexRef.current;
      const currentPhase = phaseRef.current;
      const currentDrafts = draftsRef.current;
      const question = questions[currentIndex];
      const typing =
        event.target instanceof HTMLElement &&
        isAskUserTextEntryTarget(
          event.target.tagName,
          event.target instanceof HTMLInputElement ? event.target.type : undefined,
          event.target.isContentEditable,
        );
      if (currentPhase === "question" && question && plain && !typing) {
        const optionIndex = shortcutOptionIndex(event.key, question.options.length);
        if (optionIndex !== null) {
          const option = question.options[optionIndex];
          if (option) {
            event.preventDefault();
            updateDraft(currentIndex, (draft) => selectAskUserOption(draft, option.label, question.multiSelect === true));
            if (!question.multiSelect && questions.length > 1) {
              advanceAfterSingleSelect(currentIndex);
            }
            return;
          }
        }
      }
      if (event.key === "Enter" && plain) {
        if (event.target instanceof HTMLElement && event.target.closest("button, textarea")) {
          return;
        }
        event.preventDefault();
        submitFromRefs(questions, currentDrafts, currentPhase, currentIndex);
        return;
      }
      const panel = panelRef.current;
      if (panel) {
        handleDialogTab(event, panel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [questions, request.requestId]);

  const question = questions[activeIndex];
  const draft = drafts[activeIndex];
  const unanswered = unansweredAskUserHeaders(questions, drafts);
  const canSubmit = canSubmitAskUserCard(questions, drafts, phase);

  function advanceOrResolve(
    currentQuestions: readonly AskUserQuestion[],
    currentDrafts: AskUserDraft[],
    currentPhase: AskUserCardPhase,
    currentIndex: number,
    resolve: (resolution: Omit<ResolveHostDialogInput, "requestId">) => void,
  ) {
    if (currentPhase === "review") {
      if (canSubmitAskUserCard(currentQuestions, currentDrafts, currentPhase)) {
        resolve({ answers: draftsToAskUserAnswers(currentQuestions, currentDrafts) });
      }
      return;
    }
    const current = currentQuestions[currentIndex];
    const currentDraft = currentDrafts[currentIndex];
    if (!current || !currentDraft || !isAskUserDraftAnswered(current, currentDraft)) {
      return;
    }
    if (currentQuestions.length === 1) {
      resolve({ answers: draftsToAskUserAnswers(currentQuestions, currentDrafts) });
      return;
    }
    if (currentIndex + 1 < currentQuestions.length) {
      setActiveIndex(currentIndex + 1);
      return;
    }
    setPhase("review");
  }

  function submitFromRefs(
    currentQuestions: readonly AskUserQuestion[],
    currentDrafts: AskUserDraft[],
    currentPhase: AskUserCardPhase,
    currentIndex: number,
  ) {
    advanceOrResolve(currentQuestions, currentDrafts, currentPhase, currentIndex, (resolution) => onResolveRef.current(resolution));
  }

  function updateDraft(index: number, updater: (draft: AskUserDraft) => AskUserDraft) {
    setDrafts((current) => current.map((entry, entryIndex) => (entryIndex === index ? updater(entry) : entry)));
  }

  function advanceAfterSingleSelect(fromIndex: number) {
    if (fromIndex + 1 < questions.length) {
      setActiveIndex(fromIndex + 1);
    } else if (questions.length > 1) {
      setPhase("review");
    }
  }

  function submitOrAdvance() {
    advanceOrResolve(questions, drafts, phase, activeIndex, onResolve);
  }

  if (!question || !draft) {
    return null;
  }

  const focusedOption =
    !question.multiSelect && draft.customText.trim().length === 0
      ? question.options.find((option) => option.label === draft.selectedLabels[0])
      : undefined;

  return (
    <div
      ref={panelRef}
      className="approval-card mb-2 text-card-foreground"
      role="dialog"
      aria-labelledby="ask-user-title"
      data-testid="extension-dialog"
      data-kind="questionnaire"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitOrAdvance();
        }}
      >
        <div className="approval-card-body">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="approval-card-eyebrow m-0">{questions.length > 1 ? "Questions" : "Question"}</p>
              <h2 id="ask-user-title" className="approval-card-title m-0" data-testid="ask-user-title">
                {phase === "review" ? "Review answers" : question.question}
              </h2>
            </div>
            <button
              type="button"
              className="approval-card-icon-button"
              aria-label="Dismiss"
              onClick={() => onResolve({ cancelled: true })}
            >
              <XIcon className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          {questions.length > 1 ? (
            <div className="ask-user-tabs" role="tablist" aria-label="Questions">
              {questions.map((entry, index) => (
                <button
                  key={`${entry.header}-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={phase === "question" && index === activeIndex}
                  className={cn(
                    "ask-user-tab",
                    phase === "question" && index === activeIndex && "is-active",
                    isAskUserDraftAnswered(entry, drafts[index] ?? draft) && "is-answered",
                  )}
                  data-testid={`ask-user-tab-${index}`}
                  onClick={() => {
                    setPhase("question");
                    setActiveIndex(index);
                  }}
                >
                  {entry.header}
                </button>
              ))}
            </div>
          ) : null}
          {phase === "review" ? (
            <ReviewList questions={questions} drafts={drafts} unanswered={unanswered} />
          ) : (
            <QuestionFields
              requestId={request.requestId}
              question={question}
              draft={draft}
              onSelect={(label) => {
                updateDraft(activeIndex, (current) => selectAskUserOption(current, label, question.multiSelect === true));
                if (!question.multiSelect && questions.length > 1) {
                  advanceAfterSingleSelect(activeIndex);
                }
              }}
              onCustomChange={(value) => updateDraft(activeIndex, (current) => setAskUserCustomText(current, value))}
              onNotesChange={(value) => updateDraft(activeIndex, (current) => ({ ...current, notes: value }))}
              preview={focusedOption?.preview}
            />
          )}
        </div>
        <div className="approval-card-footer">
          <button type="button" className="approval-card-text-action" onClick={() => onResolve({ cancelled: true })}>
            Cancel
          </button>
          <button
            type="submit"
            className="approval-card-send"
            data-testid="extension-dialog-confirm"
            aria-label={phase === "review" || questions.length === 1 ? "Submit" : "Continue"}
            disabled={phase === "review" ? !canSubmit : !isAskUserDraftAnswered(question, draft)}
          >
            <ArrowUpIcon className="size-3.5 stroke-[2.4]" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}

function QuestionFields({
  requestId,
  question,
  draft,
  onSelect,
  onCustomChange,
  onNotesChange,
  preview,
}: {
  requestId: string;
  question: AskUserQuestion;
  draft: AskUserDraft;
  onSelect: (label: string) => void;
  onCustomChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  preview?: string;
}) {
  const customActive = draft.customText.trim().length > 0;
  return (
    <div className="ask-user-fields">
      <div
        role={question.multiSelect ? "group" : "radiogroup"}
        aria-labelledby="ask-user-title"
        className="approval-card-options"
      >
        {question.options.map((option, index) => {
          const letter = askUserOptionLetter(index);
          const selected = draft.selectedLabels.includes(option.label);
          return (
            <label key={option.label} className={cn("approval-option ask-user-option", selected && "is-selected")}>
              <input
                type={question.multiSelect ? "checkbox" : "radio"}
                className="sr-only pointer-events-none"
                name={question.multiSelect ? `ask-user-${requestId}-${index}` : `ask-user-${requestId}`}
                value={option.label}
                checked={selected}
                onChange={() => onSelect(option.label)}
              />
              <span className={cn(question.multiSelect ? "ask-user-check" : "approval-radio")} aria-hidden="true">
                {question.multiSelect ? null : <span className="approval-radio-dot" />}
              </span>
              <span className="ask-user-option-copy">
                <span className="approval-option-label">
                  {letter ? `${letter}. ` : ""}
                  {option.label}
                </span>
                <span className="ask-user-option-description">{option.description}</span>
              </span>
              {letter && !selected ? (
                <kbd className="approval-option-key" aria-hidden="true">
                  {letter}
                </kbd>
              ) : null}
            </label>
          );
        })}
      </div>
      <label className={cn("approval-input-row ask-user-custom", customActive && "is-selected")}>
        <span aria-hidden="true" className="approval-radio is-spacer" />
        <input
          className="approval-input"
          data-testid="ask-user-custom"
          placeholder="Type something"
          value={draft.customText}
          onChange={(event) => onCustomChange(event.target.value)}
        />
      </label>
      <label className="ask-user-note">
        <span className="ask-user-note-label">Note (optional)</span>
        <input
          className="approval-input"
          data-testid="ask-user-note"
          placeholder="Add a note"
          value={draft.notes}
          onChange={(event) => onNotesChange(event.target.value)}
        />
      </label>
      {preview ? (
        <div className="ask-user-preview" data-testid="ask-user-preview">
          <ConservativeMarkdown text={preview} />
        </div>
      ) : null}
    </div>
  );
}

function ReviewList({
  questions,
  drafts,
  unanswered,
}: {
  questions: readonly AskUserQuestion[];
  drafts: readonly AskUserDraft[];
  unanswered: readonly string[];
}) {
  return (
    <div className="ask-user-review" data-testid="ask-user-review">
      {unanswered.length > 0 ? (
        <p className="ask-user-unanswered">Unanswered: {unanswered.join(", ")}</p>
      ) : null}
      <ul className="ask-user-review-list">
        {questions.map((question, index) => {
          const draft = drafts[index];
          const summary = draft?.customText.trim()
            ? draft.customText.trim()
            : draft?.selectedLabels.join(", ") || "Unanswered";
          return (
            <li key={`${question.header}-${index}`}>
              <span className="ask-user-review-header">{question.header}</span>
              <span className="ask-user-review-answer">{summary}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
