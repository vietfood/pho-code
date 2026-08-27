import { ZapIcon } from "lucide-react";
import { cn } from "./lib/cn";

export function FastModeChip({
  enabled,
  disabled,
  description,
  onChange,
}: {
  enabled: boolean;
  disabled: boolean;
  description?: string;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={cn("composer-meta-select composer-fast-toggle", enabled && "is-active")}
      data-testid="fast-mode-toggle"
      aria-label={`Fast mode: ${enabled ? "on" : "off"}`}
      aria-pressed={enabled}
      disabled={disabled}
      title={description ?? "Use the backend's faster service tier"}
      onClick={() => onChange(!enabled)}
    >
      <ZapIcon className="size-3" aria-hidden="true" />
      Fast
    </button>
  );
}
