import { FileIcon, FolderIcon } from "lucide-react";
import type { WorkspaceReferenceKind } from "@pho-code/protocol";
import { InlineChip } from "./inline-chip-shell";
import { mentionLabel } from "./lib/at-mention";

// Cursor-inspired file/folder mention chip (visual reference only; harness-owned).

export function MentionChip({
  path,
  kind = "file",
  className,
}: {
  path: string;
  kind?: WorkspaceReferenceKind;
  className?: string;
}) {
  const Icon = kind === "folder" ? FolderIcon : FileIcon;
  return (
    <InlineChip
      className={className}
      data={{ "data-mention-path": path, "data-mention-kind": kind }}
      title={path}
      ariaLabel={path}
      icon={<Icon className="mention-chip-icon" aria-hidden="true" />}
      label={mentionLabel(path)}
    />
  );
}
