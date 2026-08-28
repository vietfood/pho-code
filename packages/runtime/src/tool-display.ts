import { displayToolName } from "@pho-code/protocol";

export { displayToolName };

/** Underscored app-owned ids safe to replace in permission-dialog copy. */
export const APP_OWNED_TOOL_NAMES = Object.freeze([
  "web_search",
  "fetch_content",
  "move_to_trash",
  "read_skill",
  "ask_user_question",
  "update_plan_document",
  "execute_plan",
  "todo",
] as const);

/** Sanitizes extension-owned dialog copy before it crosses the host UI protocol boundary. */
export function displayToolNamesInText(value: string): string {
  let displayed = value.replaceAll(/github_[a-z0-9_]+/gu, (match) => displayToolName(match));
  for (const internalName of APP_OWNED_TOOL_NAMES) {
    displayed = displayed.replaceAll(internalName, displayToolName(internalName));
  }
  return displayed;
}
