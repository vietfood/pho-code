import type { ModelSummary } from "@pho-code/protocol";

export function sameModel(
  left: ModelSummary | undefined,
  right: ModelSummary | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }
  return left.provider === right.provider && left.id === right.id;
}
