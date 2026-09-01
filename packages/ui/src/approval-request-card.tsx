import { useEffect, useRef, useState } from "react";
import { ArrowUpIcon } from "lucide-react";
import type { ApprovalRequest, ApprovalRequestResolution } from "@pho-code/protocol";
import { handleDialogTab } from "./lib/dialog-focus";

const CHOICES: ReadonlyArray<{ value: ApprovalRequestResolution; label: string }> = [
  { value: "allow-once", label: "Allow once" },
  { value: "allow-session", label: "Allow for this session" },
  { value: "deny", label: "No, provide reason" },
];

export function ApprovalRequestCard({
  request,
  onResolve,
}: {
  request: ApprovalRequest;
  onResolve: (resolution: ApprovalRequestResolution, reason?: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const [resolution, setResolution] = useState<ApprovalRequestResolution>("allow-once");
  const [reason, setReason] = useState("");
  useEffect(() => firstRef.current?.focus(), [request.requestId]);
  return (
    <div ref={rootRef} className="approval-card mb-2 text-card-foreground" role="dialog" aria-labelledby="approval-request-title" data-testid="approval-request-card" onKeyDown={(event) => rootRef.current && handleDialogTab(event.nativeEvent, rootRef.current)}>
      <form onSubmit={(event) => { event.preventDefault(); onResolve(resolution, resolution === "deny" ? reason : undefined); }}>
        <div className="approval-card-body">
          <p className="approval-card-eyebrow m-0">{request.source === "automatic-review" ? "Owner decision needed" : "Pending approval"}</p>
          <h2 id="approval-request-title" className="approval-card-title m-0">{request.action.title}</h2>
          <p className="text-xs text-muted-foreground">{request.action.summary}</p>
          {request.action.target ? <p className="grid gap-0.5 rounded-md bg-muted/40 px-2 py-1.5 text-xs"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">{request.action.target.label}</span><code className="break-all">{request.action.target.value}</code></p> : null}
          {request.action.exactInput ? (
            <details className="rounded-md border border-border/70 px-2 py-1.5 text-xs">
              <summary className="cursor-pointer text-muted-foreground">View exact request</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed" data-testid="approval-request-exact-input">{request.action.exactInput}</pre>
            </details>
          ) : null}
          {request.reason ? <p className="text-xs text-warning">{request.reason}</p> : null}
          <div className="grid gap-1.5" role="radiogroup" aria-label="Approval decision">
            {CHOICES.map((choice, index) => <label key={choice.value} className="approval-radio"><input ref={index === 0 ? firstRef : undefined} type="radio" name="approval-decision" value={choice.value} checked={resolution === choice.value} onChange={() => setResolution(choice.value)} /><span>{choice.label}</span></label>)}
          </div>
          {resolution === "deny" ? <label className="grid gap-1 text-xs">Reason (optional)<input className="rounded-md border border-border bg-background px-2 py-1.5" data-testid="approval-request-reason" value={reason} maxLength={4_000} onChange={(event) => setReason(event.target.value)} /></label> : null}
        </div>
        <div className="approval-card-footer"><button type="submit" className="approval-card-send" aria-label="Continue"><ArrowUpIcon className="size-3.5" aria-hidden="true" /></button></div>
      </form>
    </div>
  );
}
