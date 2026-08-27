import { LoadingDots } from "./loading-dots";

/** Tile body shown while a chat tab's session is opening; the tile frame
 * above it carries the pending title and window controls. */
export function ChatPaneLoading() {
  return (
    <section
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="Conversation"
      aria-busy="true"
      data-testid="session-switching"
    >
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
