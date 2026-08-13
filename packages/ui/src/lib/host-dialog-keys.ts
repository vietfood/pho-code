import type { HostDialogRequest, ResolveHostDialogInput } from "@pho-code/protocol";

export type HostDialogResolution = Omit<ResolveHostDialogInput, "requestId">;

/**
 * Keyboard confirm for select/confirm dock dialogs. Input kind uses form submit.
 * Digits 1–9 only change selection; Enter confirms the current choice.
 */
export function hostDialogEnterResolution(
  kind: HostDialogRequest["kind"],
  selected: string,
): HostDialogResolution | null {
  switch (kind) {
    case "select":
      return selected.length > 0 ? { selected } : null;
    case "confirm":
      return { confirmed: true };
    case "input":
      return null;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
