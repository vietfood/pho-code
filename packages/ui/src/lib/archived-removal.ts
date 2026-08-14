import type { PrepareRemoveArchivedSessionsResult } from "@pho-code/protocol";

/** Owner-facing warning copy for deleting every archived chat in a project group. */
export function archivedRemovalWarning(
  pending: Pick<PrepareRemoveArchivedSessionsResult, "displayName" | "sessionCount">,
): string {
  const chats = pending.sessionCount === 1 ? "1 archived chat" : `${pending.sessionCount} archived chats`;
  return `All ${chats} in “${pending.displayName}” will leave Pho Code and move to the operating-system Trash. Restore them from Finder or the desktop Trash, not from Archive. Active chats in the project are not affected.`;
}
