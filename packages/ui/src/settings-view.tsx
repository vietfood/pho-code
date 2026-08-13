import { useEffect, useMemo, useState } from "react";
import {
  MAX_CHAT_FONT_SIZE,
  MAX_GLASS_STRENGTH,
  MAX_UI_FONT_SIZE,
  MIN_CHAT_FONT_SIZE,
  MIN_GLASS_STRENGTH,
  MIN_UI_FONT_SIZE,
  paletteSupportsMode,
  type AppearanceMode,
  type AppearancePalette,
  type CredentialProviderSummary,
  type HarnessSettingsSnapshot,
  type ImportProviderApiKeyInput,
  type ManagedPermissionProfileId,
  type UpdateAppearanceSettingsInput,
  type UpdatePermissionSettingsInput,
} from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { isMacDesktop } from "./lib/platform";
import { SidebarToggleButton } from "./sidebar-toggle-button";
import { Button } from "./ui/button";

const PALETTES: ReadonlyArray<{ id: AppearancePalette; label: string }> = [
  { id: "default", label: "Default" },
  { id: "gruvbox", label: "Gruvbox" },
  { id: "catppuccin", label: "Catppuccin" },
  { id: "flexoki", label: "Flexoki" },
  { id: "github", label: "GitHub" },
  { id: "one-dark", label: "One Dark" },
];

const MODES: ReadonlyArray<{ id: AppearanceMode; label: string }> = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const PROFILES: ReadonlyArray<{ id: ManagedPermissionProfileId; label: string; description: string; recommended?: boolean }> = [
  {
    id: "guarded",
    label: "baby (strict)",
    description: "Ask before tools, file access, and work outside the workspace. Selected secret paths stay denied.",
  },
  {
    id: "balanced",
    label: "okay, you got it",
    recommended: true,
    description: "Allow ordinary workspace reads. Ask before writes, shell commands, skills, and MCP calls.",
  },
  {
    id: "developer",
    label: "with great power comes great responsibility",
    description:
      "YOLO mode for trusted workspaces: auto-approve ask decisions while explicit denies remain blocked. Permanent removal stays unavailable; removal uses recoverable OS Trash. This is not a sandbox.",
  },
];

function displayedPermissionProfile(settings: HarnessSettingsSnapshot): ManagedPermissionProfileId | "custom" {
  if (settings.permission.yoloMode && settings.permission.profile === "developer") {
    return "developer";
  }
  if (settings.permission.yoloMode || settings.permission.profile === "developer") {
    return "custom";
  }
  return settings.permission.profile;
}

export function SettingsView({
  settings,
  running,
  busy,
  credentialProviders,
  onClose,
  onAppearanceChange,
  onPermissionApply,
  onTrustProjectPermissionRules,
  onImportApiKey,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  settings: HarnessSettingsSnapshot;
  running: boolean;
  busy: boolean;
  credentialProviders: readonly CredentialProviderSummary[];
  onClose: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onAppearanceChange: (input: UpdateAppearanceSettingsInput) => void;
  onPermissionApply: (input: UpdatePermissionSettingsInput) => Promise<void>;
  onTrustProjectPermissionRules: () => Promise<void>;
  onImportApiKey: (input: ImportProviderApiKeyInput) => Promise<void>;
}) {
  const [profile, setProfile] = useState<ManagedPermissionProfileId | "custom">(
    displayedPermissionProfile(settings),
  );
  const [reviewLog, setReviewLog] = useState(settings.permission.permissionReviewLog);
  const [yoloConfirm, setYoloConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [providerId, setProviderId] = useState(credentialProviders[0]?.id ?? "");
  const [apiKey, setApiKey] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setProfile(displayedPermissionProfile(settings));
    setReviewLog(settings.permission.permissionReviewLog);
  }, [settings]);

  useEffect(() => {
    if (!providerId && credentialProviders[0]) {
      setProviderId(credentialProviders[0].id);
    }
  }, [credentialProviders, providerId]);

  const custom = profile === "custom";
  const permissionDirty = useMemo(() => {
    const profileChanged = profile !== displayedPermissionProfile(settings) && profile !== "custom";
    const desiredYoloMode = profile === "developer";
    return (
      profileChanged ||
      reviewLog !== settings.permission.permissionReviewLog ||
      (profile !== "custom" && desiredYoloMode !== settings.permission.yoloMode)
    );
  }, [profile, reviewLog, settings]);

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
    if (profile !== "custom" && (profile === "developer") !== settings.permission.yoloMode) {
      patch.yoloMode = profile === "developer";
    }
    setApplying(true);
    try {
      await onPermissionApply(patch);
      setYoloConfirm(false);
    } finally {
      setApplying(false);
    }
  }

  function selectProfile(nextProfile: ManagedPermissionProfileId): void {
    if (nextProfile === "developer") {
      setYoloConfirm(true);
      return;
    }
    setProfile(nextProfile);
    setYoloConfirm(false);
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

  const mac = isMacDesktop();
  const showToggle = Boolean(sidebarCollapsed && onToggleSidebar);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-labelledby="settings-heading" data-testid="settings-view">
      <header
        className={cn(
          "workspace-topbar drag-region gap-3 px-3 sm:px-5",
          showToggle && mac ? "pl-[var(--workspace-titlebar-inset)]" : undefined,
        )}
      >
        {showToggle && onToggleSidebar ? (
          <SidebarToggleButton
            collapsed
            onToggle={onToggleSidebar}
            className="text-muted-foreground hover:text-foreground"
          />
        ) : null}
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
          <section className="grid gap-3" aria-labelledby="appearance-heading">
            <h2 id="appearance-heading" className="text-sm font-medium">
              Appearance
            </h2>
            <p className="text-xs text-muted-foreground">Applies to this application only.</p>
            <div className="grid gap-1.5">
              <p className="text-xs font-medium text-foreground">Palette</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Palette">
                {PALETTES.map((palette) => (
                  <Button
                    key={palette.id}
                    size="sm"
                    variant={settings.appearance.palette === palette.id ? "default" : "outline"}
                    aria-pressed={settings.appearance.palette === palette.id}
                    data-testid={`appearance-palette-${palette.id}`}
                    disabled={busy}
                    onClick={() => onAppearanceChange({ palette: palette.id })}
                  >
                    {palette.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <p className="text-xs font-medium text-foreground">Mode</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mode">
                {MODES.map((mode) => {
                  const supported = paletteSupportsMode(settings.appearance.palette, mode.id);
                  return (
                    <Button
                      key={mode.id}
                      size="sm"
                      variant={settings.appearance.mode === mode.id ? "default" : "outline"}
                      aria-pressed={settings.appearance.mode === mode.id}
                      data-testid={`appearance-mode-${mode.id}`}
                      disabled={busy || !supported}
                      className={cn(!supported && "opacity-40")}
                      onClick={() => onAppearanceChange({ mode: mode.id })}
                    >
                      {mode.label}
                    </Button>
                  );
                })}
              </div>
              {!paletteSupportsMode(settings.appearance.palette, "light") ? (
                <p className="text-xs text-muted-foreground">This palette is dark-only.</p>
              ) : null}
            </div>
            <div className="glass-panel grid gap-2 rounded-lg border border-border/70 px-3 py-2.5">
              <label className="flex items-center justify-between gap-3 text-sm" htmlFor="appearance-glass-enabled">
                <span>
                  <span className="font-medium">Frosted glass</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Soft blur over the desktop. Stronger on the sidebar, including the composer and settings fields.
                  </span>
                </span>
                <input
                  id="appearance-glass-enabled"
                  type="checkbox"
                  className="size-4 accent-primary"
                  data-testid="appearance-glass-enabled"
                  checked={settings.appearance.glassEnabled}
                  disabled={busy}
                  onChange={(event) => onAppearanceChange({ glassEnabled: event.target.checked })}
                />
              </label>
              <label className="grid gap-1 text-xs" htmlFor="appearance-glass-strength">
                <span className="flex items-center justify-between gap-2 font-medium text-foreground">
                  Glass strength
                  <span data-testid="appearance-glass-strength-value">{settings.appearance.glassStrength}%</span>
                </span>
                <input
                  id="appearance-glass-strength"
                  type="range"
                  min={MIN_GLASS_STRENGTH}
                  max={MAX_GLASS_STRENGTH}
                  step={1}
                  data-testid="appearance-glass-strength"
                  disabled={busy || !settings.appearance.glassEnabled}
                  value={settings.appearance.glassStrength}
                  onChange={(event) => onAppearanceChange({ glassStrength: Number(event.currentTarget.value) })}
                />
              </label>
            </div>
            <div className="grid gap-3 pt-1">
              <FontSizeStepper
                id="ui-font-size"
                label="UI font size"
                description="Sidebar, settings, and chrome."
                value={settings.appearance.uiFontSize}
                min={MIN_UI_FONT_SIZE}
                max={MAX_UI_FONT_SIZE}
                disabled={busy}
                testId="appearance-ui-font-size"
                onChange={(uiFontSize) => onAppearanceChange({ uiFontSize })}
              />
              <FontSizeStepper
                id="chat-font-size"
                label="Chat font size"
                description="Transcript messages and composer."
                value={settings.appearance.chatFontSize}
                min={MIN_CHAT_FONT_SIZE}
                max={MAX_CHAT_FONT_SIZE}
                disabled={busy}
                testId="appearance-chat-font-size"
                onChange={(chatFontSize) => onAppearanceChange({ chatFontSize })}
              />
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
                className="glass-field h-8 rounded-[var(--control-radius)] border border-border bg-background px-2 text-sm"
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
                className="glass-field h-8 rounded-[var(--control-radius)] border border-border bg-background px-2 text-sm"
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
              <div className="glass-panel grid gap-2 rounded-lg border border-border px-3 py-2" data-testid="project-override-notice">
                <p className="text-xs text-warning" role="status">
                  This workspace has its own permission config. It applies only after you explicitly trust this
                  project&apos;s permission rules.
                </p>
                {settings.permission.projectPermissionRulesRemembered ? (
                  <p className="text-xs text-muted-foreground" data-testid="project-permission-trusted">
                    Trusted by Pho Code for future sessions. This does not enable project extensions or change another
                    Pi installation&apos;s trust store.
                  </p>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    data-testid="trust-project-permission-rules"
                    onClick={() => void onTrustProjectPermissionRules()}
                  >
                    Trust this project&apos;s permission rules
                  </Button>
                )}
              </div>
            ) : null}
            {custom ? (
              <p className="text-xs text-muted-foreground" data-testid="permission-custom-notice">
                Current policy is Custom or a preserved pre-v3 Developer policy. Unrelated changes keep it until you
                explicitly choose baby (strict), okay, you got it, or with great power comes great responsibility.
              </p>
            ) : null}
            <div className="grid gap-2">
              {PROFILES.map((entry) => (
                <label
                  key={entry.id}
                  className="glass-panel flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name="permission-profile"
                    className="mt-1"
                    value={entry.id}
                    checked={profile === entry.id}
                    disabled={disabled}
                    data-testid={`permission-profile-${entry.id}`}
                    onChange={() => selectProfile(entry.id)}
                  />
                  <span>
                    <strong className="font-medium">{entry.label}</strong>
                    {entry.recommended ? <span className="text-muted-foreground"> (recommended)</span> : null}
                    <span className="mt-0.5 block text-xs text-muted-foreground">{entry.description}</span>
                  </span>
                </label>
              ))}
            </div>
            {yoloConfirm ? (
              <div className="glass-panel grid gap-2 rounded-lg border border-border px-3 py-2 text-xs text-destructive-foreground" role="alert" data-testid="permission-yolo-warning">
                <p>
                  With great power comes great responsibility auto-approves decisions that would otherwise ask. Explicit
                  denies still apply, permanent removal remains unavailable, and removal uses recoverable OS Trash. This
                  is not a sandbox.
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  data-testid="permission-yolo-confirm"
                  disabled={disabled}
                  onClick={() => {
                    setProfile("developer");
                    setYoloConfirm(false);
                  }}
                >
                  Choose this mode
                </Button>
              </div>
            ) : null}
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

function FontSizeStepper({
  id,
  label,
  description,
  value,
  min,
  max,
  disabled,
  testId,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  testId: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-1.5" data-testid={testId}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-medium">
            {label}
          </label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Decrease ${label.toLowerCase()}`}
            data-testid={`${testId}-decrease`}
            disabled={disabled || value <= min}
            onClick={() => onChange(value - 1)}
          >
            −
          </Button>
          <output id={id} className="min-w-12 text-center text-sm tabular-nums" aria-live="polite">
            {value}px
          </output>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Increase ${label.toLowerCase()}`}
            data-testid={`${testId}-increase`}
            disabled={disabled || value >= max}
            onClick={() => onChange(value + 1)}
          >
            +
          </Button>
        </div>
      </div>
    </div>
  );
}
