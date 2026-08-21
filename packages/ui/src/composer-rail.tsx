import { FolderIcon, LaptopIcon, PlusIcon } from "lucide-react";
import { localMachineLabel } from "./lib/platform";

// Context chip rail above the composer field. Claude Code's composer is the
// visual reference (chips over the field, flat toolbar under it); the chrome and
// tokens are harness-owned. Machine/workspace context used to live in the hero
// header and, separately, in the docked meta strip — one rail now serves both
// variants. Git branch and worktree chips are deliberately absent: the protocol
// carries no branch state and branch switching is out of scope for this track.
export function ComposerRail({
  workspaceName,
  onAttach,
  attachDisabled = false,
  attachTitle,
}: {
  workspaceName?: string;
  onAttach?: () => void;
  attachDisabled?: boolean;
  attachTitle?: string;
}) {
  return (
    <div className="composer-rail" data-testid="composer-rail" aria-label="Session context">
      <span className="composer-rail-chip" data-testid="composer-rail-machine">
        <LaptopIcon className="size-3 shrink-0 opacity-70" aria-hidden="true" />
        <span className="composer-rail-chip-label">{localMachineLabel()}</span>
      </span>
      {workspaceName ? (
        <span className="composer-rail-chip" data-testid="composer-rail-workspace" title={workspaceName}>
          <FolderIcon className="size-3 shrink-0 opacity-70" aria-hidden="true" />
          <span className="composer-rail-chip-label is-name">{workspaceName}</span>
        </span>
      ) : null}
      {onAttach ? (
        <button
          type="button"
          className="composer-rail-add"
          data-testid="composer-rail-attach"
          disabled={attachDisabled}
          aria-label="Attach images"
          {...(attachTitle ? { title: attachTitle } : {})}
          onClick={() => {
            if (!attachDisabled) {
              onAttach();
            }
          }}
        >
          <PlusIcon className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
