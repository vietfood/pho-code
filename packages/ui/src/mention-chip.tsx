import { FileIcon, FolderIcon } from "lucide-react";
import type { WorkspaceReferenceKind } from "@pho-code/protocol";
import { cn } from "./lib/cn";
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
  const label = mentionLabel(path);
  const Icon = kind === "folder" ? FolderIcon : FileIcon;
  return (
    <span
      className={cn("mention-chip", className)}
      data-mention-path={path}
      data-mention-kind={kind}
      title={path}
      aria-label={path}
    >
      <Icon className="mention-chip-icon" aria-hidden="true" />
      <span className="mention-chip-label">{label}</span>
    </span>
  );
}
