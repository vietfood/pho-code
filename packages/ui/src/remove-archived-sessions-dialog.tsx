import type { PrepareRemoveArchivedSessionsResult } from "@pho-code/protocol";
import { ConfirmRemovalDialog } from "./confirm-removal-dialog";
import { archivedRemovalWarning } from "./lib/archived-removal";

export function RemoveArchivedSessionsDialog({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: PrepareRemoveArchivedSessionsResult;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmRemovalDialog
      pending={pending}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
      testId="remove-archived-sessions"
      heading="Delete all archived chats?"
      body={archivedRemovalWarning(pending)}
      confirmLabel="Move to Trash"
    />
  );
}
