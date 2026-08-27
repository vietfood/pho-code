import { cn } from "./lib/cn";
import { ProviderIcon } from "./provider-icon";

export type BackendIconKind = "pi" | "codex" | "claude" | "unknown";

const BACKEND_PROVIDER: Record<Exclude<BackendIconKind, "unknown">, string> = {
  pi: "pi",
  codex: "codex",
  claude: "claude",
};

export function backendIconKind(backendId: string): BackendIconKind {
  const id = backendId.trim().toLowerCase();
  if (id === "pi") {
    return "pi";
  }
  if (id === "codex" || id.startsWith("codex")) {
    return "codex";
  }
  if (id === "claude" || id.startsWith("claude")) {
    return "claude";
  }
  return "unknown";
}

export function BackendIcon({
  backendId,
  className,
}: {
  backendId: string;
  className?: string;
}) {
  const kind = backendIconKind(backendId);
  const provider = kind === "unknown" ? backendId : BACKEND_PROVIDER[kind];
  return (
    <span
      className={cn("inline-flex size-3.5 shrink-0 items-center justify-center", className)}
      aria-hidden="true"
      data-backend-kind={kind}
    >
      <ProviderIcon provider={provider} className="size-full" />
    </span>
  );
}
