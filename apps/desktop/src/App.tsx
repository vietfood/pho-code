import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import {
  applyRuntimeEvent,
  emptyConversationState,
  emptyFeatureSnapshot,
  idleProviderAccountsResult,
  isHarnessError,
  RUNTIME_EVENT_TYPES,
  MAX_PREPARED_IMAGES,
  MAX_SOURCE_IMAGE_BYTES,
  idleRunState,
  isLiveRunDeltaType,
  runtimeEventUpdatesSessionList,
  type BootstrapState,
  type ConversationViewState,
  type HarnessSettingsSnapshot,
  type ModelSummary,
  type PreparedImageSummary,
  type ProviderAccountsResult,
  type ProviderAuthFlowSnapshot,
  type ResolveHostDialogInput,
  type SessionSnapshot,
  type SessionSummary,
  type ThinkingLevel,
  type UpdateAppearanceSettingsInput,
  type UpdatePermissionSettingsInput,
  type WorkspaceSnapshot,
} from "@pho-code/protocol";
import {
  AppShell,
  AppSidebar,
  applyAppearanceFonts,
  applyAppearanceTheme,
  Conversation,
  NotificationToast,
  fileToBase64,
  pastedImageDisplayName,
  readSidebarCollapsed,
  SettingsView,
  WorkspacePicker,
  writeSidebarCollapsed,
  replaceLiveRun,
} from "@pho-code/ui";
import { getDesktopBridge } from "./bridge";

type PendingSession = {
  workspaceId: string;
  sessionId: string | null;
};

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapState | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [conversation, setConversation] = useState<ConversationViewState>(emptyConversationState);
  const [sessionsByWorkspace, setSessionsByWorkspace] = useState<Record<string, SessionSummary[]>>({});
  const [draft, setDraft] = useState("");
  const [preparedImages, setPreparedImages] = useState<PreparedImageSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providerAccounts, setProviderAccounts] = useState<ProviderAccountsResult>(idleProviderAccountsResult);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed());
  const composerAfterRun = useRef(false);
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      writeSidebarCollapsed(next);
      return next;
    });
  }, []);

  const rememberSessions = useCallback((workspaceId: string, sessions: readonly SessionSummary[]) => {
    setSessionsByWorkspace((current) => ({ ...current, [workspaceId]: [...sessions] }));
  }, []);

  const refreshBootstrap = useCallback(async () => {
    const bridge = getDesktopBridge();
    const [next, settings, accounts] = await Promise.all([
      bridge.getBootstrapState(),
      bridge.getSettings(),
      bridge.listProviderAccounts(),
    ]);
    setBootstrap(next);
    setProviderAccounts(accounts);
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
      if (conversationRef.current.snapshot?.session.id !== next.activeSession.session.id) {
        replaceLiveRun(next.activeSession.run, { immediate: true });
      }
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
        authFlow: current.authFlow,
      };
    });
  }, [rememberSessions]);

  useEffect(() => {
    let cancelled = false;
    const bridge = getDesktopBridge();
    const stop = bridge.subscribe((event) => {
      const next = applyRuntimeEvent(conversationRef.current, event);
      conversationRef.current = next;
      const run = next.snapshot?.run ?? idleRunState();
      if (isLiveRunDeltaType(event.type)) {
        replaceLiveRun(run);
        return;
      }
      replaceLiveRun(run, { immediate: true });
      if (runtimeEventUpdatesSessionList(event.type) && next.snapshot) {
        rememberSessions(next.snapshot.workspace.id, next.snapshot.sessions);
      }
      setConversation(next);
      if (event.type === RUNTIME_EVENT_TYPES.providerAuthFlow) {
        const phase = (event.payload as { phase?: string }).phase;
        if (phase === "completed" || phase === "failed" || phase === "cancelled") {
          void refreshBootstrap().catch(() => undefined);
        }
      }
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

  const appearance = conversation.settings?.appearance;
  useEffect(() => {
    if (appearance) {
      applyAppearanceFonts(appearance);
      applyAppearanceTheme(appearance);
    }
  }, [appearance]);

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

  function applySessionSnapshot(snapshot: SessionSnapshot): void {
    replaceLiveRun(snapshot.run, { immediate: true });
    setConversation((current) => ({
      lastSequence: current.lastSequence,
      snapshot,
      dialog: null,
      notification: null,
      settings: current.settings,
      authFlow: current.authFlow,
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

  function resetConversationChrome(): void {
    replaceLiveRun(idleRunState(), { immediate: true });
    setConversation((current) => ({
      ...emptyConversationState(),
      settings: current.settings,
      authFlow: current.authFlow,
    }));
  }

  function applyAuthFlow(snapshot: ProviderAuthFlowSnapshot): void {
    setConversation((current) => {
      const currentFlow = current.authFlow;
      if (
        currentFlow &&
        currentFlow.flowId === snapshot.flowId &&
        currentFlow.revision >= snapshot.revision
      ) {
        return current;
      }
      return { ...current, authFlow: snapshot };
    });
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

  async function switchSession(
    workspaceId: string,
    sessionId: string | null,
    action: () => Promise<SessionSnapshot>,
  ): Promise<void> {
    if (sessionId && sessionId === conversation.snapshot?.session.id) {
      return;
    }
    setPendingSession({ workspaceId, sessionId });
    setError(null);
    setDraft("");
    setPreparedImages([]);
    setSettingsOpen(false);
    replaceLiveRun(idleRunState(), { immediate: true });
    try {
      const opened = await action();
      applySessionSnapshot(opened);
      setPendingSession(null);
      // Soft metadata refresh; do not block or remount the shell.
      void refreshBootstrap().catch(() => undefined);
    } catch (cause) {
      setError(errorMessage(cause));
      setPendingSession(null);
    }
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
  const switchingSession = pendingSession !== null;
  const activeWorkspaceId = pendingSession?.workspaceId ?? snapshot?.workspace.id ?? workspace?.workspace.id;
  const selectedSessionId = pendingSession?.sessionId ?? snapshot?.session.id;
  const settingsVisible = settingsOpen && Boolean(conversation.settings);

  function admitComposer(kind: "send" | "steer" | "followUp"): void {
    if (!snapshot) {
      return;
    }
    void runCommand(async () => {
      const text = draft.trim();
      const imageIds = preparedImages.map((image) => image.id);
      if (!text && imageIds.length === 0) {
        return;
      }
      const previousDraft = draft;
      const previousImages = preparedImages;
      setDraft("");
      setPreparedImages([]);
      const payload = {
        sessionId: snapshot.session.id,
        text,
        ...(imageIds.length > 0 ? { imageIds } : {}),
      };
      try {
        switch (kind) {
          case "send":
            await getDesktopBridge().sendPrompt(payload);
            return;
          case "steer": {
            const runId = snapshot.run.runId;
            if (!runId) {
              throw new Error("Steer requires the current run.");
            }
            await getDesktopBridge().steerRun({ ...payload, runId });
            return;
          }
          case "followUp": {
            const runId = snapshot.run.runId;
            if (!runId) {
              throw new Error("A follow-up requires the current run.");
            }
            await getDesktopBridge().queueFollowUp({ ...payload, runId });
            return;
          }
          default: {
            const exhaustive: never = kind;
            return exhaustive;
          }
        }
      } catch (cause) {
        setDraft(previousDraft);
        setPreparedImages(previousImages);
        throw cause;
      }
    });
  }

  return (
    <AppShell
      sidebar={
        sidebarCollapsed ? null : (
          <AppSidebar
            projects={projects}
            sessionsByWorkspace={sessionsByWorkspace}
            bootstrap={{
              ...bootstrap,
              ...(snapshot?.features
                ? { features: snapshot.features }
                : workspace?.features
                  ? { features: workspace.features }
                  : {}),
            }}
            busy={busy || switchingSession}
            onToggleCollapsed={toggleSidebar}
            onAddProject={() => {
              void runCommand(async () => {
                const picked = await getDesktopBridge().pickWorkspace();
                if (picked) {
                  setWorkspace(picked);
                  setDraft("");
                  setPreparedImages([]);
                  resetConversationChrome();
                  rememberSessions(picked.workspace.id, picked.sessions);
                  await refreshBootstrap();
                }
              });
            }}
            onExpandProject={(workspaceId) => {
              void runCommand(
                async () => {
                  const sessions = await getDesktopBridge().listWorkspaceSessions({ workspaceId });
                  rememberSessions(workspaceId, sessions);
                },
                { busy: false },
              );
            }}
            onNewSession={(workspaceId) => {
              void switchSession(workspaceId, null, () => getDesktopBridge().createSession({ workspaceId }));
            }}
            onOpenSession={(workspaceId, sessionId) => {
              void switchSession(workspaceId, sessionId, () =>
                getDesktopBridge().openSession({ workspaceId, sessionId }),
              );
            }}
            onReorderProjects={(workspaceIds) => {
              const previous = bootstrap.recentWorkspaces;
              const byId = new Map(previous.map((entry) => [entry.id, entry]));
              const optimistic = workspaceIds
                .map((id) => byId.get(id))
                .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
              if (optimistic.length !== previous.length) {
                return;
              }
              setBootstrap((current) => (current ? { ...current, recentWorkspaces: optimistic } : current));
              void getDesktopBridge()
                .reorderRecentWorkspaces({ workspaceIds })
                .then((records) => {
                  setBootstrap((current) => (current ? { ...current, recentWorkspaces: records } : current));
                })
                .catch(() => {
                  setBootstrap((current) => (current ? { ...current, recentWorkspaces: previous } : current));
                });
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            {...(activeWorkspaceId ? { activeWorkspaceId } : {})}
            {...(selectedSessionId ? { selectedSessionId } : {})}
          />
        )
      }
    >
      {error ? <p className="px-5 py-2 text-sm text-destructive-foreground" role="alert">{error}</p> : null}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {snapshot ? (
          <div key={snapshot.session.id} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <Conversation
                snapshot={snapshot}
                draft={draft}
                onDraftChange={setDraft}
                dialog={conversation.dialog}
                onResolveDialog={resolveHostDialog}
                switching={switchingSession}
                sidebarCollapsed={sidebarCollapsed}
                onToggleSidebar={toggleSidebar}
                {...(conversation.settings?.permission.yoloMode ? { yoloMode: true } : {})}
                onSubmit={() => {
                  void admitComposer("send");
                }}
                onSteer={() => {
                  void admitComposer("steer");
                }}
                onFollowUp={() => {
                  void admitComposer("followUp");
                }}
                images={preparedImages}
                onPickImages={() => {
                  void runCommand(async () => {
                    const result = await getDesktopBridge().pickImages();
                    setPreparedImages((current) => [...current, ...result.images].slice(0, MAX_PREPARED_IMAGES));
                  });
                }}
                onPasteImages={(files) => {
                  void runCommand(async () => {
                    if (snapshot.model?.supportsImages !== true) {
                      throw new Error("The selected model does not accept images.");
                    }
                    const remaining = MAX_PREPARED_IMAGES - preparedImages.length;
                    if (remaining <= 0) {
                      throw new Error(`A prompt can include at most ${MAX_PREPARED_IMAGES} images.`);
                    }
                    const result =
                      files.length > 0
                        ? await getDesktopBridge().pasteImages({
                            images: await Promise.all(
                              files.slice(0, remaining).map(async (file, index) => {
                                if (file.size > MAX_SOURCE_IMAGE_BYTES) {
                                  throw new Error("That image is empty or larger than 10 MiB.");
                                }
                                return {
                                  name: pastedImageDisplayName(file.name, index),
                                  data: await fileToBase64(file),
                                };
                              }),
                            ),
                          })
                        : await getDesktopBridge().pasteImages();
                    if (result.images.length === 0) {
                      throw new Error("That paste did not contain a supported image.");
                    }
                    setPreparedImages((current) => [...current, ...result.images].slice(0, MAX_PREPARED_IMAGES));
                  });
                }}
                onRemoveImage={(imageId) => {
                  void runCommand(async () => {
                    await getDesktopBridge().removePreparedImage({ imageId });
                    setPreparedImages((current) => current.filter((image) => image.id !== imageId));
                  });
                }}
                onRewrite={async ({ messageId, text }) => {
                  try {
                    setError(null);
                    const next = await getDesktopBridge().rewriteAssistantOutput({
                      sessionId: snapshot.session.id,
                      messageId,
                      text,
                    });
                    patchSnapshot((current) => ({ ...current, messages: next.messages }));
                  } catch (cause) {
                    setError(errorMessage(cause));
                    throw cause;
                  }
                }}
                onSearchReferences={(query) => getDesktopBridge().searchWorkspaceReferences({ query })}
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
        ) : switchingSession ? (
          <div
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
            data-testid="session-switching"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="session-switch-veil">
              <span className="sr-only">Opening session…</span>
            </div>
          </div>
        ) : (
          <WorkspacePicker
            recents={bootstrap.recentWorkspaces}
            busy={busy}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleSidebar}
            onPick={() => {
              void runCommand(async () => {
                const picked = await getDesktopBridge().pickWorkspace();
                if (picked) {
                  setWorkspace(picked);
                  setDraft("");
                  setPreparedImages([]);
                  resetConversationChrome();
                  rememberSessions(picked.workspace.id, picked.sessions);
                  await refreshBootstrap();
                }
              });
            }}
            onOpenRecent={(workspaceId: string) => {
              void runCommand(async () => {
                const opened = await getDesktopBridge().openRecentWorkspace({ workspaceId });
                setWorkspace(opened);
                setDraft("");
                setPreparedImages([]);
                resetConversationChrome();
                rememberSessions(opened.workspace.id, opened.sessions);
                await refreshBootstrap();
              });
            }}
          />
        )}
      </div>
      {settingsVisible && conversation.settings ? (
        <SettingsView
          settings={conversation.settings}
          running={snapshot?.run.status === "admitted" || snapshot?.run.status === "streaming"}
          busy={busy}
          providerAccounts={providerAccounts}
          authFlow={conversation.authFlow ?? providerAccounts.flow}
          onClose={() => setSettingsOpen(false)}
          onAppearanceChange={(input: UpdateAppearanceSettingsInput) => {
            void runCommand(
              async () => {
                const next = await getDesktopBridge().updateAppearanceSettings(input);
                applySettings(next);
              },
              { busy: false },
            );
          }}
          onPermissionApply={async (input: UpdatePermissionSettingsInput) => {
            await runCommand(async () => {
              const next = await getDesktopBridge().updatePermissionSettings(input);
              applySettings(next);
            });
          }}
          onTrustProjectPermissionRules={async () => {
            await runCommand(async () => {
              const next = await getDesktopBridge().trustProjectPermissionRules();
              applySettings(next);
              await refreshBootstrap();
            });
          }}
          onImportApiKey={async (input) => {
            await runCommand(async () => {
              await getDesktopBridge().importProviderApiKey(input);
              await refreshBootstrap();
            });
          }}
          onStartOAuth={async (providerId) => {
            await runCommand(async () => {
              const snapshot = await getDesktopBridge().startProviderLogin({ providerId, method: "oauth" });
              applyAuthFlow(snapshot);
              setProviderAccounts(await getDesktopBridge().listProviderAccounts());
            }, { busy: false });
          }}
          onRespondAuthPrompt={async (flowId, promptId, value) => {
            await runCommand(async () => {
              const snapshot = await getDesktopBridge().respondProviderAuthPrompt({ flowId, promptId, value });
              applyAuthFlow(snapshot);
            }, { busy: false });
          }}
          onOpenAuthLink={async (flowId, linkId) => {
            await runCommand(async () => {
              await getDesktopBridge().openProviderAuthLink({ flowId, linkId });
            }, { busy: false });
          }}
          onCancelAuth={async (flowId) => {
            await runCommand(async () => {
              const snapshot = await getDesktopBridge().cancelProviderLogin({ flowId });
              applyAuthFlow(snapshot);
              setProviderAccounts(await getDesktopBridge().listProviderAccounts());
            }, { busy: false });
          }}
          onLogoutProvider={async (providerId) => {
            await runCommand(async () => {
              setProviderAccounts(await getDesktopBridge().logoutProvider({ providerId }));
              await refreshBootstrap();
            });
          }}
        />
      ) : null}
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
