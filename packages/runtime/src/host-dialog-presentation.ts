export function splitHostDialogPresentation(rawTitle: string): { title: string; message?: string } {
  const newline = rawTitle.indexOf("\n");
  if (newline === -1) {
    return { title: rawTitle };
  }
  const title = rawTitle.slice(0, newline).trim();
  const message = rawTitle.slice(newline + 1).trim();
  if (title.length === 0) {
    return { title: rawTitle };
  }
  if (message.length === 0) {
    return { title };
  }
  return { title, message };
}
