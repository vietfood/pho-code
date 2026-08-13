export type ComposerHighlight = "none" | "max" | "mention" | "slash";

/** Transient @ / tokens win over the persistent max-thinking accent. */
export function composerHighlight(input: {
  mentionOpen: boolean;
  slashOpen: boolean;
  maxThinking: boolean;
}): ComposerHighlight {
  if (input.slashOpen) {
    return "slash";
  }
  if (input.mentionOpen) {
    return "mention";
  }
  if (input.maxThinking) {
    return "max";
  }
  return "none";
}
