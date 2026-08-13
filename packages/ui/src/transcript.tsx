import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { UserIcon } from "lucide-react";
import type { RunWorkEntry, SessionSnapshot, TranscriptBlock, TranscriptMessage } from "@pho-code/protocol";
import { CopyButton } from "./copy-button";
import { inferMentionKind, parseMentionSegments } from "./lib/at-mention";
import {
  collectTurnBlocks,
  countWorkBlocks,
  groupTranscriptSegments,
  turnTextOutput,
  turnTiming,
  workedForLabel,
} from "./lib/work-log";
import { isNearBottom } from "./lib/stick-to-bottom";
import { ConservativeMarkdown } from "./markdown";
import { MentionChip } from "./mention-chip";
import { ThinkingBlock } from "./thinking-block";
import { ToolRow } from "./tool-row";
import { WorkLogToggle } from "./work-log-toggle";

// Transcript layout adapted from refs/t3code MessagesTimeline.tsx (MIT, T3 Tools Inc., 6bc6cb6).
// Turn-level “Worked for …” collapse is Codex-inspired (visual reference only).
// User avatar chip and @ mention chips are harness-owned Cursor-inspired chrome.
// Assistant-output copy control informed by refs/pi-web MessageView (MIT).

export function Transcript({ snapshot }: { snapshot: SessionSnapshot }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const wasRunningRef = useRef(false);
  const running = snapshot.run.status === "admitted" || snapshot.run.status === "streaming";
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
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running, snapshot.run.startedAt]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !stickToBottomRef.current) {
      return;
    }
    scroller.scrollTop = scroller.scrollHeight;
  }, [snapshot.messages, snapshot.run.streamingText, snapshot.run.work, liveWorkExpanded]);

  const liveWorkCounts = countWorkBlocks(snapshot.run.work);
  const segments = groupTranscriptSegments(snapshot.messages);
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
        <article className="chat-text mx-auto w-full min-w-0 max-w-3xl overflow-x-clip px-1 py-0.5 pb-4 streaming-text" data-testid="streaming-text">
          <ConservativeMarkdown text={snapshot.run.streamingText} isStreaming />
          {running ? <span className="streaming-caret" aria-hidden="true" /> : null}
        </article>
      ) : null}
      {running && !snapshot.run.streamingText && liveWorkCounts.steps === 0 ? (
        <div className="mx-auto w-full max-w-3xl px-1 pb-4 pt-1">
          <p className="text-[12px] font-medium text-secondary-label">{liveLabel}</p>
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
}: {
  messages: TranscriptMessage[];
  previousUserCreatedAt?: string;
}) {
  const blocks = collectTurnBlocks(messages);
  const workCounts = countWorkBlocks(blocks);
  const timing = turnTiming(messages, previousUserCreatedAt);
  const [workExpanded, setWorkExpanded] = useState(false);
  const label = workedForLabel({
    live: false,
    ...timing,
  });
  const outputText = turnTextOutput(blocks);
  const textBlocks = blocks.filter((block): block is Extract<TranscriptBlock, { type: "text" }> => block.type === "text");

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
      {textBlocks.map((block, index) => {
        const isLast = index === textBlocks.length - 1;
        return (
          <div
            key={`${messages[0]?.id ?? "turn"}:text:${index}`}
            className={`chat-text relative min-w-0 px-1 py-0.5 text-foreground/80 ${isLast ? "pb-1" : "pb-4"}`}
          >
            <ConservativeMarkdown text={block.text} />
          </div>
        );
      })}
      {outputText ? (
        <div className="assistant-turn-actions flex items-center px-1 pb-3 pt-0.5">
          <CopyButton
            text={outputText}
            label="Copy"
            copiedLabel="Copied"
            showLabel
            data-testid="copy-assistant-output"
          />
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
