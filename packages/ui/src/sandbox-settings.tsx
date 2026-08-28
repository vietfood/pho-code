import { useEffect, useMemo, useState } from "react";
import {
  sandboxStatusLabel,
  sandboxStatusReasonLabel,
  type SandboxNetworkMode,
  type SandboxSettingsSnapshot,
  type UpdateSandboxSettingsInput,
} from "@pho-code/protocol";
import { Button } from "./ui/button";
import { InfoDisclosure } from "./info-disclosure";

function linesFromList(values: readonly string[]): string {
  return values.join("\n");
}

function listFromLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function SandboxSettingsSection({
  sandbox,
  busy,
  running,
  onChange,
}: {
  sandbox: SandboxSettingsSnapshot;
  busy: boolean;
  running: boolean;
  onChange: (input: UpdateSandboxSettingsInput) => void;
}) {
  const [domainDraft, setDomainDraft] = useState(() => linesFromList(sandbox.allowedDomains));
  const [readDraft, setReadDraft] = useState(() => linesFromList(sandbox.additionalReadPaths));
  const [writeDraft, setWriteDraft] = useState(() => linesFromList(sandbox.additionalWritePaths));
  useEffect(() => {
    setDomainDraft(linesFromList(sandbox.allowedDomains));
    setReadDraft(linesFromList(sandbox.additionalReadPaths));
    setWriteDraft(linesFromList(sandbox.additionalWritePaths));
  }, [sandbox.additionalReadPaths, sandbox.additionalWritePaths, sandbox.allowedDomains]);
  const disabled = busy || running;
  const listsDirty = useMemo(
    () =>
      domainDraft !== linesFromList(sandbox.allowedDomains) ||
      readDraft !== linesFromList(sandbox.additionalReadPaths) ||
      writeDraft !== linesFromList(sandbox.additionalWritePaths),
    [domainDraft, readDraft, sandbox.additionalReadPaths, sandbox.additionalWritePaths, sandbox.allowedDomains, writeDraft],
  );
  const allowlist = sandbox.networkMode === "allowlist";
  const statusText = sandbox.statusReason
    ? `${sandboxStatusLabel(sandbox.status)} · ${sandboxStatusReasonLabel(sandbox.statusReason)}`
    : sandboxStatusLabel(sandbox.status);

  function selectNetworkMode(networkMode: SandboxNetworkMode): void {
    onChange({ networkMode });
  }

  function saveLists(): void {
    onChange({
      allowedDomains: listFromLines(domainDraft),
      additionalReadPaths: listFromLines(readDraft),
      additionalWritePaths: listFromLines(writeDraft),
    });
  }

  return (
    <section className="grid gap-3" aria-labelledby="sandbox-heading" data-testid="sandbox-settings">
      <div className="flex items-center gap-1">
        <h2 id="sandbox-heading" className="text-sm font-medium">Agent-tool sandbox</h2>
        <InfoDisclosure label="About sandbox coverage" text={sandbox.disclosure} testId="sandbox-disclosure" />
      </div>
      {running ? (
        <p className="text-xs text-muted-foreground" data-testid="sandbox-idle-pending">
          Wait until this run finishes.
        </p>
      ) : null}
      <label className="glass-panel flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={sandbox.enabled}
          disabled={disabled || !sandbox.platformSupported}
          data-testid="sandbox-enabled"
          onChange={(event) => onChange({ enabled: event.target.checked })}
        />
        <span className="min-w-0 flex-1">
          <strong className="font-medium">Enable sandbox</strong>
          <span className="mt-1 block text-xs text-muted-foreground" data-testid="sandbox-status">
            Status: {statusText}
            {sandbox.platformSupported ? "" : " · macOS only in this build"}
          </span>
        </span>
      </label>
      <div className="grid gap-1.5">
        <p className="text-xs font-medium text-foreground">Network</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sandbox network mode">
          <Button
            size="sm"
            variant={sandbox.networkMode === "deny" ? "default" : "outline"}
            aria-pressed={sandbox.networkMode === "deny"}
            data-testid="sandbox-network-deny"
            disabled={disabled}
            onClick={() => selectNetworkMode("deny")}
          >
            Deny
          </Button>
          <Button
            size="sm"
            variant={sandbox.networkMode === "allowlist" ? "default" : "outline"}
            aria-pressed={sandbox.networkMode === "allowlist"}
            data-testid="sandbox-network-allowlist"
            disabled={disabled}
            onClick={() => selectNetworkMode("allowlist")}
          >
            Allowlist
          </Button>
        </div>
      </div>
      <label className="grid gap-1 text-xs">
        Domains
        <textarea
          className="min-h-12 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
          data-testid="sandbox-allowed-domains"
          disabled={disabled || !allowlist}
          value={domainDraft}
          onChange={(event) => setDomainDraft(event.target.value)}
          placeholder="github.com"
        />
      </label>
      <label className="glass-panel flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={sandbox.includePackageRegistryDefaults}
          disabled={disabled || !allowlist}
          data-testid="sandbox-registry-defaults"
          onChange={(event) => onChange({ includePackageRegistryDefaults: event.target.checked })}
        />
        <span className="min-w-0 flex-1">
          <strong className="font-medium">Package registries</strong>
          <span className="mt-1 block text-xs text-muted-foreground">
            npm, Yarn, PyPI, and GitHub when allowlist.
          </span>
        </span>
      </label>
      <label className="grid gap-1 text-xs">
        Extra read paths
        <textarea
          className="min-h-12 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
          data-testid="sandbox-read-paths"
          disabled={disabled}
          value={readDraft}
          onChange={(event) => setReadDraft(event.target.value)}
          placeholder="~/path"
        />
      </label>
      <label className="grid gap-1 text-xs">
        Extra write paths
        <textarea
          className="min-h-12 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
          data-testid="sandbox-write-paths"
          disabled={disabled}
          value={writeDraft}
          onChange={(event) => setWriteDraft(event.target.value)}
          placeholder="~/path"
        />
        <span className="text-muted-foreground" data-testid="sandbox-implicit-write-roots">
          Workspace and temp are already writable.
        </span>
      </label>
      <Button size="sm" data-testid="sandbox-save-lists" disabled={disabled || !listsDirty} onClick={saveLists}>
        Save
      </Button>
    </section>
  );
}
