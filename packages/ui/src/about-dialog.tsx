import { useEffect, useRef } from "react";
import { XIcon } from "lucide-react";
import type { BootstrapState } from "@pho-code/protocol";
import { handleDialogTab } from "./lib/dialog-focus";
import { Button } from "./ui/button";

export function AboutDialog({
  state,
  onClose,
}: {
  state: BootstrapState;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const features = state.features?.features ?? state.activeSession?.features.features ?? [];
  const failures = features.filter((feature) => feature.status !== "loaded");

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
      data-testid="about-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-heading"
        data-testid="about-dialog"
        className="grid w-[min(28rem,calc(100dvw-2rem))] gap-3 rounded-xl border border-border bg-background p-4 shadow-lg"
        onKeyDown={(event) => {
          if (dialogRef.current) {
            handleDialogTab(event.nativeEvent, dialogRef.current);
          }
        }}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="about-heading" className="text-sm font-medium">
              About {state.appName}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Version {state.appVersion}</p>
          </div>
          <Button
            ref={closeRef}
            size="icon-sm"
            variant="ghost"
            aria-label="Close about"
            data-testid="about-close"
            onClick={onClose}
          >
            <XIcon className="size-3.5" />
          </Button>
        </header>
        <div className="grid gap-2 text-xs leading-relaxed text-muted-foreground">
          <p>
            {state.piRuntime.status === "ready"
              ? "Pi runtime available"
              : state.piRuntime.status === "starting"
                ? "Pi runtime starting"
                : state.piRuntime.error.message}
          </p>
          <p>
            Protocol {state.protocolVersion} · Node {state.versions.embeddedNode}
            {state.embeddedNodeCompatible ? " (compatible)" : " (below Pi requirement)"} · {state.intendedPiSdk.packageName}{" "}
            {state.intendedPiSdk.version}
          </p>
          {features.length > 0 ? (
            <ul className="m-0 grid list-none gap-1 p-0" data-testid="feature-diagnostics">
              {features.map((feature) => (
                <li key={feature.id}>
                  {feature.id} {feature.version} · {feature.status}
                </li>
              ))}
            </ul>
          ) : (
            <p>No baked features reported.</p>
          )}
          {failures.flatMap((feature) =>
            feature.diagnostics.map((diagnostic) => (
              <p key={`${feature.id}:${diagnostic.message}`} data-testid="feature-diagnostic">
                {diagnostic.message}
              </p>
            )),
          )}
          {state.features?.trustNotice ? <p>{state.features.trustNotice}</p> : null}
        </div>
      </section>
    </div>
  );
}
