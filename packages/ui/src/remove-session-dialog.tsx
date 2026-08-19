import type { PrepareRemoveSessionResult } from "@pho-code/protocol";
import { ConfirmRemovalDialog } from "./confirm-removal-dialog";

export function RemoveSessionDialog({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: PrepareRemoveSessionResult;
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
      testId="remove-session"
      heading="Move chat to Trash?"
      body={
        <>
          “{pending.title}” in {pending.workspaceDisplayName} will leave Pho Code and move to the operating-system
          Trash. Restore it from Finder or the desktop Trash, not from Archive.
        </>
      }
      confirmLabel="Move to Trash"
    />
  );
}
