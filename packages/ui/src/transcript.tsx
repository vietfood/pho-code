import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { UserIcon } from "lucide-react";
import type { RunWorkEntry, SessionSnapshot, TranscriptBlock, TranscriptMessage } from "@pho-code/protocol";
import {
  collectTurnBlocks,
  countWorkBlocks,
  groupTranscriptSegments,
  turnTiming,
  workedForLabel,
} from "./lib/work-log";
import { isNearBottom } from "./lib/stick-to-bottom";
import { ConservativeMarkdown } from "./markdown";
import { ThinkingBlock } from "./thinking-block";
import { ToolRow } from "./tool-row";
import { WorkLogToggle } from "./work-log-toggle";

// Transcript layout adapted from refs/t3code MessagesTimeline.tsx (MIT, T3 Tools Inc., 6bc6cb6).
// Turn-level “Worked for …” collapse is Codex-inspired (visual reference only).
// User avatar chip is harness-owned Cursor-inspired chrome.

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
        <article className="mx-auto w-full min-w-0 max-w-3xl overflow-x-clip px-1 py-0.5 pb-4 streaming-text" data-testid="streaming-text">
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
      <div className="relative flex max-h-[300px] max-w-[80%] items-start gap-2.5 overflow-y-auto break-words rounded-2xl bg-message px-3 py-2.5 text-sm leading-relaxed text-message-foreground">
        <span
          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground/10 text-message-foreground"
          aria-hidden="true"
        >
          <UserIcon className="size-3 opacity-80" />
        </span>
        <div className="min-w-0 flex-1">
          {message.blocks.map((block, index) => (
            <TranscriptBlockView key={`${message.id}:${index}`} block={block} />
          ))}
        </div>
      </div>
    </article>
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
                if (block.type === "text") {
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
      {blocks.map((block, index) => {
        if (block.type !== "text") {
          return null;
        }
        return (
          <div
            key={`${messages[0]?.id ?? "turn"}:text:${index}`}
            className="relative min-w-0 px-1 py-0.5 pb-4 text-sm leading-relaxed text-foreground/80"
          >
            <ConservativeMarkdown text={block.text} />
          </div>
        );
      })}
    </article>
  );
}

function TurnWorkBlock({ block }: { block: Exclude<TranscriptBlock, { type: "text" }> }) {
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

function TranscriptBlockView({ block }: { block: TranscriptBlock }) {
  switch (block.type) {
    case "text":
      return <ConservativeMarkdown text={block.text} />;
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
