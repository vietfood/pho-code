import type { BootstrapState } from "@pho-code/protocol";

export function DiagnosticsPanel({ state }: { state: BootstrapState }) {
  const features = state.features?.features ?? state.activeSession?.features.features ?? [];
  const failures = features.filter((feature) => feature.status !== "loaded");

  return (
    <details className="min-w-0 overflow-hidden text-[11px] text-sidebar-muted-foreground">
      <summary
        className="cursor-pointer list-none truncate text-muted-foreground [&::-webkit-details-marker]:hidden"
        data-testid="bootstrap-state"
      >
        About · Protocol {state.protocolVersion}
      </summary>
      <div className="mt-2 grid min-w-0 gap-2 break-words leading-relaxed">
        <p>{state.capabilities.piRuntime ? "Pi runtime available" : "Pi runtime not connected"}</p>
        <p>
          Node {state.versions.embeddedNode}
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
    </details>
  );
}
