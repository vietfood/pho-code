export interface CompletedAtMention {
  path: string;
  start: number;
  end: number;
}

const MENTION_PREFIX = /[\s([{]/u;

export function formatAtMentionToken(path: string): string {
  if (/[\s"]/u.test(path)) {
    return `@"${path.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}"`;
  }
  return `@${path}`;
}

export function extractAtMentionPaths(text: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const match of findCompletedAtMentions(text)) {
    if (seen.has(match.path)) {
      continue;
    }
    seen.add(match.path);
    paths.push(match.path);
  }
  return paths;
}

export function findCompletedAtMentions(text: string): CompletedAtMention[] {
  const matches: CompletedAtMention[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "@") {
      continue;
    }
    if (index > 0 && !MENTION_PREFIX.test(text[index - 1] ?? "")) {
      continue;
    }
    const consumed = consumeAtMention(text, index);
    if (!consumed) {
      continue;
    }
    matches.push({ path: consumed.path, start: index, end: consumed.end });
    index = consumed.end - 1;
  }
  return matches;
}

function consumeAtMention(text: string, start: number): { path: string; end: number } | null {
  const next = start + 1;
  if (text[next] === '"') {
    return consumeQuotedPath(text, next + 1);
  }
  let end = next;
  while (end < text.length) {
    const ch = text[end];
    if (ch === undefined || /[\s@"]/u.test(ch)) {
      break;
    }
    end += 1;
  }
  if (end === next) {
    return null;
  }
  return { path: text.slice(next, end), end };
}

function consumeQuotedPath(text: string, contentStart: number): { path: string; end: number } | null {
  let path = "";
  let index = contentStart;
  while (index < text.length) {
    const ch = text[index];
    if (ch === "\n") {
      return null;
    }
    if (ch === "\\") {
      const escaped = text[index + 1];
      if (escaped === '"' || escaped === "\\") {
        path += escaped;
        index += 2;
        continue;
      }
    }
    if (ch === '"') {
      if (path === "") {
        return null;
      }
      return { path, end: index + 1 };
    }
    path += ch;
    index += 1;
  }
  return null;
}
