import type { PrepareRemoveProjectResult } from "@pho-code/protocol";
import { ConfirmRemovalDialog } from "./confirm-removal-dialog";
import { projectRemovalWarning } from "./lib/project-removal";

export function RemoveProjectDialog({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: PrepareRemoveProjectResult;
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
      testId="remove-project"
      heading="Remove project?"
      body={projectRemovalWarning(pending)}
      confirmLabel="Remove project"
      focus="cancel"
    />
  );
}
