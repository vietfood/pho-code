import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArchiveIcon, BookOpenIcon, BoxIcon, GithubIcon, KeyRoundIcon, PaletteIcon, ShieldIcon, XIcon } from "lucide-react";
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
  type HarnessSettingsSnapshot,
  type ImportProviderApiKeyInput,
  type ManagedPermissionProfileId,
  type ProviderAccountsResult,
  type ProviderAuthFlowSnapshot,
  type RecentWorkspaceRecord,
  type SessionCatalogEntry,
  type UpdateAppearanceSettingsInput,
  type UpdatePermissionSettingsInput,
  type UpdateSkillSourceSettingsInput,
  type UpdateGitHubMcpSettingsInput,
  type UpdateSandboxSettingsInput,
  type ImportGitHubPatInput,
} from "@pho-code/protocol";
import { ArchivedChatsSection } from "./archived-chats";
import { GitHubMcpSettingsSection } from "./github-mcp-settings";
import { SandboxSettingsSection } from "./sandbox-settings";
import { SkillsSettingsSection } from "./skills-settings";
import { cn } from "./lib/cn";
import { handleDialogTab } from "./lib/dialog-focus";
import { isActiveProviderAuthFlow } from "./lib/provider-accounts";
import { projectPermissionTrustPending } from "./lib/project-permission-trust";
import {
  adjacentSettingsSection,
  initialSettingsSection,
  SETTINGS_SECTIONS,
  writeSettingsSection,
  type SettingsSectionId,
} from "./lib/settings-section";
import { ProviderAccountsSection } from "./provider-accounts";
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
      "YOLO mode for trusted workspaces: auto-approve ask decisions while explicit denies remain blocked.",
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
  providerAccounts,
  authFlow,
  projects,
  sessionsByWorkspace,
  onClose,
  onAppearanceChange,
  onPermissionApply,
  onTrustProjectPermissionRules,
  onImportApiKey,
  onStartOAuth,
  onRespondAuthPrompt,
  onOpenAuthLink,
  onCancelAuth,
  onLogoutProvider,
  onRestoreArchived,
  onOpenArchived,
  onRemoveSession,
  onRemoveAllArchived,
  onSkillSourceChange,
  onRefreshSkills,
  onGitHubMcpChange,
  onImportGitHubPat,
  onRemoveGitHubPat,
  onSandboxChange,
}: {
  settings: HarnessSettingsSnapshot;
  running: boolean;
  busy: boolean;
  providerAccounts: ProviderAccountsResult;
  authFlow: ProviderAuthFlowSnapshot | null;
  projects: readonly RecentWorkspaceRecord[];
  sessionsByWorkspace: Readonly<Record<string, readonly SessionCatalogEntry[]>>;
  onClose: () => void;
  onAppearanceChange: (input: UpdateAppearanceSettingsInput) => void;
  onPermissionApply: (input: UpdatePermissionSettingsInput) => Promise<void>;
  onTrustProjectPermissionRules: () => Promise<void>;
  onImportApiKey: (input: ImportProviderApiKeyInput) => Promise<void>;
  onStartOAuth: (providerId: string) => Promise<void>;
  onRespondAuthPrompt: (flowId: string, promptId: string, value: string) => Promise<void>;
  onOpenAuthLink: (flowId: string, linkId: string) => Promise<void>;
  onCancelAuth: (flowId: string) => Promise<void>;
  onLogoutProvider: (providerId: string) => Promise<void>;
  onRestoreArchived: (workspaceId: string, sessionId: string) => void;
  onOpenArchived: (workspaceId: string, sessionId: string) => void;
  onRemoveSession: (workspaceId: string, sessionId: string) => void;
  onRemoveAllArchived: (workspaceId: string) => void;
  onSkillSourceChange: (input: UpdateSkillSourceSettingsInput) => void;
  onRefreshSkills: () => void;
  onGitHubMcpChange: (input: UpdateGitHubMcpSettingsInput) => void;
  onImportGitHubPat: (input: ImportGitHubPatInput) => Promise<void>;
  onRemoveGitHubPat: () => void;
  onSandboxChange: (input: UpdateSandboxSettingsInput) => void;
}) {
  const flowActive = isActiveProviderAuthFlow(authFlow);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [section, setSection] = useState<SettingsSectionId>(() => initialSettingsSection({ flowActive }));
  const [profile, setProfile] = useState<ManagedPermissionProfileId | "custom">(
    displayedPermissionProfile(settings),
  );
  const [reviewLog, setReviewLog] = useState(settings.permission.permissionReviewLog);
  const [yoloConfirm, setYoloConfirm] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setProfile(displayedPermissionProfile(settings));
    setReviewLog(settings.permission.permissionReviewLog);
  }, [settings]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.getElementById(`settings-tab-${section}`)?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      const root = dialogRef.current;
      if (root) {
        handleDialogTab(event, root);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
    // Bind once per open. Parent re-renders must not steal focus from fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function selectSection(next: SettingsSectionId, focus = false): void {
    setSection(next);
    writeSettingsSection(next);
    if (focus) {
      requestAnimationFrame(() => {
        document.getElementById(`settings-tab-${next}`)?.focus();
      });
    }
  }

  function onTabListKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        selectSection(adjacentSettingsSection(section, 1), true);
        return;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        selectSection(adjacentSettingsSection(section, -1), true);
        return;
      case "Home":
        event.preventDefault();
        selectSection(SETTINGS_SECTIONS[0].id, true);
        return;
      case "End": {
        event.preventDefault();
        const last = SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1];
        if (last) {
          selectSection(last.id, true);
        }
        return;
      }
      default:
        return;
    }
  }

  const disabled = busy || applying || running;

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
      data-testid="settings-backdrop"
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
        aria-labelledby="settings-heading"
        data-testid="settings-view"
        className="flex h-[min(42rem,calc(100dvh-2rem))] w-[min(52rem,calc(100dvw-2rem))] overflow-hidden rounded-xl border border-border bg-background shadow-lg"
      >
        <nav className="flex w-40 shrink-0 flex-col border-border border-r px-1.5 py-2">
          <h1 id="settings-heading" className="px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Settings
          </h1>
          <div
            role="tablist"
            aria-label="Settings sections"
            aria-orientation="vertical"
            className="flex flex-col gap-0.5"
            data-testid="settings-nav"
            onKeyDown={onTabListKeyDown}
          >
            {SETTINGS_SECTIONS.map((entry) => {
              const selected = section === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  id={`settings-tab-${entry.id}`}
                  aria-selected={selected}
                  aria-controls={`settings-panel-${entry.id}`}
                  title={entry.description}
                  tabIndex={selected ? 0 : -1}
                  data-testid={`settings-tab-${entry.id}`}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] leading-snug outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    selected
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                  onClick={() => selectSection(entry.id)}
                >
                  <SectionIcon id={entry.id} className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.id === "accounts" && flowActive ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" title="Sign-in in progress" />
                  ) : null}
                  {entry.id === "permissions" && permissionDirty ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-warning" title="Unsaved changes" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-10 shrink-0 items-center justify-end gap-2 border-border border-b px-2">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Close settings"
              data-testid="settings-close"
              onClick={onClose}
            >
              <XIcon className="size-3.5" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div
              role="tabpanel"
              id={`settings-panel-${section}`}
              aria-labelledby={`settings-tab-${section}`}
              data-testid={`settings-panel-${section}`}
              className="grid w-full max-w-xl gap-6"
            >
              {renderSection()}
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  function renderSection(): ReactNode {
    switch (section) {
      case "appearance":
        return <AppearanceSection settings={settings} busy={busy} onAppearanceChange={onAppearanceChange} />;
      case "accounts":
        return (
          <ProviderAccountsSection
            accounts={providerAccounts}
            flow={authFlow}
            running={running}
            disabled={disabled}
            onImportApiKey={onImportApiKey}
            onStartOAuth={onStartOAuth}
            onRespondPrompt={onRespondAuthPrompt}
            onOpenLink={onOpenAuthLink}
            onCancelLogin={onCancelAuth}
            onLogout={onLogoutProvider}
          />
        );
      case "github":
        return (
          <GitHubMcpSettingsSection
            githubMcp={settings.githubMcp}
            busy={busy}
            onEnabledChange={onGitHubMcpChange}
            onImportPat={onImportGitHubPat}
            onRemovePat={onRemoveGitHubPat}
          />
        );
      case "skills":
        return (
          <SkillsSettingsSection
            skills={settings.skills}
            busy={busy}
            onSourceChange={onSkillSourceChange}
            onRefresh={onRefreshSkills}
          />
        );
      case "archived":
        return (
          <ArchivedChatsSection
            projects={projects}
            sessionsByWorkspace={sessionsByWorkspace}
            busy={busy}
            onRestore={onRestoreArchived}
            onOpen={onOpenArchived}
            onRemove={onRemoveSession}
            onRemoveAll={onRemoveAllArchived}
          />
        );
      case "permissions":
        return (
          <PermissionSection
            settings={settings}
            custom={custom}
            profile={profile}
            reviewLog={reviewLog}
            yoloConfirm={yoloConfirm}
            permissionDirty={permissionDirty}
            disabled={disabled}
            running={running}
            onSelectProfile={selectProfile}
            onReviewLogChange={setReviewLog}
            onYoloConfirm={() => {
              setProfile("developer");
              setYoloConfirm(false);
            }}
            onTrustProjectPermissionRules={onTrustProjectPermissionRules}
            onSave={() => {
              void saveAndApply();
            }}
          />
        );
      case "sandbox":
        return (
          <SandboxSettingsSection
            sandbox={settings.sandbox}
            busy={busy}
            running={running}
            onChange={onSandboxChange}
          />
        );
      default: {
        const exhaustive: never = section;
        return exhaustive;
      }
    }
  }
}

const SECTION_ICONS: Record<SettingsSectionId, typeof PaletteIcon> = {
  appearance: PaletteIcon,
  accounts: KeyRoundIcon,
  github: GithubIcon,
  skills: BookOpenIcon,
  archived: ArchiveIcon,
  permissions: ShieldIcon,
  sandbox: BoxIcon,
};

function SectionIcon({ id, className }: { id: SettingsSectionId; className?: string }): ReactNode {
  const Icon = SECTION_ICONS[id];
  return <Icon className={className} aria-hidden="true" />;
}

function AppearanceSection({
  settings,
  busy,
  onAppearanceChange,
}: {
  settings: HarnessSettingsSnapshot;
  busy: boolean;
  onAppearanceChange: (input: UpdateAppearanceSettingsInput) => void;
}) {
  return (
    <section className="grid gap-3" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className="text-sm font-medium">
        Appearance
      </h2>
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
          <span className="font-medium">Frosted glass</span>
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
          value={settings.appearance.chatFontSize}
          min={MIN_CHAT_FONT_SIZE}
          max={MAX_CHAT_FONT_SIZE}
          disabled={busy}
          testId="appearance-chat-font-size"
          onChange={(chatFontSize) => onAppearanceChange({ chatFontSize })}
        />
      </div>
    </section>
  );
}

function PermissionSection({
  settings,
  custom,
  profile,
  reviewLog,
  yoloConfirm,
  permissionDirty,
  disabled,
  running,
  onSelectProfile,
  onReviewLogChange,
  onYoloConfirm,
  onTrustProjectPermissionRules,
  onSave,
}: {
  settings: HarnessSettingsSnapshot;
  custom: boolean;
  profile: ManagedPermissionProfileId | "custom";
  reviewLog: boolean;
  yoloConfirm: boolean;
  permissionDirty: boolean;
  disabled: boolean;
  running: boolean;
  onSelectProfile: (profile: ManagedPermissionProfileId) => void;
  onReviewLogChange: (value: boolean) => void;
  onYoloConfirm: () => void;
  onTrustProjectPermissionRules: () => Promise<void>;
  onSave: () => void;
}) {
  return (
    <section className="grid gap-3" aria-labelledby="permission-heading">
      <h2 id="permission-heading" className="text-sm font-medium">
        Permission policy
      </h2>
      {projectPermissionTrustPending(settings.permission) || settings.permission.projectOverridePresent ? (
        <div className="glass-panel grid gap-2 rounded-lg border border-border px-3 py-2" data-testid="project-override-notice">
          <p className="text-xs text-warning" role="status">
            {settings.permission.projectOverridePresent
              ? "This workspace has its own permission config. It applies only after you explicitly trust this project's permission rules."
              : "This project is not trusted. Project-scoped permission rules stay skipped until you trust it."}
          </p>
          {settings.permission.projectPermissionRulesRemembered &&
          settings.permission.projectPermissionRulesTrusted ? (
            <p className="text-xs text-muted-foreground" data-testid="project-permission-trusted">
              Trusted by Pho Code for future sessions. This does not enable project extensions or change another Pi
              installation&apos;s trust store.
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
              onChange={() => onSelectProfile(entry.id)}
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
        <div
          className="glass-panel grid gap-2 rounded-lg border border-border px-3 py-2 text-xs text-destructive-foreground"
          role="alert"
          data-testid="permission-yolo-warning"
        >
          <p>
            With great power comes great responsibility auto-approves decisions that would otherwise ask. Explicit
            denies still apply, permanent removal remains unavailable, and removal uses recoverable OS Trash. This is
            not a sandbox.
          </p>
          <Button size="sm" variant="destructive" data-testid="permission-yolo-confirm" disabled={disabled} onClick={onYoloConfirm}>
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
          onChange={(event) => onReviewLogChange(event.target.checked)}
        />
        <span>Keep a permission review log</span>
      </label>
      <Button data-testid="settings-save" disabled={disabled || !permissionDirty} onClick={onSave}>
        {running ? "Unavailable during a run" : "Save and apply"}
      </Button>
    </section>
  );
}

function FontSizeStepper({
  id,
  label,
  value,
  min,
  max,
  disabled,
  testId,
  onChange,
}: {
  id: string;
  label: string;
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
        <label htmlFor={id} className="min-w-0 text-sm font-medium">
          {label}
        </label>
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
