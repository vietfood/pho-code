import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { SearchIcon } from "lucide-react";
import {
  providerDisclosureCopy,
  type ImportProviderApiKeyInput,
  type ProviderAccountSummary,
  type ProviderAccountsResult,
  type ProviderAuthFlowSnapshot,
  type ProviderAuthPrompt,
} from "@pho-code/protocol";
import {
  isActiveProviderAuthFlow,
  matchesProviderAccountQuery,
  partitionProviderAccounts,
  providerStatusLabel,
} from "./lib/provider-accounts";
import { cn } from "./lib/cn";
import { ProviderIcon } from "./provider-icon";
import { Button } from "./ui/button";

export function ProviderAccountsSection({
  accounts,
  flow,
  running,
  disabled,
  onImportApiKey,
  onStartOAuth,
  onRespondPrompt,
  onOpenLink,
  onCancelLogin,
  onLogout,
}: {
  accounts: ProviderAccountsResult;
  flow: ProviderAuthFlowSnapshot | null;
  running: boolean;
  disabled: boolean;
  onImportApiKey: (input: ImportProviderApiKeyInput) => Promise<void>;
  onStartOAuth: (providerId: string) => Promise<void>;
  onRespondPrompt: (flowId: string, promptId: string, value: string) => Promise<void>;
  onOpenLink: (flowId: string, linkId: string) => Promise<void>;
  onCancelLogin: (flowId: string) => Promise<void>;
  onLogout: (providerId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [addingKeyFor, setAddingKeyFor] = useState<string | null>(null);
  const flowActive = isActiveProviderAuthFlow(flow);
  const flowProvider = flow ? accounts.providers.find((provider) => provider.id === flow.providerId) : undefined;

  const { connected, available, visibleConnected, visibleAvailable } = useMemo(() => {
    const partitioned = partitionProviderAccounts(accounts.providers);
    return {
      ...partitioned,
      visibleConnected: partitioned.connected.filter((provider) => matchesProviderAccountQuery(provider, query)),
      visibleAvailable: partitioned.available.filter((provider) => matchesProviderAccountQuery(provider, query)),
    };
  }, [accounts.providers, query]);

  function toggleAddKey(providerId: string): void {
    setAddingKeyFor((current) => (current === providerId ? null : providerId));
  }

  const groupProps = {
    addingKeyFor,
    flowActive,
    running,
    disabled,
    onImportApiKey,
    onStartOAuth,
    onLogout,
    onToggleAddKey: toggleAddKey,
  };

  return (
    <section className="grid gap-3" aria-labelledby="credentials-heading" data-testid="credential-settings">
      <h2 id="credentials-heading" className="text-sm font-medium">
        Provider accounts
      </h2>
      {flow && flowActive ? (
        <ProviderAuthFlowPanel
          flow={flow}
          providerName={flowProvider?.name}
          disclosureKey={flowProvider?.disclosureKey}
          disabled={disabled}
          onRespondPrompt={onRespondPrompt}
          onOpenLink={onOpenLink}
          onCancelLogin={onCancelLogin}
        />
      ) : null}
      {flow?.phase === "failed" && flow.error ? (
        <p className="text-xs text-destructive" role="status" data-testid="provider-auth-error">
          {flow.error.message}
        </p>
      ) : null}
      {connected.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="no-configured-providers">
          No provider account is stored in this profile.
        </p>
      ) : (
        <ProviderAccountGroup
          heading="Connected"
          headingId="connected-providers-heading"
          testId="configured-providers"
          providers={visibleConnected}
          {...groupProps}
        />
      )}
      <div className="grid gap-2">
        <div className="flex items-end justify-between gap-3">
          <h3 id="available-providers-heading" className="text-xs font-medium text-foreground">
            Add a provider
          </h3>
          <p className="text-xs text-muted-foreground">{available.length} available</p>
        </div>
        <label className="relative block">
          <span className="sr-only">Filter providers</span>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            autoComplete="off"
            spellCheck={false}
            placeholder="Filter by name"
            data-testid="provider-account-filter"
            className="glass-field h-8 w-full rounded-[var(--control-radius)] border border-border bg-background py-1 pr-2 pl-8 text-sm"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {visibleAvailable.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="provider-account-empty-filter">
            {query.trim().length > 0 ? "No providers match that filter." : "Every listed provider is already connected."}
          </p>
        ) : (
          <ProviderAccountGroup
            heading="Available providers"
            headingId="available-providers-list-heading"
            headingClassName="sr-only"
            testId="available-providers"
            providers={visibleAvailable}
            {...groupProps}
          />
        )}
      </div>
    </section>
  );
}

function ProviderAccountGroup({
  heading,
  headingId,
  headingClassName,
  testId,
  providers,
  addingKeyFor,
  flowActive,
  running,
  disabled,
  onImportApiKey,
  onStartOAuth,
  onLogout,
  onToggleAddKey,
}: {
  heading: string;
  headingId: string;
  headingClassName?: string;
  testId: string;
  providers: readonly ProviderAccountSummary[];
  addingKeyFor: string | null;
  flowActive: boolean;
  running: boolean;
  disabled: boolean;
  onImportApiKey: (input: ImportProviderApiKeyInput) => Promise<void>;
  onStartOAuth: (providerId: string) => Promise<void>;
  onLogout: (providerId: string) => Promise<void>;
  onToggleAddKey: (providerId: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <h3 id={headingId} className={cn("text-xs font-medium text-foreground", headingClassName)}>
        {heading}
      </h3>
      <ul
        className="glass-panel m-0 list-none divide-y divide-border overflow-hidden rounded-lg border border-border p-0"
        aria-labelledby={headingId}
        data-testid={testId}
      >
        {providers.map((provider) => (
          <li key={provider.id}>
            <ProviderAccountRow
              provider={provider}
              addingKey={addingKeyFor === provider.id}
              flowActive={flowActive}
              running={running}
              disabled={disabled}
              onImportApiKey={onImportApiKey}
              onStartOAuth={onStartOAuth}
              onLogout={onLogout}
              onToggleAddKey={() => onToggleAddKey(provider.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProviderAccountRow({
  provider,
  addingKey,
  flowActive,
  running,
  disabled,
  onImportApiKey,
  onStartOAuth,
  onLogout,
  onToggleAddKey,
}: {
  provider: ProviderAccountSummary;
  addingKey: boolean;
  flowActive: boolean;
  running: boolean;
  disabled: boolean;
  onImportApiKey: (input: ImportProviderApiKeyInput) => Promise<void>;
  onStartOAuth: (providerId: string) => Promise<void>;
  onLogout: (providerId: string) => Promise<void>;
  onToggleAddKey: () => void;
}) {
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasApiKey = provider.methods.includes("api_key");
  const hasOAuth = provider.methods.includes("oauth");
  const rowDisabled = disabled || busy || flowActive;
  const showOAuth = hasOAuth && !addingKey;

  async function withBusy(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }

  const startOAuth = () => withBusy(() => onStartOAuth(provider.id));
  const logout = () =>
    withBusy(async () => {
      await onLogout(provider.id);
      setConfirmLogout(false);
    });

  return (
    <article className="grid gap-2 px-3 py-2.5" data-testid={`provider-account-${provider.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <ProviderIcon provider={provider.id} className="mt-0.5 size-4" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{provider.name}</p>
            <p className="text-xs text-muted-foreground">{providerStatusLabel(provider)}</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {showOAuth ? (
            <Button
              size="sm"
              variant="outline"
              disabled={rowDisabled || running}
              data-testid={`provider-oauth-start-${provider.id}`}
              onClick={() => {
                void startOAuth();
              }}
            >
              Sign in
            </Button>
          ) : null}
          {hasApiKey ? (
            <Button
              size="sm"
              variant="outline"
              disabled={rowDisabled}
              aria-expanded={addingKey}
              data-testid={
                provider.id === "deepseek" ? "credential-add-key" : `provider-add-key-${provider.id}`
              }
              onClick={onToggleAddKey}
            >
              {addingKey ? "Cancel" : provider.configured ? "Replace key" : "Add key"}
            </Button>
          ) : null}
          {provider.configured ? (
            confirmLogout ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={rowDisabled || running}
                  data-testid={`provider-logout-confirm-${provider.id}`}
                  onClick={() => {
                    void logout();
                  }}
                >
                  Remove credential
                </Button>
                <Button size="sm" variant="ghost" disabled={rowDisabled} onClick={() => setConfirmLogout(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={rowDisabled || running}
                data-testid={`provider-logout-${provider.id}`}
                onClick={() => setConfirmLogout(true)}
              >
                Log out
              </Button>
            )
          ) : null}
        </div>
      </div>
      {addingKey && hasApiKey ? (
        <ApiKeyEntry
          provider={provider}
          disabled={rowDisabled}
          running={running}
          onImportApiKey={onImportApiKey}
          onImported={onToggleAddKey}
        />
      ) : null}
    </article>
  );
}

function ApiKeyEntry({
  provider,
  disabled,
  running,
  onImportApiKey,
  onImported,
}: {
  provider: ProviderAccountSummary;
  disabled: boolean;
  running: boolean;
  onImportApiKey: (input: ImportProviderApiKeyInput) => Promise<void>;
  onImported: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function importKey(): Promise<void> {
    if (running || apiKey.trim() === "") {
      return;
    }
    setBusy(true);
    try {
      await onImportApiKey({ providerId: provider.id, apiKey });
      setApiKey("");
      onImported();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-2 border-t border-border/70 pt-2"
      data-testid={`provider-api-key-form-${provider.id}`}
      onSubmit={(event) => {
        event.preventDefault();
        void importKey();
      }}
    >
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted-foreground">API key</span>
        <input
          ref={inputRef}
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="glass-field h-8 rounded-[var(--control-radius)] border border-border bg-background px-2 text-sm"
          value={apiKey}
          disabled={disabled || busy}
          data-testid={provider.id === "deepseek" ? "credential-api-key" : `provider-api-key-${provider.id}`}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      <Button
        type="submit"
        data-testid={provider.id === "deepseek" ? "credential-import" : `provider-import-${provider.id}`}
        disabled={disabled || busy || running || apiKey.trim() === ""}
      >
        {running ? "Unavailable during a run" : "Import key"}
      </Button>
    </form>
  );
}

function ProviderAuthFlowPanel({
  flow,
  providerName,
  disclosureKey,
  disabled,
  onRespondPrompt,
  onOpenLink,
  onCancelLogin,
}: {
  flow: ProviderAuthFlowSnapshot;
  providerName?: string;
  disclosureKey?: ProviderAccountSummary["disclosureKey"];
  disabled: boolean;
  onRespondPrompt: (flowId: string, promptId: string, value: string) => Promise<void>;
  onOpenLink: (flowId: string, linkId: string) => Promise<void>;
  onCancelLogin: (flowId: string) => Promise<void>;
}) {
  const prompt = flow.prompt;
  const promptRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(() =>
    prompt?.kind === "select" ? (prompt.options?.[0]?.id ?? "") : "",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(prompt?.kind === "select" ? (prompt.options?.[0]?.id ?? "") : "");
    promptRef.current?.focus();
  }, [prompt?.promptId, prompt?.kind, prompt?.options]);

  async function submit(): Promise<void> {
    if (!prompt) {
      return;
    }
    setBusy(true);
    try {
      await onRespondPrompt(flow.flowId, prompt.promptId, value);
      setValue("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-panel grid gap-3 rounded-lg border border-border px-3 py-3" data-testid="provider-auth-flow">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{providerName ? `Signing in to ${providerName}` : "Signing in"}</p>
          {flow.progress ? (
            <p className="text-xs text-muted-foreground" data-testid="provider-auth-progress">
              {flow.progress}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Follow the steps below. Closing Settings does not cancel this login.
            </p>
          )}
          {disclosureKey ? (
            <p className="mt-1 text-xs text-muted-foreground">{providerDisclosureCopy(disclosureKey)}</p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || busy}
          data-testid="provider-auth-cancel"
          onClick={() => {
            void onCancelLogin(flow.flowId);
          }}
        >
          Cancel
        </Button>
      </div>
      {flow.deviceCode ? (
        <div className="grid gap-1" data-testid="provider-auth-device-code">
          <p className="text-xs text-muted-foreground">Device code</p>
          <p className="font-mono text-lg tracking-wide">{flow.deviceCode.userCode}</p>
          {flow.deviceCode.expiresAt ? (
            <p className="text-xs text-muted-foreground">Expires {flow.deviceCode.expiresAt}</p>
          ) : null}
        </div>
      ) : null}
      {flow.links?.map((link) => (
        <Button
          key={link.linkId}
          size="sm"
          variant="outline"
          disabled={disabled || busy}
          data-testid="provider-auth-open-link"
          onClick={() => {
            void onOpenLink(flow.flowId, link.linkId);
          }}
        >
          {link.label ?? "Open browser"} ({link.hostname})
        </Button>
      ))}
      {prompt ? (
        <AuthPromptFields
          prompt={prompt}
          value={value}
          disabled={disabled || busy}
          promptRef={promptRef}
          onChange={setValue}
          onSubmit={() => {
            void submit();
          }}
        />
      ) : null}
    </div>
  );
}

function AuthPromptFields({
  prompt,
  value,
  disabled,
  promptRef,
  onChange,
  onSubmit,
}: {
  prompt: ProviderAuthPrompt;
  value: string;
  disabled: boolean;
  promptRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="grid gap-2"
      data-testid="provider-auth-prompt"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-sm">{prompt.message}</p>
      {prompt.kind === "select" ? (
        <div className="grid gap-1.5" role="radiogroup" aria-label={prompt.message}>
          {(prompt.options ?? []).map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <input
                ref={option.id === (prompt.options?.[0]?.id ?? "") ? promptRef : undefined}
                type="radio"
                name="provider-auth-select"
                className="mt-1"
                value={option.id}
                checked={value === option.id}
                disabled={disabled}
                data-testid={`provider-auth-select-${option.id}`}
                onChange={() => onChange(option.id)}
              />
              <span>
                <strong className="font-medium">{option.label}</strong>
                {option.description ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <input
          ref={promptRef}
          type={prompt.kind === "text" ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          className="glass-field h-8 rounded-[var(--control-radius)] border border-border bg-background px-2 text-sm"
          placeholder={prompt.placeholder ?? ""}
          value={value}
          disabled={disabled}
          data-testid="provider-auth-input"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <Button type="submit" size="sm" disabled={disabled || value.trim() === ""} data-testid="provider-auth-submit">
        Continue
      </Button>
    </form>
  );
}
