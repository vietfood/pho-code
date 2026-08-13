import { useEffect, useLayoutEffect, useRef } from "react";
import { UserIcon } from "lucide-react";
import type { SessionSnapshot, TranscriptBlock, TranscriptMessage } from "@pho-code/protocol";
import { isNearBottom } from "./lib/stick-to-bottom";
import { ConservativeMarkdown } from "./markdown";
import { ThinkingBlock } from "./thinking-block";
import { ToolRow } from "./tool-row";

// Transcript layout adapted from refs/t3code MessagesTimeline.tsx (MIT, T3 Tools Inc., 6bc6cb6).
// User avatar chip is harness-owned Cursor-inspired chrome. Virtualization, diffs,
// agent spawn rows, and copy/revert actions omitted.

export function Transcript({ snapshot }: { snapshot: SessionSnapshot }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const wasRunningRef = useRef(false);
  const running = snapshot.run.status === "admitted" || snapshot.run.status === "streaming";

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
    }
    wasRunningRef.current = running;
  }, [running]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !stickToBottomRef.current) {
      return;
    }
    scroller.scrollTop = scroller.scrollHeight;
  }, [snapshot.messages, snapshot.run.streamingText, snapshot.run.thinkingText, snapshot.run.tools]);

  return (
    <div
      ref={scrollerRef}
      className="scrollbar-gutter-both flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4"
      data-testid="transcript"
      aria-live="polite"
    >
      {snapshot.messages.map((message) => (
        <MessageRow key={message.id} message={message} />
      ))}
      {(snapshot.run.thinkingText || snapshot.run.tools.length > 0) && (
        <div className="mx-auto w-full min-w-0 max-w-3xl overflow-x-clip pb-2">
          <div className="-mx-1 space-y-px px-1 py-0.5">
            {snapshot.run.thinkingText ? <ThinkingBlock text={snapshot.run.thinkingText} open={running} live /> : null}
            {snapshot.run.tools.map((tool) => (
              <ToolRow
                key={tool.callId}
                block={{
                  type: "tool",
                  callId: tool.callId,
                  name: tool.name,
                  status: tool.status,
                  inputPreview: tool.inputPreview,
                  outputPreview: tool.outputPreview,
                }}
              />
            ))}
          </div>
        </div>
      )}
      {snapshot.run.streamingText ? (
        <article className="mx-auto w-full min-w-0 max-w-3xl overflow-x-clip px-1 py-0.5 pb-4 streaming-text" data-testid="streaming-text">
          <ConservativeMarkdown text={snapshot.run.streamingText} isStreaming />
          {running ? <span className="streaming-caret" aria-hidden="true" /> : null}
        </article>
      ) : null}
      {running && !snapshot.run.streamingText ? (
        <div className="mx-auto w-full max-w-3xl px-1 pb-4 pt-1">
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-secondary-label tabular-nums">
            <span className="flex items-center gap-1" aria-hidden="true">
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40 animate-pulse motion-reduce:animate-none" />
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40 animate-pulse motion-reduce:animate-none [animation-delay:200ms]" />
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40 animate-pulse motion-reduce:animate-none [animation-delay:400ms]" />
            </span>
            <span className="min-w-0 truncate text-muted-foreground/55">Working</span>
          </div>
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

function MessageRow({ message }: { message: TranscriptMessage }) {
  if (message.role === "user") {
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

  const workBlocks = message.blocks.filter((block) => block.type === "thinking" || block.type === "tool");
  const textBlocks = message.blocks.filter((block) => block.type === "text");

  return (
    <article className="mx-auto w-full min-w-0 max-w-3xl overflow-x-clip">
      {workBlocks.length > 0 ? (
        <div className="-mx-1 space-y-px px-1 py-0.5 pb-2">
          {workBlocks.map((block, index) => (
            <TranscriptBlockView key={`${message.id}:work:${index}`} block={block} />
          ))}
        </div>
      ) : null}
      {textBlocks.map((block, index) => (
        <div key={`${message.id}:text:${index}`} className="relative min-w-0 px-1 py-0.5 pb-4 text-sm leading-relaxed text-foreground/80">
          <TranscriptBlockView block={block} />
        </div>
      ))}
    </article>
  );
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
