import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PencilIcon, RotateCcwIcon, UserIcon } from "lucide-react";
import type { RunWorkEntry, SessionSnapshot, TranscriptBlock, TranscriptMessage } from "@pho-code/protocol";
import { CopyButton } from "./copy-button";
import { inferMentionKind, parseMentionSegments } from "./lib/at-mention";
import {
  collectTurnBlocks,
  countWorkBlocks,
  groupTranscriptSegments,
  lastTextBearingMessage,
  rewrittenOriginalText,
  turnTextOutput,
  turnTiming,
  workedForLabel,
} from "./lib/work-log";
import { isNearBottom } from "./lib/stick-to-bottom";
import { elapsedSince } from "./lib/elapsed";
import { ConservativeMarkdown } from "./markdown";
import { MentionChip } from "./mention-chip";
import { LoadingState } from "./loading-state";
import { StreamingOutput, useSmoothStreamingText } from "./streaming-output";
import { ThinkingBlock } from "./thinking-block";
import { ToolRow } from "./tool-row";
import { WorkLogToggle } from "./work-log-toggle";
import { Button } from "./ui/button";

// Transcript layout adapted from refs/t3code MessagesTimeline.tsx (MIT, T3 Tools Inc., 6bc6cb6).
// Turn-level “Worked for …” collapse is Codex-inspired (visual reference only).
// User avatar chip and @ mention chips are harness-owned Cursor-inspired chrome.
// Assistant-output copy control informed by refs/pi-web MessageView (MIT).

export function Transcript({
  snapshot,
  onRewrite,
}: {
  snapshot: SessionSnapshot;
  onRewrite?: (input: { messageId: string; text: string }) => void | Promise<void>;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const wasRunningRef = useRef(false);
  const running = snapshot.run.status === "admitted" || snapshot.run.status === "streaming";
  const displayedStreamingText = useSmoothStreamingText(
    snapshot.run.streamingText,
    running,
    snapshot.run.runId,
  );
  const [liveWorkExpanded, setLiveWorkExpanded] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

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

  useLayoutEffect(() => {
    if (running && !wasRunningRef.current) {
      stickToBottomRef.current = true;
      setLiveWorkExpanded(true);
    }
    wasRunningRef.current = running;
  }, [running]);

  useEffect(() => {
    if (!running || !snapshot.run.startedAt) {
      return;
    }
    const fineClock = !snapshot.run.streamingText;
    const id = window.setInterval(() => setNowMs(Date.now()), fineClock ? 100 : 1000);
    return () => window.clearInterval(id);
  }, [running, snapshot.run.startedAt, snapshot.run.streamingText]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !stickToBottomRef.current) {
      return;
    }
    scroller.scrollTop = scroller.scrollHeight;
  }, [displayedStreamingText, liveWorkExpanded, snapshot.messages, snapshot.run.streamingText, snapshot.run.work]);

  const liveWorkCounts = countWorkBlocks(snapshot.run.work);
  const segments = groupTranscriptSegments(snapshot.messages);
  const liveElapsed = elapsedSince(snapshot.run.startedAt, nowMs);
  const liveLabel = workedForLabel({
    live: true,
    ...(snapshot.run.startedAt ? { startedAt: snapshot.run.startedAt } : {}),
    nowMs,
  });

  return (
    <div
      ref={scrollerRef}
      className="scrollbar-gutter-both flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4"
      data-testid="transcript"
      aria-live="polite"
    >
      {segments.map((segment, index) => {
        switch (segment.kind) {
          case "user":
            return <UserMessageRow key={segment.message.id} message={segment.message} />;
          case "assistantTurn": {
            const previous = segments[index - 1];
            const previousUserCreatedAt =
              previous?.kind === "user" ? previous.message.createdAt : undefined;
            return (
              <AssistantTurn
                key={segment.key}
                messages={segment.messages}
                {...(previousUserCreatedAt ? { previousUserCreatedAt } : {})}
                {...(onRewrite ? { onRewrite } : {})}
              />
            );
          }
          default: {
            const exhaustive: never = segment;
            return exhaustive;
          }
        }
      })}
      {liveWorkCounts.steps > 0 ? (
        <div className="mx-auto w-full min-w-0 max-w-3xl overflow-x-clip pb-2" data-testid="live-work">
          <div className="space-y-1 px-1 py-0.5">
            <WorkLogToggle
              label={liveLabel}
              expanded={liveWorkExpanded}
              live={running}
              elapsed={liveElapsed}
              onToggle={() => setLiveWorkExpanded((value) => !value)}
            />
            {liveWorkExpanded
              ? snapshot.run.work.map((entry, index) => (
                  <LiveWorkEntryView
                    key={liveWorkKey(entry, index)}
                    entry={entry}
                    live={running && index === snapshot.run.work.length - 1 && entry.type === "thinking"}
                  />
                ))
              : null}
          </div>
        </div>
      ) : null}
      {snapshot.run.streamingText ? (
        <StreamingOutput text={displayedStreamingText} running={running} />
      ) : null}
      {running && !snapshot.run.streamingText && liveWorkCounts.steps === 0 ? (
        <div className="mx-auto w-full max-w-3xl px-1 pb-4 pt-1">
          <LoadingState label="Working" elapsed={liveElapsed} />
        </div>
      ) : null}
      {snapshot.run.error ? (
        <p className="mx-auto w-full max-w-3xl px-1 pb-4 text-sm text-destructive" role="alert">
          {snapshot.run.error.message}
        </p>
      ) : null}
    </div>
  );
}

function liveWorkKey(entry: RunWorkEntry, index: number): string {
  switch (entry.type) {
    case "thinking":
      return `thinking:${index}`;
    case "tool":
      return `tool:${entry.callId}`;
    default: {
      const exhaustive: never = entry;
      return exhaustive;
    }
  }
}

function LiveWorkEntryView({ entry, live }: { entry: RunWorkEntry; live: boolean }) {
  switch (entry.type) {
    case "thinking":
      return <ThinkingBlock text={entry.text} open={live} live={live} />;
    case "tool":
      return (
        <ToolRow
          block={{
            type: "tool",
            callId: entry.callId,
            name: entry.name,
            status: entry.status,
            inputPreview: entry.inputPreview,
            outputPreview: entry.outputPreview,
          }}
        />
      );
    default: {
      const exhaustive: never = entry;
      return exhaustive;
    }
  }
}

function UserMessageRow({ message }: { message: TranscriptMessage }) {
  return (
    <article className="mx-auto flex w-full min-w-0 max-w-3xl flex-col items-end gap-1 overflow-x-clip pb-4">
      <div className="chat-text relative flex max-h-[300px] max-w-[80%] items-start gap-2.5 overflow-y-auto break-words rounded-2xl bg-message px-3 py-2.5 text-message-foreground">
        <span
          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground/10 text-message-foreground"
          aria-hidden="true"
        >
          <UserIcon className="size-3 opacity-80" />
        </span>
        <div className="min-w-0 flex-1">
          {message.blocks.map((block, index) => (
            <UserTranscriptBlockView key={`${message.id}:${index}`} block={block} />
          ))}
        </div>
      </div>
    </article>
  );
}

function UserTranscriptBlockView({ block }: { block: TranscriptBlock }) {
  switch (block.type) {
    case "text":
      return <UserTextWithMentions text={block.text} />;
    case "thinking":
      return <ThinkingBlock text={block.text} open={false} />;
    case "tool":
      return <ToolRow block={block} />;
    case "image":
      return (
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
  const segments = parseMentionSegments(text);
  const hasMentions = segments.some((segment) => segment.type === "mention");
  if (!hasMentions) {
    return <ConservativeMarkdown text={text} />;
  }
  // Keep text+chips inline; block markdown wrappers would break chip flow.
  return (
    <div className="user-mention-text whitespace-pre-wrap break-words">
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return segment.text === "" ? null : <span key={`text:${index}`}>{segment.text}</span>;
        }
        return (
          <MentionChip
            key={`mention:${segment.path}:${index}`}
            path={segment.path}
            kind={inferMentionKind(segment.path)}
          />
        );
      })}
    </div>
  );
}

function AssistantTurn({
  messages,
  previousUserCreatedAt,
  onRewrite,
}: {
  messages: TranscriptMessage[];
  previousUserCreatedAt?: string;
  onRewrite?: (input: { messageId: string; text: string }) => void | Promise<void>;
}) {
  const blocks = collectTurnBlocks(messages);
  const workCounts = countWorkBlocks(blocks);
  const timing = turnTiming(messages, previousUserCreatedAt);
  const [workExpanded, setWorkExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const label = workedForLabel({
    live: false,
    ...timing,
  });
  const outputText = turnTextOutput(blocks);
  const textBlocks = blocks.filter((block): block is Extract<TranscriptBlock, { type: "text" }> => block.type === "text");
  const target = lastTextBearingMessage(messages);
  const originalText = target ? rewrittenOriginalText(target.blocks) : undefined;
  const targetText = target
    ? target.blocks
        .filter((block): block is Extract<TranscriptBlock, { type: "text" }> => block.type === "text")
        .map((block) => block.text)
        .join("\n\n")
    : "";

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
    <article className="mx-auto w-full min-w-0 max-w-3xl overflow-x-clip" data-testid="assistant-turn">
      {workCounts.steps > 0 ? (
        <div className="space-y-1 px-1 py-0.5 pb-2">
          <WorkLogToggle
            label={label}
            expanded={workExpanded}
            onToggle={() => setWorkExpanded((value) => !value)}
          />
          {workExpanded
            ? blocks.map((block, index) => {
                if (block.type !== "thinking" && block.type !== "tool") {
                  return null;
                }
                return (
                  <TurnWorkBlock
                    key={`${messages[0]?.id ?? "turn"}:work:${index}`}
                    block={block}
                  />
                );
              })
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
              className={`chat-text relative min-w-0 px-1 py-0.5 text-foreground/80 ${isLast ? "pb-1" : "pb-4"}`}
            >
              <ConservativeMarkdown text={block.text} />
            </div>
          );
        })
      )}
      {outputText && !editing ? (
        <div className="assistant-turn-actions flex items-center gap-1.5 px-1 pb-3 pt-0.5">
          <CopyButton
            text={outputText}
            label="Copy"
            copiedLabel="Copied"
            showLabel
            data-testid="copy-assistant-output"
          />
          {onRewrite && target ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground shadow-none hover:bg-accent hover:text-foreground"
              aria-label="Edit"
              title="Edit"
              data-testid="edit-assistant-output"
              onClick={startEditing}
            >
              <PencilIcon className="size-3.5" aria-hidden="true" />
              <span>Edit</span>
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
}

function TurnWorkBlock({
  block,
}: {
  block: Extract<TranscriptBlock, { type: "thinking" | "tool" }>;
}) {
  switch (block.type) {
    case "thinking":
      return <ThinkingBlock text={block.text} open={false} />;
    case "tool":
      return <ToolRow block={block} />;
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}
