import { ChatHeader } from "./chat-header";
import { LoadingDots } from "./loading-dots";

export function ChatPaneLoading({
  sidebarCollapsed,
  onToggleSidebar,
}: {
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  return (
    <section
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="Conversation"
      aria-busy="true"
      data-testid="session-switching"
    >
      <ChatHeader
        {...(sidebarCollapsed ? { sidebarCollapsed: true } : {})}
        {...(onToggleSidebar ? { onToggleSidebar } : {})}
      />
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3"
        role="status"
        aria-live="polite"
      >
        <LoadingDots label="Opening session…" />
        <p className="text-sm text-muted-foreground">Opening session…</p>
      </div>
    </section>
  );
}
