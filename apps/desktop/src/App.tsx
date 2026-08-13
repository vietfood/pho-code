import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import {
  applyRuntimeEvent,
  emptyConversationState,
  emptyFeatureSnapshot,
  isHarnessError,
  type BootstrapState,
  type ConversationViewState,
  type CredentialProviderSummary,
  type HarnessSettingsSnapshot,
  type ModelSummary,
  type ResolveHostDialogInput,
  type SessionSummary,
  type ThemePreference,
  type ThinkingLevel,
  type UpdatePermissionSettingsInput,
  type WorkspaceSnapshot,
} from "@pho-code/protocol";
import {
  AppShell,
  AppSidebar,
  Conversation,
  NotificationToast,
  SettingsView,
  WorkspacePicker,
} from "@pho-code/ui";
import { getDesktopBridge } from "./bridge";

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapState | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [conversation, setConversation] = useState<ConversationViewState>(emptyConversationState);
  const [sessionsByWorkspace, setSessionsByWorkspace] = useState<Record<string, SessionSummary[]>>({});
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [credentialProviders, setCredentialProviders] = useState<CredentialProviderSummary[]>([]);
  const composerAfterRun = useRef(false);

  const rememberSessions = useCallback((workspaceId: string, sessions: readonly SessionSummary[]) => {
    setSessionsByWorkspace((current) => ({ ...current, [workspaceId]: [...sessions] }));
  }, []);

  const refreshBootstrap = useCallback(async () => {
    const bridge = getDesktopBridge();
    const [next, settings, providers] = await Promise.all([
      bridge.getBootstrapState(),
      bridge.getSettings(),
      bridge.listCredentialProviders(),
    ]);
    setBootstrap(next);
    setCredentialProviders(providers);
    if (next.selectedWorkspace) {
      const sessions = next.activeSession?.sessions ?? next.sessions;
      setWorkspace({
        workspace: next.selectedWorkspace,
        sessions,
        models: next.models,
        features: next.features ?? next.activeSession?.features ?? emptyFeatureSnapshot(),
        ...(next.modelError ? { modelError: next.modelError } : {}),
      });
      rememberSessions(next.selectedWorkspace.id, sessions);
    }
    if (next.activeSession) {
      rememberSessions(next.activeSession.workspace.id, next.activeSession.sessions);
    }
    setConversation((current) => {
      const active = next.activeSession;
      if (!active) {
        return { ...current, settings };
      }
      const sameSession = current.snapshot?.session.id === active.session.id;
      if (sameSession) {
        return { ...current, settings };
      }
      return {
        lastSequence: 0,
        snapshot: active,
        dialog: null,
        notification: null,
        settings,
      };
    });
  }, [rememberSessions]);

  useEffect(() => {
    let cancelled = false;
    const bridge = getDesktopBridge();
    const stop = bridge.subscribe((event) => {
      setConversation((current) => {
        const next = applyRuntimeEvent(current, event);
        if (next.snapshot) {
          rememberSessions(next.snapshot.workspace.id, next.snapshot.sessions);
        }
        return next;
      });
    });

    refreshBootstrap()
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusy(false);
        }
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [refreshBootstrap, rememberSessions]);

  useEffect(() => {
    const snapshot = conversation.snapshot;
    if (!snapshot) {
      return;
    }
    const running = snapshot.run.status === "admitted" || snapshot.run.status === "streaming";
    if (running) {
      composerAfterRun.current = true;
      return;
    }
    if (composerAfterRun.current) {
      composerAfterRun.current = false;
      // Do not yank focus out of a still-open host dialog (e.g. late permission UI).
      if (!conversation.dialog) {
        document.getElementById("composer-input")?.focus();
      }
    }
  }, [conversation.dialog, conversation.snapshot]);

  const resolveHostDialog = useCallback(
    (resolution: Omit<ResolveHostDialogInput, "requestId">) => {
      void getDesktopBridge().resolveHostDialog({
        requestId: conversation.dialog?.requestId ?? "",
        ...resolution,
      });
    },
    [conversation.dialog?.requestId],
  );

  async function runCommand(action: () => Promise<void>, options: { busy?: boolean } = {}): Promise<void> {
    const showBusy = options.busy !== false;
    if (showBusy) {
      setBusy(true);
    }
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      if (showBusy) {
        setBusy(false);
      }
    }
  }

  function applySessionSnapshot(snapshot: NonNullable<ConversationViewState["snapshot"]>): void {
    setConversation((current) => ({
      lastSequence: 0,
      snapshot,
      dialog: null,
      notification: null,
      settings: current.settings,
    }));
    setWorkspace({
      workspace: snapshot.workspace,
      sessions: snapshot.sessions,
      models: snapshot.models,
      features: snapshot.features,
      ...(snapshot.modelError ? { modelError: snapshot.modelError } : {}),
    });
    rememberSessions(snapshot.workspace.id, snapshot.sessions);
  }

  function applySettings(settings: HarnessSettingsSnapshot): void {
    setConversation((current) => ({ ...current, settings }));
  }

  function patchSnapshot(
    patch: (snapshot: NonNullable<ConversationViewState["snapshot"]>) => NonNullable<ConversationViewState["snapshot"]>,
  ): void {
    setConversation((current) => {
      if (!current.snapshot) {
        return current;
      }
      return { ...current, snapshot: patch(current.snapshot) };
    });
  }

  if (!bootstrap) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-8 text-foreground">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <span
            className="flex size-10 items-center justify-center rounded-xl bg-message text-muted-foreground"
            aria-hidden="true"
          >
            <span className="size-2 rounded-full bg-muted-foreground/50 animate-pulse motion-reduce:animate-none" />
          </span>
          {error ? (
            <p className="text-sm text-destructive-foreground" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </div>
      </div>
    );
  }

  const snapshot = conversation.snapshot;
  const projects = bootstrap.recentWorkspaces;
  const activeWorkspaceId = snapshot?.workspace.id ?? workspace?.workspace.id;
  const settingsVisible = settingsOpen && Boolean(conversation.settings);

  return (
    <AppShell
      sidebar={
        <AppSidebar
          projects={projects}
          sessionsByWorkspace={sessionsByWorkspace}
          bootstrap={{
            ...bootstrap,
            ...(snapshot?.features ? { features: snapshot.features } : workspace?.features ? { features: workspace.features } : {}),
          }}
          busy={busy}
          onAddProject={() => {
            void runCommand(async () => {
              const picked = await getDesktopBridge().pickWorkspace();
              if (picked) {
                setWorkspace(picked);
                setConversation((current) => ({ ...emptyConversationState(), settings: current.settings }));
                rememberSessions(picked.workspace.id, picked.sessions);
                await refreshBootstrap();
              }
            });
          }}
          onExpandProject={(workspaceId) => {
            void runCommand(async () => {
              const sessions = await getDesktopBridge().listWorkspaceSessions({ workspaceId });
              rememberSessions(workspaceId, sessions);
            });
          }}
          onNewSession={(workspaceId) => {
            void runCommand(async () => {
              const created = await getDesktopBridge().createSession({ workspaceId });
              applySessionSnapshot(created);
              await refreshBootstrap();
            });
          }}
          onOpenSession={(workspaceId, sessionId) => {
            void runCommand(async () => {
              const opened = await getDesktopBridge().openSession({ workspaceId, sessionId });
              applySessionSnapshot(opened);
              await refreshBootstrap();
            });
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          {...(activeWorkspaceId ? { activeWorkspaceId } : {})}
          {...(snapshot?.session.id ? { selectedSessionId: snapshot.session.id } : {})}
        />
      }
    >
      {error ? <p className="px-5 py-2 text-sm text-destructive-foreground" role="alert">{error}</p> : null}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {snapshot ? (
          <div
            className={
              settingsVisible
                ? "invisible pointer-events-none absolute inset-0 flex min-h-0 flex-col overflow-hidden"
                : "flex min-h-0 flex-1 flex-col overflow-hidden"
            }
            aria-hidden={settingsVisible}
          >
            <Conversation
              snapshot={snapshot}
              draft={draft}
              onDraftChange={setDraft}
              dialog={conversation.dialog}
              onResolveDialog={resolveHostDialog}
              {...(conversation.settings?.permission.yoloMode ? { yoloMode: true } : {})}
              onSubmit={() => {
                void runCommand(async () => {
                  const text = draft.trim();
                  if (!text) {
                    return;
                  }
                  setDraft("");
                  await getDesktopBridge().sendPrompt({
                    sessionId: snapshot.session.id,
                    text,
                  });
                });
              }}
              onStop={() => {
                const runId = snapshot.run.runId;
                if (!runId) {
                  return;
                }
                void runCommand(async () => {
                  await getDesktopBridge().abortRun({
                    sessionId: snapshot.session.id,
                    runId,
                  });
                });
              }}
              onModelChange={(model: ModelSummary) => {
                const previous = snapshot.model;
                patchSnapshot((current) => ({ ...current, model }));
                void runCommand(
                  async () => {
                    try {
                      await getDesktopBridge().setSessionModel({
                        sessionId: snapshot.session.id,
                        provider: model.provider,
                        id: model.id,
                      });
                    } catch (cause) {
                      patchSnapshot((current) => {
                        if (previous) {
                          return { ...current, model: previous };
                        }
                        const next = { ...current };
                        delete next.model;
                        return next;
                      });
                      throw cause;
                    }
                  },
                  { busy: false },
                );
              }}
              onThinkingChange={(level: ThinkingLevel) => {
                const previous = snapshot.thinkingLevel;
                patchSnapshot((current) => ({ ...current, thinkingLevel: level }));
                void runCommand(
                  async () => {
                    try {
                      await getDesktopBridge().setThinkingLevel({
                        sessionId: snapshot.session.id,
                        level,
                      });
                    } catch (cause) {
                      patchSnapshot((current) => ({ ...current, thinkingLevel: previous }));
                      throw cause;
                    }
                  },
                  { busy: false },
                );
              }}
            />
          </div>
        ) : (
          <WorkspacePicker
            recents={bootstrap.recentWorkspaces}
            busy={busy}
            onPick={() => {
              void runCommand(async () => {
                const picked = await getDesktopBridge().pickWorkspace();
                if (picked) {
                  setWorkspace(picked);
                  setConversation((current) => ({ ...emptyConversationState(), settings: current.settings }));
                  rememberSessions(picked.workspace.id, picked.sessions);
                  await refreshBootstrap();
                }
              });
            }}
            onOpenRecent={(workspaceId: string) => {
              void runCommand(async () => {
                const opened = await getDesktopBridge().openRecentWorkspace({ workspaceId });
                setWorkspace(opened);
                setConversation((current) => ({ ...emptyConversationState(), settings: current.settings }));
                rememberSessions(opened.workspace.id, opened.sessions);
                await refreshBootstrap();
              });
            }}
          />
        )}
        {settingsVisible && conversation.settings ? (
          <div className="absolute inset-0 z-10 flex min-h-0 flex-col overflow-hidden bg-background">
        <SettingsView
          settings={conversation.settings}
          running={snapshot?.run.status === "admitted" || snapshot?.run.status === "streaming"}
          busy={busy}
          credentialProviders={credentialProviders}
          onClose={() => setSettingsOpen(false)}
          onAppearanceChange={(theme: ThemePreference) => {
            void runCommand(async () => {
              const next = await getDesktopBridge().updateAppearanceSettings({ theme });
              applySettings(next);
            });
          }}
          onPermissionApply={async (input: UpdatePermissionSettingsInput) => {
            await runCommand(async () => {
              const next = await getDesktopBridge().updatePermissionSettings(input);
              applySettings(next);
            });
          }}
          onImportApiKey={async (input) => {
            await runCommand(async () => {
              const result = await getDesktopBridge().importProviderApiKey(input);
              setCredentialProviders(result.providers);
              await refreshBootstrap();
            });
          }}
        />
          </div>
        ) : null}
      </div>
      {conversation.notification ? (
        <NotificationToast
          notification={conversation.notification}
          onDismiss={() => setConversation((current) => ({ ...current, notification: null }))}
        />
      ) : null}
    </AppShell>
  );
}

export function Root() {
  return (
    <StrictMode>
      <App />
    </StrictMode>
  );
}

function errorMessage(cause: unknown): string {
  if (isHarnessError(cause)) {
    return cause.message;
  }
  if (cause instanceof Error && cause.message.trim() !== "") {
    return cause.message;
  }
  return "The desktop command failed.";
}
