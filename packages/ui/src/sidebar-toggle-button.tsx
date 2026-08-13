import { PanelLeftIcon } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "./lib/cn";

export function SidebarToggleButton({
  collapsed,
  onToggle,
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      data-testid="toggle-sidebar"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
      aria-expanded={!collapsed}
      className={cn(
        "no-drag size-6 shrink-0 text-sidebar-muted-foreground hover:text-sidebar-foreground",
        className,
      )}
    >
      <PanelLeftIcon className="size-3.5" aria-hidden="true" />
    </Button>
  );
}
