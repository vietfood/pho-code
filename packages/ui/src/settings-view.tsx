import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArchiveIcon,
  BookOpenIcon,
  BoxIcon,
  GithubIcon,
  KeyRoundIcon,
  PaletteIcon,
  ShieldIcon,
  XIcon,
} from "lucide-react";
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
  type BrandIconStyle,
  type WorkEntryIconPack,
  type HarnessSettingsSnapshot,
  type ImportProviderApiKeyInput,
  type ProviderAccountsResult,
  type ProviderAuthFlowSnapshot,
  type RecentWorkspaceRecord,
  type SessionCatalogEntry,
  type UpdateAppearanceSettingsInput,
  type UpdateApprovalModeSettingsInput,
  type MigrateLegacyPermissionSettingsInput,
  type UpdateSkillSourceSettingsInput,
  type UpdateGitHubMcpSettingsInput,
  type UpdateSandboxSettingsInput,
  type ImportGitHubPatInput,
  type ApprovalDecisionHistoryPage,
  type ListApprovalDecisionHistoryInput,
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
import { FontFamilyPicker } from "./font-family-picker";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";

const PALETTES: ReadonlyArray<{ id: AppearancePalette; label: string }> = [
  { id: "default", label: "Default" },
  { id: "gruvbox", label: "Gruvbox" },
  { id: "catppuccin", label: "Catppuccin" },
  { id: "flexoki", label: "Flexoki" },
  { id: "github", label: "GitHub" },
  { id: "one-dark", label: "One Dark" },
];

const ICON_PACKS: ReadonlyArray<{ id: WorkEntryIconPack; label: string }> = [
  { id: "lucide", label: "Lucide" },
  { id: "pho", label: "Pho" },
  { id: "codex-team", label: "CodeX" },
  { id: "meteocons", label: "Meteocons" },
];

const BRAND_STYLES: ReadonlyArray<{ id: BrandIconStyle; label: string }> = [
  { id: "color", label: "Color" },
  { id: "mono", label: "Mono" },
];

const MODES: ReadonlyArray<{ id: AppearanceMode; label: string }> = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

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
  onApprovalModeChange,
  onListApprovalDecisionHistory,
  onMigrateLegacyPermissions,
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
  onApprovalModeChange: (input: UpdateApprovalModeSettingsInput) => void;
  onListApprovalDecisionHistory: (input?: ListApprovalDecisionHistoryInput) => Promise<ApprovalDecisionHistoryPage>;
  onMigrateLegacyPermissions: (input: MigrateLegacyPermissionSettingsInput) => void;
  onTrustProjectPermissionRules: () => Promise<void>;
  onImportApiKey: (input: ImportProviderApiKeyInput) => Promise<void>;
  onStartOAuth: (providerId: string) => Promise<void>;
  onRespondAuthPrompt: (flowId: string, promptId: string, value: string) => Promise<void>;
  onOpenAuthLink: (flowId: string, linkId: string) => Promise<void>;
  onCancelAuth: (flowId: string) => Promise<void>;
  onLogoutProvider: (providerId: string) => Promise<void>;
  onRestoreArchived: (workspaceId: string, sessionId: string, backendId?: string) => void;
  onOpenArchived: (workspaceId: string, sessionId: string, backendId?: string) => void;
  onRemoveSession: (workspaceId: string, sessionId: string, backendId?: string) => void;
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

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);


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

  const disabled = busy || running;

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
            disabled={disabled}
            running={running}
            onApprovalModeChange={onApprovalModeChange}
            onListApprovalDecisionHistory={onListApprovalDecisionHistory}
            onMigrateLegacyPermissions={onMigrateLegacyPermissions}
            onTrustProjectPermissionRules={onTrustProjectPermissionRules}
            onSandboxChange={onSandboxChange}
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
        <p className="text-xs font-medium text-foreground">Icons</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Icons">
          {ICON_PACKS.map((pack) => (
            <Button
              key={pack.id}
              size="sm"
              variant={settings.appearance.workEntryIcons === pack.id ? "default" : "outline"}
              aria-pressed={settings.appearance.workEntryIcons === pack.id}
              data-testid={`appearance-icons-${pack.id}`}
              disabled={busy}
              onClick={() => onAppearanceChange({ workEntryIcons: pack.id })}
            >
              {pack.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-1.5">
        <p className="text-xs font-medium text-foreground">Brand marks</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Brand marks">
          {BRAND_STYLES.map((style) => (
            <Button
              key={style.id}
              size="sm"
              variant={settings.appearance.brandIcons === style.id ? "default" : "outline"}
              aria-pressed={settings.appearance.brandIcons === style.id}
              data-testid={`appearance-brand-icons-${style.id}`}
              disabled={busy}
              onClick={() => onAppearanceChange({ brandIcons: style.id })}
            >
              {style.label}
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
      <div className="grid gap-4 pt-1">
        <AppearanceSettingRow
          htmlFor="ui-font-size"
          testId="appearance-ui-font-size"
          label="UI font size"
          description="Font size for the user interface."
        >
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
        </AppearanceSettingRow>
        <AppearanceSettingRow
          htmlFor="chat-font-size"
          testId="appearance-chat-font-size"
          label="Chat font size"
          description="Font size for transcript and composer."
        >
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
        </AppearanceSettingRow>
        <AppearanceSettingRow
          htmlFor="ui-font-family"
          label="UI font family"
          description="Override the user interface typeface."
        >
          <FontFamilyPicker
            id="ui-font-family"
            ariaLabel="UI font family"
            value={settings.appearance.uiFontFamily}
            disabled={busy}
            testId="appearance-ui-font-family"
            onChange={(uiFontFamily) => onAppearanceChange({ uiFontFamily })}
          />
        </AppearanceSettingRow>
        <div className="grid gap-2">
          <AppearanceSettingRow
            htmlFor="code-font-family"
            label="Code font family"
            description="Override the font for code, diffs, and tool output."
          >
            <FontFamilyPicker
              id="code-font-family"
              ariaLabel="Code font family"
              value={settings.appearance.codeFontFamily}
              disabled={busy}
              testId="appearance-code-font-family"
              onChange={(codeFontFamily) => onAppearanceChange({ codeFontFamily })}
            />
          </AppearanceSettingRow>
          <div
            className="overflow-hidden rounded-md border border-border/70 bg-code-background font-mono text-[11px] leading-relaxed"
            data-testid="appearance-code-font-preview"
            aria-hidden="true"
          >
            <div className="bg-destructive/12 px-2.5 py-0.5 text-destructive">- return a + b;</div>
            <div className="bg-success/12 px-2.5 py-0.5 text-success">+ const result = a + b;</div>
            <div className="bg-success/12 px-2.5 py-0.5 text-success">+ return result;</div>
          </div>
        </div>
        <AppearanceSettingRow
          htmlFor="appearance-font-smoothing"
          label="Font smoothing"
          description="Grayscale anti-aliasing. Off uses native macOS rendering."
        >
          <input
            id="appearance-font-smoothing"
            type="checkbox"
            className="size-4 accent-primary"
            data-testid="appearance-font-smoothing"
            checked={settings.appearance.fontSmoothing}
            disabled={busy}
            onChange={(event) => onAppearanceChange({ fontSmoothing: event.target.checked })}
          />
        </AppearanceSettingRow>
      </div>
    </section>
  );
}

function PermissionSection({
  settings,
  disabled,
  running,
  onApprovalModeChange,
  onListApprovalDecisionHistory,
  onMigrateLegacyPermissions,
  onTrustProjectPermissionRules,
  onSandboxChange,
}: {
  settings: HarnessSettingsSnapshot;
  disabled: boolean;
  running: boolean;
  onApprovalModeChange: (input: UpdateApprovalModeSettingsInput) => void;
  onListApprovalDecisionHistory: (input?: ListApprovalDecisionHistoryInput) => Promise<ApprovalDecisionHistoryPage>;
  onMigrateLegacyPermissions: (input: MigrateLegacyPermissionSettingsInput) => void;
  onTrustProjectPermissionRules: () => Promise<void>;
  onSandboxChange: (input: UpdateSandboxSettingsInput) => void;
}) {
  const approval = settings.approvalModes;
  const [history, setHistory] = useState<ApprovalDecisionHistoryPage>();
  const [historyError, setHistoryError] = useState<string>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const loadHistory = async (): Promise<void> => {
    setHistoryLoading(true);
    setHistoryError(undefined);
    try {
      setHistory(await onListApprovalDecisionHistory({ limit: 20 }));
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Could not load approval history.");
    } finally {
      setHistoryLoading(false);
    }
  };
  return (
    <section className="grid gap-5" aria-labelledby="permission-heading">
      <h2 id="permission-heading" className="text-sm font-medium">
        Approval modes
      </h2>
      {running ? <p className="text-xs text-muted-foreground">Wait until the current run finishes to change approval behavior.</p> : null}
      {approval ? (
        <>
          <div className="grid gap-2">
            <p className="text-xs font-medium">New chats</p>
            <label className="glass-panel flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <input type="radio" name="approval-default" checked={approval.defaultMode === "ask"} disabled={disabled} data-testid="approval-default-ask" onChange={() => onApprovalModeChange({ defaultMode: "ask" })} />
              <span><strong className="font-medium">Ask for approval</strong><span className="mt-0.5 block text-xs text-muted-foreground">Routine work stays contained; you decide additional access.</span></span>
            </label>
            <label className="glass-panel flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <input type="radio" name="approval-default" checked={approval.defaultMode === "auto"} disabled={disabled || !approval.autoEnabled} data-testid="approval-default-auto" onChange={() => onApprovalModeChange({ defaultMode: "auto" })} />
              <span><strong className="font-medium">Approve for me</strong><span className="mt-0.5 block text-xs text-muted-foreground">Uses the same boundary with an isolated automatic reviewer.</span></span>
            </label>
          </div>
          <SettingsToggle label="Enable Approve for me" description="Allow chats to use an isolated reviewer for eligible access requests." checked={approval.autoEnabled} disabled={disabled} testId="approval-auto-enabled" onChange={(autoEnabled) => onApprovalModeChange({ autoEnabled })} />
          <ReviewerSettings reviewer={approval.reviewer} disabled={disabled || !approval.autoEnabled} onChange={(reviewer) => onApprovalModeChange({ reviewer })} />
          <p className="rounded-lg border border-border/70 px-3 py-2 text-xs text-muted-foreground" data-testid="approval-privacy-disclosure">
            Reviewer context is sent to the selected model provider and may add latency, usage, and cost. Automatic review can make mistakes. Redacted decision metadata stays local, is not encrypted at rest, and never stores raw reviewer input or output. Full access removes routine Pho containment and review for that chat.
          </p>
          <SettingsToggle label="Keep decision history" description="Store a bounded, redacted approval history in application data." checked={approval.decisionHistoryEnabled} disabled={disabled} testId="approval-history-enabled" onChange={(decisionHistoryEnabled) => onApprovalModeChange({ decisionHistoryEnabled })} />
          <div className="grid gap-2 rounded-lg border border-border/70 px-3 py-2 text-xs" data-testid="approval-decision-history">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Recent approval decisions</span>
              <Button size="sm" variant="outline" disabled={historyLoading} onClick={() => void loadHistory()}>
                {historyLoading ? "Loading…" : history ? "Refresh" : "View"}
              </Button>
            </div>
            {historyError ? <p className="text-destructive" role="alert">{historyError}</p> : null}
            {history ? (
              history.entries.length > 0 ? (
                <ol className="grid gap-1.5" aria-label="Recent approval decisions">
                  {history.entries.map((entry) => (
                    <li key={entry.id} className="rounded-md bg-muted/40 px-2 py-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-medium">{entry.action.title}</span>
                        <span className="text-muted-foreground">{entry.mode} · {entry.outcome}</span>
                      </div>
                      <p className="text-muted-foreground">{entry.action.summary}</p>
                      {entry.rationale ? <p className="mt-0.5 text-muted-foreground">{entry.rationale}</p> : null}
                      <time className="mt-0.5 block text-[10px] text-muted-foreground" dateTime={entry.occurredAt}>{entry.occurredAt}</time>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-muted-foreground">No recorded approval decisions.</p>
            ) : <p className="text-muted-foreground">History is loaded only when you ask to inspect it.</p>}
          </div>
          <SettingsToggle label="Enable Full access" description="Allow a chat to bypass ordinary containment after a blocking risk warning. Full access is never a new-chat default." checked={approval.fullAccessEnabled} disabled={disabled} testId="approval-full-enabled" destructive onChange={(fullAccessEnabled) => onApprovalModeChange({ fullAccessEnabled })} />
          {approval.migration.state !== "not-needed" && approval.migration.state !== "complete" ? (
            <Alert className="text-xs" data-testid="approval-migration">
              <AlertDescription className="grid gap-2 text-xs">
                <p>{approval.migration.reason ?? "Legacy permission settings need an explicit migration before all approval modes are available."}</p>
                <Button size="sm" variant="outline" disabled={disabled} onClick={() => onMigrateLegacyPermissions({ acknowledgeCustom: approval.legacy.custom, acknowledgeSharedAgentDir: approval.legacy.sharedAgentDir })}>Review and migrate</Button>
              </AlertDescription>
            </Alert>
          ) : null}
        </>
      ) : (
        <Alert className="text-xs" data-testid="approval-legacy-compatibility">
          <AlertDescription className="text-xs">Legacy permission policy remains active until the approval-mode runtime is available. Current profile: {settings.permission.profile}.</AlertDescription>
        </Alert>
      )}
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
      <div className="grid gap-2 border-t border-border/70 pt-4">
        <h3 className="text-xs font-medium">Active boundary</h3>
        <SandboxSettingsSection sandbox={settings.sandbox} busy={disabled} running={running} showEnable={false} onChange={onSandboxChange} />
      </div>
    </section>
  );
}

function SettingsToggle({ label, description, checked, disabled, testId, destructive = false, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  testId: string;
  destructive?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className="glass-panel flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm"><input type="checkbox" className="mt-1" checked={checked} disabled={disabled} data-testid={testId} onChange={(event) => onChange(event.target.checked)} /><span><strong className={cn("font-medium", destructive && "text-destructive")}>{label}</strong><span className="mt-0.5 block text-xs text-muted-foreground">{description}</span></span></label>;
}

function ReviewerSettings({ reviewer, disabled, onChange }: {
  reviewer: NonNullable<HarnessSettingsSnapshot["approvalModes"]>["reviewer"];
  disabled: boolean;
  onChange: (reviewer: NonNullable<UpdateApprovalModeSettingsInput["reviewer"]>) => void;
}) {
  const [providerId, setProviderId] = useState(reviewer.providerId ?? "");
  const [modelId, setModelId] = useState(reviewer.modelId ?? "");
  useEffect(() => {
    setProviderId(reviewer.providerId ?? "");
    setModelId(reviewer.modelId ?? "");
  }, [reviewer.modelId, reviewer.providerId]);
  const modelSelected = reviewer.selection === "model";
  return (
    <div className="grid gap-2 rounded-lg border border-border/70 px-3 py-2 text-xs" data-testid="approval-reviewer-settings">
      <span className="font-medium">Reviewer</span>
      <label className="flex items-center gap-2"><input type="radio" name="approval-reviewer" checked={!modelSelected} disabled={disabled} data-testid="approval-reviewer-automatic" onChange={() => onChange({ selection: "automatic" })} />Automatic</label>
      <label className="flex items-center gap-2"><input type="radio" name="approval-reviewer" checked={modelSelected} disabled={disabled || providerId.trim() === "" || modelId.trim() === ""} data-testid="approval-reviewer-model" onChange={() => onChange({ selection: "model", providerId: providerId.trim(), modelId: modelId.trim() })} />Specific authenticated model</label>
      <div className="grid grid-cols-2 gap-2">
        <input className="rounded-md border border-border bg-background px-2 py-1" aria-label="Reviewer provider" placeholder="provider" value={providerId} disabled={disabled} onChange={(event) => setProviderId(event.target.value)} />
        <input className="rounded-md border border-border bg-background px-2 py-1" aria-label="Reviewer model" placeholder="model" value={modelId} disabled={disabled} onChange={(event) => setModelId(event.target.value)} />
      </div>
      {providerId.trim() && modelId.trim() ? <Button size="sm" variant="outline" disabled={disabled} data-testid="approval-reviewer-apply" onClick={() => onChange({ selection: "model", providerId: providerId.trim(), modelId: modelId.trim() })}>Use this model</Button> : null}
      <span className="text-muted-foreground">Effective: {reviewer.effectiveModelId ?? "Automatic"}{reviewer.available ? "" : ` · ${reviewer.reason ?? "Unavailable"}`}</span>
    </div>
  );
}

function AppearanceSettingRow({
  htmlFor,
  testId,
  label,
  description,
  children,
}: {
  htmlFor: string;
  testId?: string;
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4" data-testid={testId}>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex w-44 shrink-0 items-center justify-end">{children}</div>
    </div>
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
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label={`Decrease ${label.toLowerCase()}`}
        data-testid={`${testId}-decrease`}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </Button>
      <output id={id} className="min-w-10 text-center text-sm tabular-nums" aria-live="polite">
        {value}px
      </output>
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label={`Increase ${label.toLowerCase()}`}
        data-testid={`${testId}-increase`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </Button>
    </div>
  );
}
