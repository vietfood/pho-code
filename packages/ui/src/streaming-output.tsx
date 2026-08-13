import { useEffect, useRef, useState } from "react";
import { ConservativeMarkdown } from "./markdown";
import {
  nextStreamingDisplay,
  splitStreamingTokens,
  STREAM_WORD_MS,
  streamingCatchUpCount,
} from "./lib/smooth-stream";

// Word-paced reveal + last-word blur-in adapted from Beautiful UI
// StreamingText.tsx (MIT, Shane Levine, https://www.beautifului.dev/ retrieved
// 2026-08-13). Citations, follow-ups, source chips, and action rows omitted.
// Live markdown stays ConservativeMarkdown; Pi deltas remain authoritative.

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useSmoothStreamingText(target: string, active: boolean, resetKey?: string): string {
  const [displayed, setDisplayed] = useState(target);
  const displayedRef = useRef(displayed);
  const targetRef = useRef(target);
  displayedRef.current = displayed;
  targetRef.current = target;

  useEffect(() => {
    setDisplayed(targetRef.current);
  }, [resetKey]);

  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      setDisplayed(target);
      return;
    }
    const current = displayedRef.current;
    if (current === target) {
      return;
    }
    const remaining = target.startsWith(current) ? target.slice(current.length) : target;
    const take = streamingCatchUpCount(splitStreamingTokens(remaining).length);
    const id = window.setTimeout(() => {
      setDisplayed((value) => nextStreamingDisplay(value, target, take));
    }, STREAM_WORD_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [active, displayed, target]);

  return active ? displayed : target;
}

export function StreamingOutput({
  text,
  running,
}: {
  text: string;
  running: boolean;
}) {
  return (
    <article
      className="chat-text mx-auto w-full min-w-0 max-w-3xl overflow-x-clip px-1 py-0.5 pb-4 streaming-text"
      data-testid="streaming-text"
    >
      <ConservativeMarkdown text={text} isStreaming streamTail streamCaret={running} />
    </article>
  );
}
