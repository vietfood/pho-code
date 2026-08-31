import type { ModelSummary } from "@pho-code/protocol";

// The Cursor warning copy is Pi-specific (baked pi-cursor-sdk provider, local
// bridge), so it fires only for a Cursor-provider model on the Pi backend.
// Missing backend identity means Pi for pre-V5 compatibility.
export function isPiCursorModel(model: ModelSummary, backendId: string | undefined): boolean {
  return (backendId ?? "pi") === "pi" && model.provider.trim().toLowerCase() === "cursor";
}
