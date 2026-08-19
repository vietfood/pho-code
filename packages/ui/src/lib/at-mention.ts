import { formatAtMentionToken } from "@pho-code/protocol";

export { formatAtMentionToken };

export interface AtQuery {
  start: number;
  query: string;
  raw: string;
}

export interface MentionSkipRange {
  start: number;
  end: number;
}

/** Same boundary rules as protocol findCompletedAtMentions (skip emails). */
export function findAtQuery(
  text: string,
  cursor: number,
  activeStart: number | null = null,
): AtQuery | null {
  if (cursor < 0 || cursor > text.length) {
    return null;
  }
  if (activeStart !== null) {
    const active = readActiveAtQuery(text, cursor, activeStart);
    if (active) {
      return active;
    }
  }
  return startAtQuery(text, cursor);
}

export function insertAtMention(
  text: string,
  mention: AtQuery,
  cursor: number,
  path: string,
): { text: string; cursor: number } {
  const after = text.slice(cursor);
  const inserted = formatAtMentionToken(path);
  const replacement = /^\s/u.test(after) ? inserted : `${inserted} `;
  const next = `${text.slice(0, mention.start)}${replacement}${after}`;
  return {
    text: next,
    cursor: mention.start + replacement.length,
  };
}

export function mentionLabel(path: string): string {
  const trimmed = path.replace(/\/+$/u, "");
  const slash = trimmed.lastIndexOf("/");
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

export function mentionDirectory(path: string): string | null {
  const trimmed = path.replace(/\/+$/u, "");
  const slash = trimmed.lastIndexOf("/");
  return slash === -1 ? null : trimmed.slice(0, slash);
}

export function inferMentionKind(path: string): "file" | "folder" {
  return path.endsWith("/") ? "folder" : "file";
}

function startAtQuery(text: string, cursor: number): AtQuery | null {
  const before = text.slice(0, cursor);
  const quoted = /(?:^|[\s([{])@"([^"\n]*)$/u.exec(before);
  if (quoted) {
    const inner = quoted[1] ?? "";
    return {
      start: before.length - inner.length - 2,
      query: unescapeMentionQuery(inner),
      raw: `"${inner}`,
    };
  }
  const plain = /(?:^|[\s([{])@([^\s@"]*)$/u.exec(before);
  if (!plain) {
    return null;
  }
  const query = plain[1] ?? "";
  return {
    start: before.length - query.length - 1,
    query,
    raw: query,
  };
}

function readActiveAtQuery(text: string, cursor: number, start: number): AtQuery | null {
  if (start < 0 || start >= cursor || start >= text.length || text[start] !== "@") {
    return null;
  }
  const raw = text.slice(start + 1, cursor);
  if (raw.includes("\n")) {
    return null;
  }
  if (raw.startsWith('"')) {
    const closing = indexOfUnescapedQuote(raw, 1);
    if (closing !== -1 && closing < raw.length - 1) {
      return null;
    }
    const inner = closing === -1 ? raw.slice(1) : raw.slice(1, closing);
    return { start, query: unescapeMentionQuery(inner), raw };
  }
  if (raw.includes("@")) {
    return null;
  }
  return { start, query: raw, raw };
}

function unescapeMentionQuery(value: string): string {
  return value.replace(/\\"/gu, '"').replace(/\\\\/gu, "\\");
}

function indexOfUnescapedQuote(value: string, from: number): number {
  for (let index = from; index < value.length; index += 1) {
    if (value[index] !== '"') {
      continue;
    }
    let slashes = 0;
    for (let lookback = index - 1; lookback >= 0 && value[lookback] === "\\"; lookback -= 1) {
      slashes += 1;
    }
    if (slashes % 2 === 0) {
      return index;
    }
  }
  return -1;
}
