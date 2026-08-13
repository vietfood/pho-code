import {
  BotIcon,
  EyeIcon,
  FolderIcon,
  GlobeIcon,
  SearchIcon,
  SquarePenIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
import type { WorkEntryIconName } from "./tool-presentation";

export function WorkEntryIcon({ name, className }: { name: WorkEntryIconName; className?: string }) {
  switch (name) {
    case "terminal":
      return <TerminalIcon className={className} aria-hidden="true" />;
    case "eye":
      return <EyeIcon className={className} aria-hidden="true" />;
    case "square-pen":
      return <SquarePenIcon className={className} aria-hidden="true" />;
    case "search":
      return <SearchIcon className={className} aria-hidden="true" />;
    case "globe":
      return <GlobeIcon className={className} aria-hidden="true" />;
    case "folder":
      return <FolderIcon className={className} aria-hidden="true" />;
    case "bot":
      return <BotIcon className={className} aria-hidden="true" />;
    case "wrench":
      return <WrenchIcon className={className} aria-hidden="true" />;
    default: {
      const exhaustive: never = name;
      return exhaustive;
    }
  }
}
