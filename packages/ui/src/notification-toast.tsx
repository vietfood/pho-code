import type { ExtensionNotification } from "@pho-code/protocol";
import { Button } from "./ui/button";

export function NotificationToast({
  notification,
  onDismiss,
}: {
  notification: ExtensionNotification;
  onDismiss: () => void;
}) {
  return (
    <div
      className="fixed right-4 bottom-24 z-10 flex max-w-sm items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm"
      role="status"
      data-testid="extension-notification"
    >
      <p className="min-w-0 flex-1">{notification.message}</p>
      <Button size="sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss notification">
        Dismiss
      </Button>
    </div>
  );
}
