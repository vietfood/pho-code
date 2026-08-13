import { useEffect, useMemo, useState } from "react";
import type {
  CredentialProviderSummary,
  HarnessSettingsSnapshot,
  ImportProviderApiKeyInput,
  ManagedPermissionProfileId,
  ThemePreference,
  UpdatePermissionSettingsInput,
} from "@pho-code/protocol";
import { Button } from "./ui/button";

const THEMES: ReadonlyArray<{ id: ThemePreference; label: string }> = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const PROFILES: ReadonlyArray<{ id: ManagedPermissionProfileId; label: string; description: string }> = [
  { id: "guarded", label: "Guarded", description: "Ask before tools, file access, and work outside the workspace. Deny selected secrets." },
  { id: "balanced", label: "Balanced", description: "Allow ordinary reads in the workspace. Ask before writes, shell, skills, and MCP." },
];

export function SettingsView({
  settings,
  running,
  busy,
  credentialProviders,
  onClose,
  onAppearanceChange,
  onPermissionApply,
  onImportApiKey,
}: {
  settings: HarnessSettingsSnapshot;
  running: boolean;
  busy: boolean;
  credentialProviders: readonly CredentialProviderSummary[];
  onClose: () => void;
  onAppearanceChange: (theme: ThemePreference) => void;
  onPermissionApply: (input: UpdatePermissionSettingsInput) => Promise<void>;
  onImportApiKey: (input: ImportProviderApiKeyInput) => Promise<void>;
}) {
  const [profile, setProfile] = useState<ManagedPermissionProfileId | "custom">(settings.permission.profile);
  const [reviewLog, setReviewLog] = useState(settings.permission.permissionReviewLog);
  const [yoloMode, setYoloMode] = useState(settings.permission.yoloMode);
  const [yoloConfirm, setYoloConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [providerId, setProviderId] = useState(credentialProviders[0]?.id ?? "");
  const [apiKey, setApiKey] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setProfile(settings.permission.profile);
    setReviewLog(settings.permission.permissionReviewLog);
    setYoloMode(settings.permission.yoloMode);
  }, [settings]);

  useEffect(() => {
    if (!providerId && credentialProviders[0]) {
      setProviderId(credentialProviders[0].id);
    }
  }, [credentialProviders, providerId]);

  const custom = settings.permission.profile === "custom";
  const permissionDirty = useMemo(() => {
    const profileChanged = profile !== settings.permission.profile && profile !== "custom";
    return (
      profileChanged ||
      reviewLog !== settings.permission.permissionReviewLog ||
      yoloMode !== settings.permission.yoloMode
    );
  }, [profile, reviewLog, settings.permission, yoloMode]);

  async function saveAndApply(): Promise<void> {
    if (running || !permissionDirty) {
      return;
    }
    const patch: UpdatePermissionSettingsInput = {};
    if (profile !== "custom" && profile !== settings.permission.profile) {
      patch.profile = profile;
    }
    if (reviewLog !== settings.permission.permissionReviewLog) {
      patch.permissionReviewLog = reviewLog;
    }
    if (yoloMode !== settings.permission.yoloMode) {
      patch.yoloMode = yoloMode;
    }
    setApplying(true);
    try {
      await onPermissionApply(patch);
      setYoloConfirm(false);
    } finally {
      setApplying(false);
    }
  }

  function toggleYolo(enabled: boolean): void {
    if (enabled && !yoloConfirm) {
      setYoloConfirm(true);
      return;
    }
    setYoloMode(enabled);
    if (!enabled) {
      setYoloConfirm(false);
    }
  }

  const disabled = busy || applying || running || importing;
  const configured = credentialProviders.filter((provider) => provider.configured);

  async function importKey(): Promise<void> {
    if (running || !providerId || apiKey.trim() === "") {
      return;
    }
    setImporting(true);
    try {
      await onImportApiKey({ providerId, apiKey });
      setApiKey("");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-labelledby="settings-heading" data-testid="settings-view">
      <header className="workspace-topbar drag-region gap-3 px-3 sm:px-5">
        <h1 id="settings-heading" className="text-sm font-medium">
          Settings
        </h1>
        <div className="min-w-0 flex-1" />
        <Button size="sm" variant="ghost" onClick={onClose} data-testid="settings-close">
          Close
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto grid w-full max-w-xl gap-6">
          <section className="grid gap-2" aria-labelledby="appearance-heading">
            <h2 id="appearance-heading" className="text-sm font-medium">
              Appearance
            </h2>
            <p className="text-xs text-muted-foreground">Applies to this application only.</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
              {THEMES.map((theme) => (
                <Button
                  key={theme.id}
                  size="sm"
                  variant={settings.appearance.theme === theme.id ? "default" : "outline"}
                  aria-pressed={settings.appearance.theme === theme.id}
                  data-testid={`appearance-theme-${theme.id}`}
                  disabled={busy}
                  onClick={() => onAppearanceChange(theme.id)}
                >
                  {theme.label}
                </Button>
              ))}
            </div>
          </section>

          <section className="grid gap-3" aria-labelledby="credentials-heading" data-testid="credential-settings">
            <h2 id="credentials-heading" className="text-sm font-medium">
              Provider API keys
            </h2>
            <p className="text-xs text-muted-foreground">
              Stored in Pho Code&apos;s private Pi data directory. The key is never shown again after import, and Pi CLI
              is not required.
            </p>
            {configured.length > 0 ? (
              <ul className="m-0 grid list-none gap-1 p-0 text-xs text-muted-foreground" data-testid="configured-providers">
                {configured.map((provider) => (
                  <li key={provider.id}>{provider.name} configured</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="no-configured-providers">
                No API key is stored in this profile.
              </p>
            )}
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Provider</span>
              <select
                className="h-8 rounded-[var(--control-radius)] border border-border bg-background px-2 text-sm"
                value={providerId}
                disabled={disabled || credentialProviders.length === 0}
                data-testid="credential-provider"
                onChange={(event) => setProviderId(event.target.value)}
              >
                {credentialProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-muted-foreground">API key</span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="h-8 rounded-[var(--control-radius)] border border-border bg-background px-2 text-sm"
                value={apiKey}
                disabled={disabled}
                data-testid="credential-api-key"
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
            <Button
              data-testid="credential-import"
              disabled={disabled || apiKey.trim() === "" || providerId === ""}
              onClick={() => {
                void importKey();
              }}
            >
              {running ? "Unavailable during a run" : "Import key"}
            </Button>
          </section>

          <section className="grid gap-3" aria-labelledby="permission-heading">
            <h2 id="permission-heading" className="text-sm font-medium">
              Permission policy
            </h2>
            {settings.permission.appliesToSharedPiAgentDir ? (
              <p className="text-xs text-muted-foreground" data-testid="shared-agent-dir-notice">
                Pho Code is using an explicitly shared Pi data directory. Other Pi processes that use the same directory
                will also see this permission config.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="app-agent-dir-notice">
                Stored in Pho Code&apos;s private data directory. Other Pi installations do not use this permission config.
              </p>
            )}
            {settings.permission.projectOverridePresent ? (
              <p className="text-xs text-warning" role="status" data-testid="project-override-notice">
                This workspace has its own permission config. The global preset shown here may not be the effective
                policy until that override is removed.
              </p>
            ) : null}
            {custom ? (
              <p className="text-xs text-muted-foreground" data-testid="permission-custom-notice">
                Current policy is Custom. Unrelated changes keep it until you choose Guarded or Balanced.
              </p>
            ) : null}
            <div className="grid gap-2">
              {PROFILES.map((entry) => (
                <label
                  key={entry.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name="permission-profile"
                    className="mt-1"
                    value={entry.id}
                    checked={profile === entry.id}
                    disabled={disabled}
                    data-testid={`permission-profile-${entry.id}`}
                    onChange={() => setProfile(entry.id)}
                  />
                  <span>
                    <strong className="font-medium">{entry.label}</strong>
                    {entry.id === "guarded" ? <span className="text-muted-foreground"> (recommended)</span> : null}
                    <span className="mt-0.5 block text-xs text-muted-foreground">{entry.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={reviewLog}
                disabled={disabled}
                data-testid="permission-review-log"
                onChange={(event) => setReviewLog(event.target.checked)}
              />
              <span>Keep a permission review log</span>
            </label>
            <div className="grid gap-2 rounded-lg border border-border px-3 py-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={yoloMode}
                  disabled={disabled}
                  data-testid="permission-yolo"
                  onChange={(event) => toggleYolo(event.target.checked)}
                />
                <span>YOLO mode auto-approves ask decisions while keeping explicit denies</span>
              </label>
              {yoloConfirm && !yoloMode ? (
                <div className="grid gap-2 text-xs text-destructive-foreground" role="alert" data-testid="permission-yolo-warning">
                  <p>
                    YOLO disables interactive permission prompts. Tool calls that would have asked will be allowed
                    automatically. This is not a sandbox.
                  </p>
                  <Button
                    size="sm"
                    variant="destructive"
                    data-testid="permission-yolo-confirm"
                    disabled={disabled}
                    onClick={() => {
                      setYoloMode(true);
                      setYoloConfirm(false);
                    }}
                  >
                    Enable YOLO
                  </Button>
                </div>
              ) : null}
            </div>
            <Button
              data-testid="settings-save"
              disabled={disabled || !permissionDirty}
              onClick={() => {
                void saveAndApply();
              }}
            >
              {running ? "Unavailable during a run" : "Save and apply"}
            </Button>
          </section>
        </div>
      </div>
    </section>
  );
}
