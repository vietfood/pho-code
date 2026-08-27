import { TriangleAlertIcon, XIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";

// Errors surface bottom-left so they never overlap the bottom-right NotificationToast.
export function ErrorToast({
  title = "Something went wrong",
  message,
  onDismiss,
  testId,
}: {
  title?: string;
  message: string;
  onDismiss: () => void;
  testId?: string;
}) {
  return (
    <Alert
      variant="destructive"
      className="fixed bottom-24 left-4 z-10 w-auto max-w-sm pr-10 shadow-sm"
      role="alert"
      {...(testId ? { "data-testid": testId } : {})}
    >
      <TriangleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="break-words">{message}</AlertDescription>
      <Button
        size="icon-sm"
        variant="ghost"
        className="absolute top-2 right-2 text-current"
        onClick={onDismiss}
        aria-label="Dismiss error"
      >
        <XIcon className="size-3.5" />
      </Button>
    </Alert>
  );
}
