export type ComposerHighlight = "none" | "mention" | "slash";

/** Transient @ / tokens color the composer outline. */
export function composerHighlight(input: {
  mentionOpen: boolean;
  slashOpen: boolean;
}): ComposerHighlight {
  if (input.slashOpen) {
    return "slash";
  }
  if (input.mentionOpen) {
    return "mention";
  }
  return "none";
}
