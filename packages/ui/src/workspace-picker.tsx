import { FolderIcon, FolderOpenIcon } from "lucide-react";
import type { RecentWorkspaceRecord } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { isMacDesktop } from "./lib/platform";
import { SidebarToggleButton } from "./sidebar-toggle-button";
import { Button } from "./ui/button";

export function WorkspacePicker({
  recents,
  onPick,
  onOpenRecent,
  busy,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  recents: readonly RecentWorkspaceRecord[];
  onPick: () => void;
  onOpenRecent: (workspaceId: string) => void;
  busy: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  const mac = isMacDesktop();
  const showToggle = Boolean(sidebarCollapsed && onToggleSidebar);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-labelledby="workspace-heading">
      <header
        className={cn(
          "workspace-topbar drag-region gap-3 px-5",
          showToggle && mac ? "pl-[var(--workspace-titlebar-inset)]" : undefined,
        )}
      >
        {showToggle && onToggleSidebar ? (
          <SidebarToggleButton
            collapsed
            onToggle={onToggleSidebar}
            className="text-muted-foreground hover:text-foreground"
          />
        ) : null}
        <span className="text-xs text-muted-foreground">No active session</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-start justify-center px-8 py-12">
        <div className="w-full max-w-lg">
          <span
            className="mb-4 flex size-11 items-center justify-center rounded-xl bg-message text-muted-foreground"
            aria-hidden="true"
          >
            <FolderOpenIcon className="size-5 opacity-85" />
          </span>
          <h1 id="workspace-heading" className="text-xl font-medium tracking-tight text-foreground">
            Choose a workspace
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Open a local folder to start or resume a Pi session.</p>
          <Button className="mt-6 gap-2" onClick={onPick} disabled={busy}>
            <FolderIcon className="size-3.5" aria-hidden="true" />
            Choose workspace…
          </Button>
          {recents.length > 0 ? (
            <div className="mt-8 grid gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent</h2>
              <ul className="m-0 grid list-none gap-1 p-0">
                {recents.map((workspace) => (
                  <li key={workspace.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-accent disabled:opacity-50"
                      disabled={busy}
                      onClick={() => onOpenRecent(workspace.id)}
                    >
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-message text-muted-foreground"
                        aria-hidden="true"
                      >
                        <FolderIcon className="size-3.5 opacity-80" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm font-medium">{workspace.displayName}</strong>
                        <span className="block max-w-full truncate text-xs text-muted-foreground">{workspace.path}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
