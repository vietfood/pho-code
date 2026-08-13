/** Beautiful UI StreamingText.tsx uses 55ms per word (MIT, Shane Levine). */
export const STREAM_WORD_MS = 55;

const TOKEN_RE = /\S+\s*|\s+/gu;

/** Split so joining reconstructs `text` exactly. */
export function splitStreamingTokens(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  return text.match(TOKEN_RE) ?? [text];
}

export function streamingCatchUpCount(behindTokens: number): number {
  if (behindTokens <= 0) {
    return 0;
  }
  if (behindTokens <= 4) {
    return 1;
  }
  return Math.min(12, Math.ceil(behindTokens / 4));
}

export function nextStreamingDisplay(displayed: string, target: string, maxTokens: number): string {
  if (displayed === target) {
    return displayed;
  }
  if (!target.startsWith(displayed)) {
    return target;
  }
  const remaining = target.slice(displayed.length);
  const tokens = splitStreamingTokens(remaining);
  if (tokens.length === 0) {
    return target;
  }
  const take = Math.min(Math.max(1, maxTokens), tokens.length);
  return displayed + tokens.slice(0, take).join("");
}
