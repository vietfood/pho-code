/** Hover title for compact sidebar session rows: keep preview only when it adds information. */
export function sessionRowTooltip(session: { title: string; preview?: string }): string {
  if (!session.preview || session.preview === session.title) {
    return session.title;
  }
  return `${session.title}\n${session.preview}`;
}
