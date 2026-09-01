import { useRef } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { ModelDialogShell } from "./model-dialog-shell";
import { Button } from "./ui/button";

export function FullAccessWarningDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <ModelDialogShell testId="full-access-warning" busy={false} onCancel={onCancel} focusKey="full-access" confirmRef={confirmRef}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive" aria-hidden="true">
          <TriangleAlertIcon className="size-4" />
        </span>
        <div className="grid gap-1">
          <h2 id="full-access-warning-heading" className="text-sm font-medium">Give this chat Full access?</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">The agent can use the app process&apos;s broad filesystem and network authority without Pho Code&apos;s ordinary approval routing.</p>
        </div>
      </div>
      <ul className="grid list-disc gap-1.5 pl-4 text-xs leading-relaxed text-muted-foreground" data-testid="full-access-warning-details">
        <li>Files and credentials may be read, changed, exposed, or lost.</li>
        <li>Network data and external systems may be changed, published, or damaged.</li>
        <li>Prompt injection or untrusted content can cause unintended actions.</li>
        <li>Permanent deletion, privilege escalation, destructive Git recovery bypass, and changing active safety controls remain blocked.</li>
      </ul>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button ref={confirmRef} type="button" size="sm" variant="destructive" data-testid="full-access-warning-confirm" onClick={onConfirm}>Enable Full access</Button>
      </div>
    </ModelDialogShell>
  );
}
