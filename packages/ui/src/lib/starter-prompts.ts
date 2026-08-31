import {
  BugIcon,
  FlaskConicalIcon,
  PlusIcon,
  TelescopeIcon,
  WandSparklesIcon,
  type LucideIcon,
} from "lucide-react";

export interface StarterPrompt {
  id: string;
  label: string;
  icon: LucideIcon;
}

// Clicking a chip fills the composer draft with the label; the owner edits or
// sends. Direct-send was rejected: vague starters ("Fix a bug") deserve one
// review beat before a run starts.
export const STARTER_PROMPTS: readonly StarterPrompt[] = [
  { id: "explain", label: "Explain this codebase", icon: TelescopeIcon },
  { id: "fix-bug", label: "Fix a bug", icon: BugIcon },
  { id: "write-tests", label: "Write tests", icon: FlaskConicalIcon },
  { id: "refactor", label: "Refactor code", icon: WandSparklesIcon },
  { id: "add-feature", label: "Add a feature", icon: PlusIcon },
];
