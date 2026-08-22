/** Newest characters shown with Beautiful UI `.stream-tail` while tokens arrive. */
export const STREAM_TAIL_MAX = 20;

const MARKDOWNISH = /[*_`#[\]()!<>|]/u;

export function splitStreamTail(text: string, maxTail = STREAM_TAIL_MAX): { head: string; tail: string } {
  if (text.length === 0) {
    return { head: "", tail: "" };
  }
  if (text.length <= maxTail) {
    return { head: "", tail: text };
  }
  const windowStart = text.length - maxTail;
  const window = text.slice(windowStart);
  const match = /\s\S*$/u.exec(window);
  if (match?.index === undefined) {
    return { head: text.slice(0, windowStart), tail: window };
  }
  const at = windowStart + match.index + 1;
  return { head: text.slice(0, at), tail: text.slice(at) };
}

/** Keep markdown markers in the GFM pipeline; only tail-blur trailing prose. */
export function splitMarkdownStreamTail(text: string): { head: string; tail: string } {
  const split = splitStreamTail(text);
  if (split.head === "" || MARKDOWNISH.test(split.tail)) {
    return { head: text, tail: "" };
  }
  return split;
}
