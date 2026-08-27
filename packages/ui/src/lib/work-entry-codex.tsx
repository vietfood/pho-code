import type { ReactNode } from "react";
import {
  IconBrackets,
  IconChecklist,
  IconDirectionRightDown,
  IconFile,
  IconGlobe,
  IconListBulleted,
  IconListNumbered,
  IconPlay,
  IconQuestion,
  IconQuote,
  IconReplace,
  IconSave,
  IconSearch,
  IconStar,
  IconTrash,
} from "@codexteam/icons";
import { cn } from "./cn";
import { CurrentColorMask } from "./current-color-mask";
import { githubWorkGlyph } from "./work-entry-github";
import type { WorkEntryIconName } from "../tool-presentation";

const CODEX_SVGS: Record<Exclude<WorkEntryIconName, "github">, string> = {
  list: IconListBulleted,
  read: IconFile,
  write: IconSave,
  edit: IconReplace,
  run: IconPlay,
  search: IconSearch,
  find: IconSearch,
  "web-search": IconSearch,
  fetch: IconGlobe,
  trash: IconTrash,
  skill: IconStar,
  ask: IconQuestion,
  todos: IconChecklist,
  plan: IconListNumbered,
  execute: IconDirectionRightDown,
  thought: IconQuote,
  wrench: IconBrackets,
};

export function codexTeamGlyph(name: WorkEntryIconName, className?: string): ReactNode {
  if (name === "github") {
    return githubWorkGlyph(className);
  }
  return (
    <span className={cn("block", className)} aria-hidden="true">
      <CurrentColorMask src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(CODEX_SVGS[name])}`} />
    </span>
  );
}
