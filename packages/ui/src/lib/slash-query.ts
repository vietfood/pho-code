export interface SlashQuery {
  start: number;
  query: string;
}

/**
 * Last `/token` being typed at the caret, for a future skill menu.
 * Same boundary as `@` mentions so emails and URLs mid-word are ignored.
 */
export function findSlashQuery(text: string, cursor: number): SlashQuery | null {
  if (cursor < 0 || cursor > text.length) {
    return null;
  }
  const before = text.slice(0, cursor);
  const match = /(?:^|[\s([{])\/([^\s/]*)$/u.exec(before);
  if (!match) {
    return null;
  }
  const query = match[1] ?? "";
  return {
    start: before.length - query.length - 1,
    query,
  };
}
