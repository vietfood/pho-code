export interface AtQuery {
  start: number;
  query: string;
}

export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; path: string };

/** Same boundary rules as runtime INLINE_AT_MENTION / findAtQuery (skip emails). */
const INLINE_AT_MENTION = /(?:^|[\s([{])@([^\s@]+)/gu;

export function findAtQuery(text: string, cursor: number): AtQuery | null {
  if (cursor < 0 || cursor > text.length) {
    return null;
  }
  const before = text.slice(0, cursor);
  const match = /(?:^|[\s([{])@([^\s@]*)$/u.exec(before);
  if (!match) {
    return null;
  }
  const query = match[1] ?? "";
  return {
    start: before.length - query.length - 1,
    query,
  };
}

export function insertAtMention(
  text: string,
  mention: AtQuery,
  cursor: number,
  path: string,
): { text: string; cursor: number } {
  const after = text.slice(cursor);
  const inserted = `@${path}`;
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

export function inferMentionKind(path: string): "file" | "folder" {
  return path.endsWith("/") ? "folder" : "file";
}

export function parseMentionSegments(text: string): MentionSegment[] {
  if (text === "") {
    return [{ type: "text", text: "" }];
  }

  const segments: MentionSegment[] = [];
  let cursor = 0;
  INLINE_AT_MENTION.lastIndex = 0;

  for (const match of text.matchAll(INLINE_AT_MENTION)) {
    const path = match[1]?.trim() ?? "";
    if (path === "" || match.index === undefined) {
      continue;
    }
    // match starts at boundary char or start; @ is one char before the path capture
    const atIndex = match.index + match[0].indexOf("@");
    if (atIndex > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, atIndex) });
    }
    segments.push({ type: "mention", path });
    cursor = atIndex + 1 + path.length;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor) });
  }

  if (segments.length === 0) {
    return [{ type: "text", text }];
  }
  return segments;
}
