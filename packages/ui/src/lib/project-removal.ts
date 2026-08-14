import type { PrepareRemoveProjectResult } from "@pho-code/protocol";

/** Owner-facing warning copy for removing a recent project and trashing its chats. */
export function projectRemovalWarning(pending: Pick<PrepareRemoveProjectResult, "displayName" | "sessionCount">): string {
  const name = pending.displayName;
  if (pending.sessionCount === 0) {
    return `“${name}” will leave the project list. The folder on disk is not deleted, and there are no saved chats to move.`;
  }
  const chats = pending.sessionCount === 1 ? "1 chat" : `${pending.sessionCount} chats`;
  return `“${name}” will leave the project list and ${chats} (including archived) will move to the operating-system Trash. The folder on disk is not deleted. Restore chats from Finder or the desktop Trash, not from Archive.`;
}
