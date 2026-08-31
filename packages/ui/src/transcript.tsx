import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { PencilIcon, RotateCcwIcon } from "lucide-react";
import type {
  ChangeReviewSetSummary,
  ChangeScope,
  RunState,
  RunWorkEntry,
  SessionSnapshot,
  TranscriptBlock,
  TranscriptMessage,
  TranscriptToolBlock,
} from "@pho-code/protocol";
import { reviewFileCount, reviewSummaryForToolCall, sessionKeyId, stripExpandedSkillBodies } from "@pho-code/protocol";
import { CopyButton } from "./copy-button";
import { inferMentionKind } from "./lib/at-mention";
import { cn } from "./lib/cn";
import { parseComposerSegments } from "./lib/composer-tokens";
import { useLiveRunForKey } from "./lib/live-run-store";
import {
  collectTurnBlocks,
  countWorkBlocks,
  groupLiveWorkPhases,
  groupTranscriptSegments,
  groupWorkPhases,
  lastTextBearingMessage,
  rewrittenOriginalText,
  turnOutputTextBlocks,
  turnTextOutput,
  workedForLabel,
  workPhaseSummary,
  type WorkPhase,
} from "./lib/work-log";
import { isNearBottom } from "./lib/stick-to-bottom";
import { ConservativeMarkdown } from "./markdown";
import { MarkdownImage } from "./markdown-image";
import { MentionChip } from "./mention-chip";
import { GithubChip } from "./github-chip";
import { SkillChip } from "./skill-chip";
import { ThinkingBlock } from "./thinking-block";
import { ToolRow } from "./tool-row";
import { WorkLogToggle } from "./work-log-toggle";
import { WorkingLabel } from "./working-label";
import { ErrorToast } from "./error-toast";
import { Button } from "./ui/button";

// Transcript layout adapted from refs/t3code MessagesTimeline.tsx (MIT, T3 Tools Inc., 6bc6cb6).
// Turn-level work collapse is Codex-inspired (visual reference only); settled copy is activity-based.
// Pre-tool assistant text stays in the work log; only text after the last tool is the turn answer.
// @ mention chips in user messages are harness-owned Cursor-inspired chrome.
// Assistant-output copy control informed by refs/pi-web MessageView (MIT).
// Live assistant text uses ConservativeMarkdown with a GFM-only pipeline; KaTeX/Shiki/Mermaid wait until settle.

export function Transcript({
  snapshot,
  onRewrite,
  onOpenChangeReview,
}: {
  snapshot: SessionSnapshot;
  onRewrite?: (input: { messageId: string; text: string }) => void | Promise<void>;
  onOpenChangeReview?: (scope: ChangeScope) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const onScroll = () => {
      stickToBottomRef.current = isNearBottom(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
    };
  }, []);

  useStickScroll(scrollerRef, stickToBottomRef, [snapshot.messages]);

  return (
    <div
      ref={scrollerRef}
      className="transcript-scroller flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-2 sm:px-4 sm:py-2.5"
      data-testid="transcript"
      aria-live="polite"
    >
      <SettledTurns
        messages={snapshot.messages}
        changeReviews={snapshot.changeReviews}
        {...(onRewrite ? { onRewrite } : {})}
        {...(onOpenChangeReview ? { onOpenChangeReview } : {})}
      />
      <LiveRunTail
        liveKey={sessionKeyId({
          ...(snapshot.session.backendId ? { backendId: snapshot.session.backendId } : {}),
          workspaceId: snapshot.workspace.id,
          sessionId: snapshot.session.id,
        })}
        runId={snapshot.run.runId}
        snapshotRun={snapshot.run}
        changeReviews={snapshot.changeReviews}
        scrollerRef={scrollerRef}
        stickToBottomRef={stickToBottomRef}
        {...(onOpenChangeReview ? { onOpenChangeReview } : {})}
      />
    </div>
  );
}

const SettledTurns = memo(function SettledTurns({
  messages,
  changeReviews,
  onRewrite,
  onOpenChangeReview,
}: {
  messages: readonly TranscriptMessage[];
  changeReviews?: readonly ChangeReviewSetSummary[];
  onRewrite?: (input: { messageId: string; text: string }) => void | Promise<void>;
  onOpenChangeReview?: (scope: ChangeScope) => void;
}) {
  const segments = useMemo(() => groupTranscriptSegments(messages), [messages]);
  return (
    <>
      {segments.map((segment) =>
        segment.kind === "user" ? (
          <UserMessageRow key={segment.message.id} message={segment.message} />
        ) : (
          <AssistantTurn
            key={segment.key}
            messages={segment.messages}
            changeReviews={changeReviews}
            {...(onRewrite ? { onRewrite } : {})}
            {...(onOpenChangeReview ? { onOpenChangeReview } : {})}
          />
        ),
      )}
    </>
  );
});

function LiveRunTail({
  liveKey,
  runId,
  snapshotRun,
  changeReviews,
  scrollerRef,
  stickToBottomRef,
  onOpenChangeReview,
}: {
  liveKey: string;
  runId?: string;
  snapshotRun: RunState;
  changeReviews?: readonly ChangeReviewSetSummary[];
  scrollerRef: RefObject<HTMLDivElement | null>;
  stickToBottomRef: RefObject<boolean>;
  onOpenChangeReview?: (scope: ChangeScope) => void;
}) {
  const live = useLiveRunForKey(liveKey);
  const run = live.runId && live.runId === runId ? live : snapshotRun;
  const running = run.status === "admitted" || run.status === "streaming";
  const wasRunningRef = useRef(false);
  const [liveWorkExpanded, setLiveWorkExpanded] = useState(true);
  // Keyed by message so a fresh failure re-opens the toast after an earlier dismiss.
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const liveWorkCounts = countWorkBlocks(run.work);
  const livePhases = groupLiveWorkPhases(run.work);
  const lastWorkEntry = livePhases.at(-1)?.entries.at(-1);
  const hasStreamingText = /\S/u.test(run.streamingText);

  useLayoutEffect(() => {
    if (running && !wasRunningRef.current) {
      stickToBottomRef.current = true;
      setLiveWorkExpanded(true);
    }
    wasRunningRef.current = running;
  }, [running, stickToBottomRef]);

  useStickScroll(scrollerRef, stickToBottomRef, [liveWorkExpanded, run.streamingText, run.work]);

  return (
    <>
      {liveWorkCounts.steps > 0 ? (
        <div className="chat-column overflow-x-clip pb-2" data-testid="live-work">
          <div className="space-y-1 px-1 py-0.5">
            <WorkLogToggle
              label="Working"
              expanded={liveWorkExpanded}
              live={running}
              {...(run.startedAt ? { startedAt: run.startedAt } : {})}
              onToggle={() => setLiveWorkExpanded((value) => !value)}
            />
            {liveWorkExpanded
              ? livePhases.map((phase, index) => (
                  <WorkPhaseView
                    key={`live-phase:${index}`}
                    phase={phase}
                    liveEntry={running ? lastWorkEntry : undefined}
                    changeReviews={changeReviews}
                    {...(onOpenChangeReview ? { onOpenChangeReview } : {})}
                  />
                ))
              : null}
          </div>
        </div>
      ) : null}
      {hasStreamingText ? (
        <article
          className={cn(
            "streaming-text chat-text chat-column overflow-x-clip px-1 py-0.5 pb-2.5",
            running && "streaming-shimmer",
          )}
          data-testid="streaming-text"
        >
          <StreamingMarkdown text={run.streamingText} />
        </article>
      ) : null}
      {running && !hasStreamingText && liveWorkCounts.steps === 0 ? (
        <p className="chat-column px-1 pb-2.5 pt-1 text-sm text-muted-foreground" data-testid="agent-working">
          <WorkingLabel text="Working" live />
        </p>
      ) : null}
      {run.error && run.error.message !== dismissedError ? (
        <ErrorToast
          title="Run failed"
          message={run.error.message}
          testId="run-error"
          onDismiss={() => setDismissedError(run.error?.message ?? null)}
        />
      ) : null}
    </>
  );
}

function useStickScroll(
  scrollerRef: RefObject<HTMLDivElement | null>,
  stickToBottomRef: RefObject<boolean>,
  deps: readonly unknown[],
): void {
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !stickToBottomRef.current) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the reactive deps
  }, deps);
}

function liveWorkKey(entry: RunWorkEntry, index: number): string {
  if (entry.type === "tool") {
    return `tool:${entry.callId}`;
  }
  return `${entry.type}:${index}`;
}

function StreamingMarkdown({ text }: { text: string }) {
  return <ConservativeMarkdown text={text} streaming />;
}

function WorkEntryView({
  entry,
  live = false,
  changeReviews,
  onOpenChangeReview,
}: {
  entry: Extract<TranscriptBlock, { type: "thinking" | "tool" }>;
  live?: boolean;
  changeReviews?: readonly ChangeReviewSetSummary[];
  onOpenChangeReview?: (scope: ChangeScope) => void;
}) {
  return entry.type === "thinking" ? (
    <ThinkingBlock text={entry.text} open={live} live={live} />
  ) : (
    <ToolRow
      block={entry}
      {...toolReviewProps(entry, changeReviews, onOpenChangeReview)}
    />
  );
}

function toolReviewProps(
  block: TranscriptToolBlock,
  changeReviews: readonly ChangeReviewSetSummary[] | undefined,
  onOpenChangeReview: ((scope: ChangeScope) => void) | undefined,
): { reviewCount?: number; onOpenReview?: () => void } {
  const summary = reviewSummaryForToolCall(changeReviews, block.callId);
  if (!summary) {
    return {};
  }
  return {
    reviewCount: reviewFileCount(summary),
    ...(onOpenChangeReview
      ? {
          onOpenReview: () =>
            onOpenChangeReview({
              workspaceId: summary.workspaceId,
              sessionId: summary.sessionId,
              runId: summary.runId,
            }),
        }
      : {}),
  };
}

// Narration opens a work phase as ordinary prose; the phase's think/tool entries
// indent beneath it. Hierarchy inspired by the owner's target-UI screenshot
// (narrative phases); no third-party code copied.
function WorkNarration({ text }: { text: string }) {
  return (
    <div className="chat-text px-1 py-0.5 text-foreground" data-testid="work-narration">
      <ConservativeMarkdown text={text} />
    </div>
  );
}

function WorkPhaseView({
  phase,
  liveEntry,
  changeReviews,
  onOpenChangeReview,
}: {
  phase: WorkPhase;
  liveEntry?: WorkPhase["entries"][number];
  changeReviews?: readonly ChangeReviewSetSummary[];
  onOpenChangeReview?: (scope: ChangeScope) => void;
}) {
  const summary = workPhaseSummary(phase.entries);
  return (
    <div className="space-y-1" data-testid="work-phase">
      {phase.narration ? <WorkNarration text={phase.narration.text} /> : null}
      {summary ? (
        <div className="px-1 text-[12px] leading-5 text-secondary-label" data-testid="work-phase-summary">
          {summary}
        </div>
      ) : null}
      {phase.entries.length > 0 ? (
        <div
          className={
            phase.narration || summary ? "ms-2 space-y-1 border-s border-border/45 py-0.5 ps-4" : "space-y-1 py-0.5"
          }
        >
          {phase.entries.map((entry, index) => (
            <WorkEntryView
              key={liveWorkKey(entry, index)}
              entry={entry}
              live={liveEntry !== undefined && entry === liveEntry && entry.type === "thinking"}
              changeReviews={changeReviews}
              {...(onOpenChangeReview ? { onOpenChangeReview } : {})}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const UserMessageRow = memo(function UserMessageRow({ message }: { message: TranscriptMessage }) {
  return (
    <article className="chat-column flex flex-col items-end gap-1 overflow-x-clip pb-2.5">
      <div className="chat-text relative max-h-[300px] max-w-[80%] overflow-y-auto break-words rounded-2xl bg-message px-3 py-2.5 text-message-foreground">
        {message.blocks.map((block, index) => (
          <UserTranscriptBlockView key={`${message.id}:${index}`} block={block} />
        ))}
      </div>
    </article>
  );
});

function UserTranscriptBlockView({ block }: { block: TranscriptBlock }) {
  switch (block.type) {
    case "text":
      return <UserTextWithMentions text={block.text} />;
    case "thinking":
      return <ThinkingBlock text={block.text} open={false} />;
    case "tool":
      return <ToolRow block={block} />;
    case "image":
      return block.previewDataUrl ? (
        <div className="transcript-image-thumb" data-testid="transcript-image">
          <MarkdownImage src={block.previewDataUrl} alt={block.name} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="transcript-image-placeholder">
          Image: {block.name}
        </p>
      );
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

function UserTextWithMentions({ text }: { text: string }) {
  const visible = stripExpandedSkillBodies(text);
  const segments = parseComposerSegments(visible);
  const hasChips = segments.some((segment) => segment.type !== "text");
  if (!hasChips) {
    return <ConservativeMarkdown text={visible} />;
  }
  // Keep text+chips inline; block markdown wrappers would break chip flow.
  return (
    <span className="user-mention-text whitespace-pre-wrap break-words">
      {segments.map((segment, index) => {
        switch (segment.type) {
          case "text":
            return segment.text === "" ? null : <span key={`text:${index}`}>{segment.text}</span>;
          case "mention":
            return (
              <MentionChip
                key={`mention:${segment.path}:${index}`}
                path={segment.path}
                kind={inferMentionKind(segment.path)}
              />
            );
          case "skill":
            return (
              <SkillChip
                key={`skill:${segment.sourceId}:${segment.skillName}:${index}`}
                sourceId={segment.sourceId}
                skillName={segment.skillName}
              />
            );
          case "github":
            return (
              <GithubChip
                key={`github:${segment.url}:${index}`}
                url={segment.url}
                owner={segment.owner}
                repo={segment.repo}
              />
            );
          default: {
            const exhaustive: never = segment;
            return exhaustive;
          }
        }
      })}
    </span>
  );
}

const AssistantTurn = memo(function AssistantTurn({
  messages,
  changeReviews,
  onRewrite,
  onOpenChangeReview,
}: {
  messages: TranscriptMessage[];
  changeReviews?: readonly ChangeReviewSetSummary[];
  onRewrite?: (input: { messageId: string; text: string }) => void | Promise<void>;
  onOpenChangeReview?: (scope: ChangeScope) => void;
}) {
  const blocks = collectTurnBlocks(messages);
  const workCounts = countWorkBlocks(blocks);
  const phases = groupWorkPhases(blocks);
  const [workExpanded, setWorkExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const label = workedForLabel({
    live: false,
    thoughts: workCounts.thoughts,
    tools: workCounts.tools,
  });
  const outputText = turnTextOutput(blocks);
  const textBlocks = turnOutputTextBlocks(blocks);
  const target = lastTextBearingMessage(messages);
  const originalText = target ? rewrittenOriginalText(target.blocks) : undefined;
  const targetText = target ? turnTextOutput(target.blocks) : "";

  function startEditing() {
    if (!target) {
      return;
    }
    setDraft(targetText);
    setEditing(true);
  }

  function cancelEditing() {
    if (saving) {
      return;
    }
    setEditing(false);
    setDraft("");
  }

  async function saveEditing(nextText: string) {
    if (!target || !onRewrite || saving) {
      return;
    }
    setSaving(true);
    try {
      await onRewrite({ messageId: target.id, text: nextText });
      setEditing(false);
      setDraft("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="chat-column overflow-x-clip" data-testid="assistant-turn">
      {workCounts.steps > 0 ? (
        <div className="space-y-1 px-1 py-0.5 pb-2">
          <WorkLogToggle
            label={label}
            expanded={workExpanded}
            onToggle={() => setWorkExpanded((value) => !value)}
          />
          {workExpanded
            ? phases.map((phase, index) => (
                <WorkPhaseView
                  key={`${messages[0]?.id ?? "turn"}:phase:${index}`}
                  phase={phase}
                  changeReviews={changeReviews}
                  {...(onOpenChangeReview ? { onOpenChangeReview } : {})}
                />
              ))
            : null}
        </div>
      ) : null}
      {editing ? (
        <div className="px-1 py-0.5 pb-1" data-testid="rewrite-assistant-editor">
          <textarea
            aria-label="Edit assistant output"
            className="assistant-rewrite-editor"
            value={draft}
            disabled={saving}
            rows={Math.min(24, Math.max(6, draft.split("\n").length + 1))}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
                return;
              }
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
                event.preventDefault();
                void saveEditing(draft);
              }
            }}
          />
          <div className="assistant-turn-actions mt-2 flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="default"
              disabled={saving}
              data-testid="save-assistant-output"
              onClick={() => {
                void saveEditing(draft);
              }}
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              data-testid="cancel-assistant-output"
              onClick={cancelEditing}
            >
              Cancel
            </Button>
            {originalText !== undefined ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                data-testid="restore-assistant-output"
                onClick={() => {
                  void saveEditing(originalText);
                }}
              >
                <RotateCcwIcon className="size-3.5" aria-hidden="true" />
                Restore original
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        textBlocks.map((block, index) => {
          const isLast = index === textBlocks.length - 1;
          return (
            <div
              key={`${messages[0]?.id ?? "turn"}:text:${index}`}
              className={`chat-text relative min-w-0 px-1 py-0.5 text-foreground ${isLast ? "pb-1" : "pb-6"}`}
            >
              <ConservativeMarkdown text={block.text} />
            </div>
          );
        })
      )}
      {outputText && !editing ? (
        <div className="assistant-turn-actions flex items-center gap-1.5 px-1 pb-2 pt-0.5">
          <CopyButton
            text={outputText}
            label="Copy"
            copiedLabel="Copied"
            data-testid="copy-assistant-output"
          />
          {onRewrite && target ? (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="size-6 shrink-0 text-muted-foreground shadow-none hover:bg-accent hover:text-foreground"
              aria-label="Edit"
              title="Edit"
              data-testid="edit-assistant-output"
              onClick={startEditing}
            >
              <PencilIcon className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
          {originalText !== undefined ? (
            <span className="text-xs text-muted-foreground" data-testid="rewritten-assistant-output">
              Edited
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
});
