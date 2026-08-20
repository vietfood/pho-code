import { useState } from "react";
import {
  GITHUB_MCP_DISCLOSURE_ITEMS,
  GITHUB_MCP_TRUST_NOTICE,
  githubMcpStatusLabel,
  type GitHubMcpSettingsSnapshot,
  type ImportGitHubPatInput,
  type UpdateGitHubMcpSettingsInput,
} from "@pho-code/protocol";
import { Button } from "./ui/button";
import { ProviderIcon } from "./provider-icon";
import { SkillCompatibilityDialog } from "./skill-compatibility-dialog";

export function GitHubMcpSettingsSection({
  githubMcp,
  busy,
  onEnabledChange,
  onImportPat,
  onRemovePat,
}: {
  githubMcp: GitHubMcpSettingsSnapshot;
  busy: boolean;
  onEnabledChange: (input: UpdateGitHubMcpSettingsInput) => void;
  onImportPat: (input: ImportGitHubPatInput) => Promise<void>;
  onRemovePat: () => void;
}) {
  const [pendingEnable, setPendingEnable] = useState(false);
  const [editingToken, setEditingToken] = useState(false);
  const [token, setToken] = useState("");
  const patConfigured = githubMcp.account.patConfigured;

  async function submitToken(): Promise<void> {
    const value = token.trim();
    if (value.length === 0) {
      return;
    }
    setToken("");
    setEditingToken(false);
    await onImportPat({ token: value });
  }

  return (
    <section className="grid gap-3" aria-labelledby="github-mcp-heading" data-testid="github-mcp-settings">
      <div className="grid gap-1">
        <h2 id="github-mcp-heading" className="flex items-center gap-2 text-sm font-medium">
          <ProviderIcon provider="github" className="size-4" />
          GitHub MCP
        </h2>
        <p className="text-xs text-muted-foreground">{GITHUB_MCP_TRUST_NOTICE}</p>
        <ul className="grid list-disc gap-1 pl-4 text-xs text-muted-foreground">
          {GITHUB_MCP_DISCLOSURE_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <label className="glass-panel flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={githubMcp.enabled}
          disabled={busy}
          data-testid="github-mcp-enabled"
          onChange={(event) => {
            const enabled = event.target.checked;
            if (enabled) {
              setPendingEnable(true);
              return;
            }
            onEnabledChange({ enabled: false });
          }}
        />
        <span className="min-w-0 flex-1">
          <strong className="font-medium">Enable read-only GitHub tools</strong>
          <span className="mt-1 block text-xs text-muted-foreground">
            Status: {githubMcpStatusLabel(githubMcp.status)}
            {githubMcp.account.login ? ` · @${githubMcp.account.login}` : patConfigured ? " · PAT stored" : ""}
            {githubMcp.boundToolCount > 0 ? ` · ${githubMcp.boundToolCount} tools` : ""}
          </span>
          {githubMcp.error ? (
            <span className="mt-1 block text-xs text-destructive" data-testid="github-mcp-error">
              {githubMcp.error}
            </span>
          ) : null}
        </span>
      </label>
      <p className="text-xs text-muted-foreground">{githubMcp.secretStoreNotice}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          data-testid="github-mcp-add-token"
          onClick={() => setEditingToken((current) => !current)}
        >
          {editingToken ? "Cancel" : patConfigured ? "Replace PAT" : "Add PAT"}
        </Button>
        {patConfigured ? (
          <Button size="sm" variant="outline" disabled={busy} data-testid="github-mcp-remove-pat" onClick={onRemovePat}>
            Remove PAT
          </Button>
        ) : null}
      </div>
      {editingToken ? (
        <form
          className="grid gap-2"
          data-testid="github-mcp-token-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitToken();
          }}
        >
          <label className="grid gap-1 text-xs">
            Fine-grained PAT
            <input
              type="password"
              autoComplete="off"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              data-testid="github-mcp-token-input"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <Button size="sm" type="submit" disabled={busy || token.trim() === ""}>
            Store token
          </Button>
        </form>
      ) : null}
      {pendingEnable ? (
        <SkillCompatibilityDialog
          title="Enable GitHub MCP?"
          message={githubMcp.disclosure}
          confirmLabel="Enable"
          onCancel={() => setPendingEnable(false)}
          onConfirm={() => {
            setPendingEnable(false);
            onEnabledChange({ enabled: true, acknowledgedDisclosure: true });
          }}
        />
      ) : null}
    </section>
  );
}
