import { useSyncExternalStore, type ReactNode } from "react";
import {
  BookmarkIcon,
  BotIcon,
  EyeIcon,
  FolderIcon,
  GlobeIcon,
  ListChecksIcon,
  ListTreeIcon,
  MessageCircleIcon,
  SearchIcon,
  SquarePenIcon,
  TerminalIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react";
import { DEFAULT_WORK_ENTRY_ICONS, type WorkEntryIconPack } from "@pho-code/protocol";
import { getWorkEntryIconPack, subscribeWorkEntryIconPack } from "./lib/appearance-theme";
import { githubWorkGlyph } from "./lib/work-entry-github";
import { codexTeamGlyph } from "./lib/work-entry-codex";
import { meteoconsGlyph } from "./lib/work-entry-meteocons";
import type { WorkEntryIconName } from "./tool-presentation";

export { METEOCONS_OPTICAL_SCALE } from "./lib/work-entry-meteocons";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Pho paths sit inset in the 24 box; scale so they match Lucide at size-3.5. */
export const PHO_OPTICAL_SCALE = 1.22;
const PHO_OPTICAL_TRANSFORM = `translate(12 12) scale(${PHO_OPTICAL_SCALE}) translate(-12 -12)`;

export function WorkEntryIcon({
  name,
  className,
  pack,
}: {
  name: WorkEntryIconName;
  className?: string;
  pack?: WorkEntryIconPack;
}) {
  const documentPack = useSyncExternalStore(
    subscribeWorkEntryIconPack,
    getWorkEntryIconPack,
    () => DEFAULT_WORK_ENTRY_ICONS,
  );
  const resolved = pack ?? documentPack;
  return (
    <span data-work-icon={name} data-work-icon-pack={resolved} className="contents">
      {workEntryGlyph(resolved, name, className)}
    </span>
  );
}

function workEntryGlyph(pack: WorkEntryIconPack, name: WorkEntryIconName, className?: string): ReactNode {
  switch (pack) {
    case "lucide":
      return lucideGlyph(name, className);
    case "pho":
      return phoGlyph(name, className);
    case "codex-team":
      return codexTeamGlyph(name, className);
    case "meteocons":
      return meteoconsGlyph(name, className);
    default: {
      const exhaustive: never = pack;
      return exhaustive;
    }
  }
}

function phoGlyph(name: WorkEntryIconName, className?: string): ReactNode {
  if (name === "github") {
    return githubWorkGlyph(className);
  }
  const paths = PHO_PATHS[name];
  return (
    <svg className={className} viewBox="0 0 24 24" overflow="visible" aria-hidden="true" {...STROKE}>
      <g transform={PHO_OPTICAL_TRANSFORM}>{paths}</g>
    </svg>
  );
}

function lucideGlyph(name: WorkEntryIconName, className?: string): ReactNode {
  switch (name) {
    case "list":
      return <FolderIcon className={className} aria-hidden="true" />;
    case "read":
      return <EyeIcon className={className} aria-hidden="true" />;
    case "write":
    case "edit":
      return <SquarePenIcon className={className} aria-hidden="true" />;
    case "run":
      return <TerminalIcon className={className} aria-hidden="true" />;
    case "search":
    case "find":
    case "web-search":
      return <SearchIcon className={className} aria-hidden="true" />;
    case "fetch":
      return <GlobeIcon className={className} aria-hidden="true" />;
    case "trash":
      return <Trash2Icon className={className} aria-hidden="true" />;
    case "skill":
      return <BookmarkIcon className={className} aria-hidden="true" />;
    case "ask":
      return <MessageCircleIcon className={className} aria-hidden="true" />;
    case "todos":
      return <ListChecksIcon className={className} aria-hidden="true" />;
    case "plan":
      return <ListTreeIcon className={className} aria-hidden="true" />;
    case "execute":
    case "thought":
      return <BotIcon className={className} aria-hidden="true" />;
    case "github":
      return githubWorkGlyph(className);
    case "wrench":
      return <WrenchIcon className={className} aria-hidden="true" />;
    default: {
      const exhaustive: never = name;
      return exhaustive;
    }
  }
}

const PHO_PATHS: Record<Exclude<WorkEntryIconName, "github">, ReactNode> = {
  list: (
    <>
      <path d="M4 7.5 12 4l8 3.5V18l-8 3.5L4 18Z" />
      <path d="M8 11h8M8 14.5h5" />
    </>
  ),
  read: (
    <>
      <path d="M7 4h7l4 4v12H7Z" />
      <path d="M14 4v4h4M9.5 12h5M9.5 15.5h3.5" />
    </>
  ),
  write: (
    <>
      <path d="M7 4h7l4 4v12H7Z" />
      <path d="M14 4v4h4M12 12v4M10 14h4" />
    </>
  ),
  edit: (
    <>
      <path d="M7 4h7l4 4v5" />
      <path d="M14 4v4h4M7 20h4" />
      <path d="M15.2 11.2 20 16l-1.6 1.6-4.8-4.8Z" />
    </>
  ),
  run: (
    <>
      <path d="M5 7h14v10H5Z" />
      <path d="m9 10 3 2-3 2M13 14h3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5" />
      <path d="m14.5 14.5 5 5" />
    </>
  ),
  find: (
    <>
      <path d="M5 5h7l3 3v4" />
      <circle cx="14.5" cy="15.5" r="3.5" />
      <path d="m17 18 3 3" />
    </>
  ),
  "web-search": (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 3 2.5 13 0 16M12 4c-2.5 3-2.5 13 0 16" />
    </>
  ),
  fetch: (
    <>
      <circle cx="12" cy="10" r="6" />
      <path d="M12 4c1.8 2.2 1.8 9.8 0 12M12 4C10.2 6.2 10.2 13.8 12 16M6 10h12M12 14v7M9 18l3 3 3-3" />
    </>
  ),
  trash: (
    <>
      <path d="M5 8h14M9 8V6h6v2M8 8l1 12h6l1-12" />
    </>
  ),
  skill: (
    <>
      <path d="M7 5h10v15l-5-2.5L7 20Z" />
      <path d="M10 9h4" />
    </>
  ),
  ask: (
    <>
      <path d="M5 6h14v9H9l-4 3.5V6Z" />
    </>
  ),
  todos: (
    <>
      <path d="M5 7h3l1.5 1.5L13 5" />
      <path d="M5 13h3l1.5 1.5L13 11" />
      <path d="M16 7h3M16 13h3" />
    </>
  ),
  plan: (
    <>
      <path d="M7 4h10v16H7Z" />
      <path d="M10 9h4M10 12.5h4M10 16h2.5" />
    </>
  ),
  execute: (
    <>
      <path d="M6 6h12v12H6Z" />
      <path d="m10 9 6 3-6 3Z" />
    </>
  ),
  wrench: (
    <>
      <path d="M14.5 6.5a3.5 3.5 0 0 1 3 3L14 13l-3-3 3.5-3.5Z" />
      <path d="m11 10-6 6 3 3 6-6" />
    </>
  ),
  thought: (
    <>
      <path d="M12 3.2 14.6 9.4 20.8 12 14.6 14.6 12 20.8 9.4 14.6 3.2 12 9.4 9.4Z" />
      <path d="M12 7.6 13.2 10.8 16.4 12 13.2 13.2 12 16.4 10.8 13.2 7.6 12 10.8 10.8Z" />
    </>
  ),
};
