import { visibleActivityPhase, type SessionActivityPhase, type SessionActivitySummary } from "@pho-code/protocol";

export function sessionActivityLabel(phase: SessionActivityPhase): string {
  switch (phase) {
    case "working":
      return "Working";
    case "attention":
      return "Needs attention";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "idle":
      return "Idle";
    default: {
      const exhaustive: never = phase;
      return exhaustive;
    }
  }
}

export function sessionRowActivity(summary: SessionActivitySummary | undefined): {
  phase: SessionActivityPhase;
  label: string;
} | undefined {
  if (!summary) {
    return undefined;
  }
  const phase = visibleActivityPhase(summary);
  if (!phase) {
    return undefined;
  }
  return { phase, label: sessionActivityLabel(phase) };
}
