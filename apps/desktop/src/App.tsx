import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  applyLiveRunDelta,
  applyRuntimeEventToCache,
  emptyConversationCache,
  emptyConversationState,
  emptyFeatureSnapshot,
  emptySessionContextPrompt,
  emptySessionPlanSnapshot,
  eventSessionKey,
  extractAtMentionPaths,
  idleProviderAccountsResult,
  isHarnessError,
  latestChangeReview,
  RUNTIME_EVENT_TYPES,
  MAX_PREPARED_IMAGES,
  MAX_SOURCE_IMAGE_BYTES,
  idleRunState,
  isLiveRunDeltaType,
  mergeLiveRun,
  sessionKeyId,
  type BootstrapState,
  type ConversationCacheState,
  type ConversationViewState,
  type HarnessSettingsSnapshot,
  type ModelSummary,
  type PrepareRemoveArchivedSessionsResult,
  type PrepareRemoveProjectResult,
  type PrepareRemoveSessionResult,
  type ProviderAccountsResult,
  type ProviderAuthFlowSnapshot,
  type ResolveHostDialogInput,
  type SessionAgentMode,
  type SessionCatalogEntry,
  type SessionSnapshot,
  type SessionSummary,
  type ThinkingLevel,
  type UpdateAppearanceSettingsInput,
  type UpdatePermissionSettingsInput,
  type UpdateSkillSourceSettingsInput,
  type WorkspaceSnapshot,
} from "@pho-code/protocol";
import {
  AppShell,
  AppSidebar,
  CollapsedSidebarActions,
  applyAppearanceFonts,
  applyAppearanceTheme,
  ChatPaneLoading,
  ChangeReviewSheet,
  Conversation,
  ContextPromptDialog,
  PlanDocumentPanel,
  NotificationToast,
  fileToBase64,
  looksLikeProjectTrustNotification,
  pastedImageDisplayName,
  ProjectTrustBanner,
  ProjectTrustDialog,
  projectPermissionTrustPending,
  readSidebarCollapsed,
  readRightSidebarCollapsed,
  RemoveArchivedSessionsDialog,
  RemoveProjectDialog,
  RemoveSessionDialog,
  RightSidebar,
  type RightSidebarSurface,
  SettingsView,
  WorkspacePicker,
  writeSidebarCollapsed,
  writeRightSidebarCollapsed,
  dropLiveRun,
  getLiveRunForKey,
  replaceLiveRun,
  selectLiveRunKey,
} from "@pho-code/ui";
import { getDesktopBridge } from "./bridge";
import { keepWelcomeSelection } from "./session-home";
import { useChangeReview } from "./use-change-review";
import {
  mergeActivityIntoCatalog,
  removeCatalogSession,
  upsertCatalogSession,
} from "./session-catalog-state";
import { useSessionSwitch } from "./use-session-switch";

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapState | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [cache, setCache] = useState<ConversationCacheState>(emptyConversationCache);
  const [sessionsByWorkspace, setSessionsByWorkspace] = useState<Record<string, SessionCatalogEntry[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PrepareRemoveSessionResult | null>(null);
  const [pendingProjectRemoval, setPendingProjectRemoval] = useState<PrepareRemoveProjectResult | null>(null);
  const [pendingArchivedRemoval, setPendingArchivedRemoval] = useState<PrepareRemoveArchivedSessionsResult | null>(
    null,
  );
  const [trustDialogOpen, setTrustDialogOpen] = useState(false);
  const [trustDialogDismissedIds, setTrustDialogDismissedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [trustBannerDismissedIds, setTrustBannerDismissedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [providerAccounts, setProviderAccounts] = useState<ProviderAccountsResult>(idleProviderAccountsResult);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed());
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(() => readRightSidebarCollapsed());
  const [rightSidebarSurface, setRightSidebarSurface] = useState<RightSidebarSurface>("changes");
  const [contextPromptBusy, setContextPromptBusy] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const composerAfterRun = useRef(false);
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const conversation = selectedConversation(cache);
  // Live runs across every workspace, for the sidebar Stop-all control.
  const liveRuns = cache.activity.filter(
    (entry) => entry.runId !== undefined && (entry.phase === "working" || entry.phase === "attention"),
  );
  const changeReview = useChangeReview(cache);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      writeSidebarCollapsed(next);
      return next;
    });
  }, []);

  const toggleRightSidebar = useCallback(() => {
    setRightSidebarCollapsed((current) => {
      const next = !current;
      writeRightSidebarCollapsed(next);
      return next;
    });
  }, []);

  const collapseRightSidebar = useCallback(() => {
    setRightSidebarCollapsed(true);
    writeRightSidebarCollapsed(true);
  }, []);

  const selectRightSurface = useCallback(
    (next: RightSidebarSurface) => {
      setRightSidebarSurface(next);
      setRightSidebarCollapsed(false);
      writeRightSidebarCollapsed(false);
      if (next !== "changes") {
        return;
      }
      const selectedKey = cacheRef.current.selectedKey;
      const snap = selectedKey ? cacheRef.current.byKey[selectedKey]?.snapshot : undefined;
      const latest = snap ? latestChangeReview(snap.changeReviews) : undefined;
      if (!latest || changeReview.scope) {
        return;
      }
      changeReview.open({
        workspaceId: latest.workspaceId,
        sessionId: latest.sessionId,
        runId: latest.runId,
      });
    },
    [changeReview.open, changeReview.scope],
  );

  const openChangeReview = useCallback(
    (scope: Parameters<typeof changeReview.open>[0]) => {
      changeReview.open(scope);
      setRightSidebarSurface("changes");
      setRightSidebarCollapsed(false);
      writeRightSidebarCollapsed(false);
    },
    [changeReview.open],
  );

  useEffect(() => {
    const scope = changeReview.scope;
    if (!scope) {
      return;
    }
    const snap = conversation.snapshot;
    if (!snap || snap.session.id !== scope.sessionId || snap.workspace.id !== scope.workspaceId) {
      changeReview.close();
    }
  }, [changeReview.close, changeReview.scope, conversation.snapshot]);

  useEffect(() => {
    setContextPromptBusy(false);
    setPlanBusy(false);
  }, [conversation.snapshot?.session.id, conversation.snapshot?.workspace.id]);

  const planDocumentPresent = (conversation.snapshot?.plan?.documentMarkdown.trim().length ?? 0) > 0;
  const planSessionKey = conversation.snapshot
    ? `${conversation.snapshot.workspace.id}:${conversation.snapshot.session.id}`
    : "";
  const previousPlanDocumentRef = useRef({ key: "", present: false });
  useEffect(() => {
    const previous = previousPlanDocumentRef.current;
    if (planSessionKey !== previous.key) {
      previousPlanDocumentRef.current = { key: planSessionKey, present: planDocumentPresent };
      return;
    }
    if (planDocumentPresent && !previous.present) {
      selectRightSurface("plan");
    }
    previousPlanDocumentRef.current = { key: planSessionKey, present: planDocumentPresent };
  }, [planDocumentPresent, planSessionKey, selectRightSurface]);

  const rememberSessions = useCallback((workspaceId: string, sessions: readonly SessionCatalogEntry[]) => {
    setSessionsByWorkspace((current) => ({ ...current, [workspaceId]: [...sessions] }));
  }, []);

  const refreshCatalog = useCallback(async (workspaceId: string) => {
    const entries = await getDesktopBridge().listSessionCatalog({ workspaceId, scope: "all" });
    rememberSessions(workspaceId, entries);
    return entries;
  }, [rememberSessions]);

  const upsertCatalog = useCallback((session: SessionSummary) => {
    setSessionsByWorkspace((current) => upsertCatalogSession(current, session));
  }, []);

  const {
    pendingSession,
    draft,
    setDraft,
    preparedImages,
    setPreparedImages,
    switchSession,
    clearSelectedSession,
    resetConversationChrome,
  } = useSessionSwitch({
    cache,
    setCache,
    setWorkspace,
    setError,
    setSettingsOpen,
    upsertCatalog,
    errorMessage,
  });

  const startNewSession = useCallback(
    (workspaceId: string) => {
      changeReview.close();
      collapseRightSidebar();
      void switchSession(workspaceId, null, () =>
        getDesktopBridge().createSession({ workspaceId }),
      );
    },
    [changeReview.close, collapseRightSidebar, switchSession],
  );

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
      void refreshCatalog(next.selectedWorkspace.id).catch(() => undefined);
    }
    if (next.activeSession) {
      void refreshCatalog(next.activeSession.workspace.id).catch(() => undefined);
      const key = sessionKeyId({
        workspaceId: next.activeSession.workspace.id,
        sessionId: next.activeSession.session.id,
      });
      const stayHome = keepWelcomeSelection(
        cacheRef.current.selectedKey,
        Object.keys(cacheRef.current.byKey).length,
      );
      if (!stayHome && cacheRef.current.selectedKey !== key) {
        replaceLiveRun(mergeLiveRun(getLiveRunForKey(key), next.activeSession.run), {
          immediate: true,
          key,
        });
        selectLiveRunKey(key);
      }
    }
    setCache((current) => {
      const active = next.activeSession;
      if (!active) {
        return { ...current, settings };
      }
      if (keepWelcomeSelection(current.selectedKey, Object.keys(current.byKey).length)) {
        return { ...current, settings };
      }
      const key = sessionKeyId({ workspaceId: active.workspace.id, sessionId: active.session.id });
      const existing = current.byKey[key];
      if (current.selectedKey === key && existing) {
        return { ...current, settings, selectedKey: key };
      }
      return {
        ...current,
        selectedKey: key,
        settings,
        byKey: {
          ...current.byKey,
          [key]: {
            lastSequence: existing?.lastSequence ?? current.lastSequence,
            snapshot: active,
            dialog: existing?.dialog ?? null,
            notification: existing?.notification ?? null,
            settings,
            authFlow: current.authFlow,
          },
        },
      };
    });
  }, [refreshCatalog]);

  useEffect(() => {
    let cancelled = false;
    const bridge = getDesktopBridge();
    const stop = bridge.subscribe((event) => {
      const eventKey = eventSessionKey(event);
      const eventId = eventKey ? sessionKeyId(eventKey) : undefined;
      const liveKey = eventId ?? cacheRef.current.selectedKey ?? undefined;
      if (isLiveRunDeltaType(event.type) && liveKey) {
        const previous =
          getLiveRunForKey(liveKey) ??
          cacheRef.current.byKey[liveKey]?.snapshot?.run ??
          idleRunState();
        replaceLiveRun(applyLiveRunDelta(previous, event), { key: liveKey });
      }
      setCache((current) => {
        const next = applyRuntimeEventToCache(current, event);
        cacheRef.current = next;
        return next;
      });
      if (isLiveRunDeltaType(event.type)) {
        return;
      }
      if (event.type === RUNTIME_EVENT_TYPES.sessionRemoved && eventId) {
        dropLiveRun(eventId);
      } else if (liveKey) {
        const owner = cacheRef.current.byKey[liveKey]?.snapshot?.run;
        if (owner) {
          replaceLiveRun(mergeLiveRun(getLiveRunForKey(liveKey), owner), {
            immediate: true,
            key: liveKey,
          });
        }
      }
      if (event.type === RUNTIME_EVENT_TYPES.sessionActivity) {
        setSessionsByWorkspace((current) =>
          mergeActivityIntoCatalog(current, event.payload as ConversationCacheState["activity"]),
        );
      } else if (event.type === RUNTIME_EVENT_TYPES.sessionRemoved && eventKey) {
        setSessionsByWorkspace((current) =>
          removeCatalogSession(current, eventKey.workspaceId, eventKey.sessionId),
        );
      } else if (
        (event.type === RUNTIME_EVENT_TYPES.sessionSnapshot || event.type === RUNTIME_EVENT_TYPES.runSettled) &&
        eventKey
      ) {
        const snap = event.payload as SessionSnapshot;
        setSessionsByWorkspace((current) => upsertCatalogSession(current, snap.session));
      }
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
  }, [refreshBootstrap]);

  const hasSnapshot = Boolean(conversation.snapshot);
  useEffect(() => {
    if (!bootstrap || (hasSnapshot && !settingsOpen)) {
      return;
    }
    for (const project of bootstrap.recentWorkspaces) {
      void refreshCatalog(project.id).catch(() => undefined);
    }
  }, [bootstrap, hasSnapshot, refreshCatalog, settingsOpen]);

  const appearance = conversation.settings?.appearance;
  useEffect(() => {
    if (appearance) {
      applyAppearanceFonts(appearance);
      applyAppearanceTheme(appearance);
    }
  }, [appearance]);

  const trustNotification = Boolean(
    conversation.notification && looksLikeProjectTrustNotification(conversation.notification.message),
  );
  const trustPending =
    projectPermissionTrustPending(conversation.settings?.permission) || trustNotification;
  const trustWorkspace = workspace?.workspace;
  const trustWorkspaceId = trustWorkspace?.id;
  useEffect(() => {
    if (!trustWorkspaceId || !trustPending) {
      if (!trustPending) {
        setTrustDialogOpen(false);
      }
      return;
    }
    if (trustDialogDismissedIds.has(trustWorkspaceId)) {
      return;
    }
    setTrustDialogOpen(true);
  }, [trustDialogDismissedIds, trustPending, trustWorkspaceId]);

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
      const dialog = conversation.dialog;
      void getDesktopBridge().resolveHostDialog({
        requestId: dialog?.requestId ?? "",
        ...(dialog?.workspaceId ? { workspaceId: dialog.workspaceId } : {}),
        ...(dialog?.sessionId ? { sessionId: dialog.sessionId } : {}),
        ...resolution,
      });
    },
    [conversation.dialog],
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

  function applySettingsCommand(action: () => Promise<HarnessSettingsSnapshot>, options: { busy?: boolean } = {}): void {
    void runCommand(async () => {
      applySettings(await action());
    }, options);
  }

  function patchSettings(patch: Partial<HarnessSettingsSnapshot>): void {
    setCache((current) =>
      current.settings ? { ...current, settings: { ...current.settings, ...patch } } : current,
    );
  }

  function clearSelectedNotification(): void {
    setCache((current) => {
      if (!current.selectedKey) {
        return current;
      }
      const selected = current.byKey[current.selectedKey];
      if (!selected) {
        return current;
      }
      return {
        ...current,
        byKey: {
          ...current.byKey,
          [current.selectedKey]: { ...selected, notification: null },
        },
      };
    });
  }

  function requestRemoval<T>(prepare: () => Promise<T>, set: (value: T) => void): void {
    void runCommand(async () => {
      set(await prepare());
    }, { busy: false });
  }

  function optimisticSnapshotCommand(
    apply: (current: SessionSnapshot) => SessionSnapshot,
    rollback: (current: SessionSnapshot) => SessionSnapshot,
    action: () => Promise<unknown>,
  ): void {
    patchSnapshot(apply);
    void runCommand(async () => {
      try {
        await action();
      } catch (cause) {
        patchSnapshot(rollback);
        throw cause;
      }
    }, { busy: false });
  }

  async function adoptPickedWorkspace(picked: WorkspaceSnapshot): Promise<void> {
    setWorkspace(picked);
    setDraft("");
    setPreparedImages([]);
    resetConversationChrome();
    await refreshCatalog(picked.workspace.id);
    await refreshBootstrap();
  }

  function pickAndAdoptWorkspace(): void {
    void runCommand(async () => {
      const picked = await getDesktopBridge().pickWorkspace();
      if (picked) {
        await adoptPickedWorkspace(picked);
      }
    });
  }

  async function openRecentAndAdopt(workspaceId: string): Promise<void> {
    const opened = await getDesktopBridge().openRecentWorkspace({ workspaceId });
    setWorkspace(opened);
    setDraft("");
    setPreparedImages([]);
    resetConversationChrome();
    rememberSessions(opened.workspace.id, []);
    void refreshCatalog(opened.workspace.id).catch(() => undefined);
    await refreshBootstrap();
  }

  function openSessionEntry(workspaceId: string, sessionId: string): void {
    void switchSession(workspaceId, sessionId, () =>
      getDesktopBridge().openSession({ workspaceId, sessionId }),
    );
  }

  function applyAuthFlow(snapshot: ProviderAuthFlowSnapshot): void {
    setCache((current) => {
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
    setCache((current) => ({ ...current, settings }));
  }

  function openSettings(): void {
    setSettingsOpen(true);
    void getDesktopBridge()
      .getSettings()
      .then(applySettings)
      .catch(() => undefined);
  }

  const patchSnapshot = useCallback(
    (
      patch: (snapshot: NonNullable<ConversationViewState["snapshot"]>) => NonNullable<ConversationViewState["snapshot"]>,
    ): void => {
      setCache((current) => {
        if (!current.selectedKey) {
          return current;
        }
        const selected = current.byKey[current.selectedKey];
        if (!selected?.snapshot) {
          return current;
        }
        return {
          ...current,
          byKey: {
            ...current.byKey,
            [current.selectedKey]: { ...selected, snapshot: patch(selected.snapshot) },
          },
        };
      });
    },
    [],
  );

  const onRewrite = useCallback(
    async ({ messageId, text }: { messageId: string; text: string }) => {
      const snap = selectedCachedSnapshot(cacheRef.current);
      if (!snap) {
        return;
      }
      try {
        setError(null);
        const next = await getDesktopBridge().rewriteAssistantOutput({
          sessionId: snap.session.id,
          workspaceId: snap.workspace.id,
          messageId,
          text,
        });
        patchSnapshot((current) => ({ ...current, messages: next.messages }));
      } catch (cause) {
        setError(errorMessage(cause));
        throw cause;
      }
    },
    [patchSnapshot],
  );

  const onUpdateContextPrompt = useCallback(
    async (input: { preamble: string; disabledSectionIds: string[]; reset?: boolean }) => {
      const snap = selectedCachedSnapshot(cacheRef.current);
      if (!snap) {
        return;
      }
      try {
        setError(null);
        const next = await getDesktopBridge().updateSessionContextPrompt({
          sessionId: snap.session.id,
          workspaceId: snap.workspace.id,
          ...(input.reset
            ? { reset: true }
            : { preamble: input.preamble, disabledSectionIds: input.disabledSectionIds }),
        });
        patchSnapshot((current) => ({
          ...current,
          ...(next.contextPrompt ? { contextPrompt: next.contextPrompt } : {}),
        }));
      } catch (cause) {
        setError(errorMessage(cause));
        throw cause;
      }
    },
    [patchSnapshot],
  );

  const onSetSessionMode = useCallback(
    async (mode: SessionAgentMode) => {
      const snap = selectedCachedSnapshot(cacheRef.current);
      if (!snap) {
        return;
      }
      const previous = snap.plan;
      patchSnapshot((current) => ({
        ...current,
        plan: { ...(current.plan ?? emptySessionPlanSnapshot()), mode, executing: false },
      }));
      try {
        setError(null);
        const next = await getDesktopBridge().setSessionMode({
          sessionId: snap.session.id,
          workspaceId: snap.workspace.id,
          mode,
        });
        patchSnapshot((current) => ({ ...current, ...(next.plan ? { plan: next.plan } : {}) }));
      } catch (cause) {
        patchSnapshot((current) => {
          if (previous) {
            return { ...current, plan: previous };
          }
          const next = { ...current };
          delete next.plan;
          return next;
        });
        setError(errorMessage(cause));
      }
    },
    [patchSnapshot],
  );

  const withPlanBusy = useCallback(async (work: () => Promise<void>): Promise<void> => {
    setPlanBusy(true);
    try {
      await work();
    } finally {
      setPlanBusy(false);
    }
  }, []);

  const withContextPromptBusy = useCallback(async (work: () => Promise<void>): Promise<void> => {
    setContextPromptBusy(true);
    try {
      await work();
    } finally {
      setContextPromptBusy(false);
    }
  }, []);

  const onSavePlanDocument = useCallback(
    async (documentMarkdown: string) => {
      const snap = selectedCachedSnapshot(cacheRef.current);
      if (!snap) {
        return;
      }
      await withPlanBusy(async () => {
        const next = await getDesktopBridge().updateSessionPlanDocument({
          sessionId: snap.session.id,
          workspaceId: snap.workspace.id,
          documentMarkdown,
        });
        patchSnapshot((current) => ({ ...current, ...(next.plan ? { plan: next.plan } : {}) }));
      });
    },
    [patchSnapshot, withPlanBusy],
  );

  const onExecutePlan = useCallback(async () => {
    const snap = selectedCachedSnapshot(cacheRef.current);
    if (!snap) {
      return;
    }
    await withPlanBusy(async () => {
      await getDesktopBridge().executeSessionPlan({
        sessionId: snap.session.id,
        workspaceId: snap.workspace.id,
      });
    });
  }, [withPlanBusy]);

  const onRefinePlan = useCallback(
    async (comment: string) => {
      const snap = selectedCachedSnapshot(cacheRef.current);
      if (!snap) {
        return;
      }
      setError(null);
      await withPlanBusy(async () => {
        try {
          await getDesktopBridge().sendPrompt({
            sessionId: snap.session.id,
            workspaceId: snap.workspace.id,
            text: comment,
          });
        } catch (cause) {
          setError(errorMessage(cause));
          throw cause;
        }
      });
    },
    [withPlanBusy],
  );

  const sidebarBootstrap = useMemo(() => {
    if (!bootstrap) {
      return null;
    }
    return {
      ...bootstrap,
      ...(conversation.snapshot?.features
        ? { features: conversation.snapshot.features }
        : workspace?.features
          ? { features: workspace.features }
          : {}),
    };
  }, [bootstrap, conversation.snapshot?.features, workspace?.features]);

  if (!bootstrap || !sidebarBootstrap) {
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
  const pendingCached = Boolean(
    pendingSession?.sessionId &&
      cache.byKey[sessionKeyId({ workspaceId: pendingSession.workspaceId, sessionId: pendingSession.sessionId })]
        ?.snapshot,
  );
  const chatLoading = pendingSession !== null && !pendingCached;
  const activeWorkspaceId = pendingSession?.workspaceId ?? snapshot?.workspace.id ?? workspace?.workspace.id;
  const selectedSessionId = pendingSession?.sessionId ?? snapshot?.session.id;
  const settingsVisible = settingsOpen && Boolean(conversation.settings);
  const showTrustBanner = Boolean(
    trustPending &&
      trustWorkspaceId &&
      !trustDialogOpen &&
      !trustBannerDismissedIds.has(trustWorkspaceId),
  );
  const trustNotice =
    showTrustBanner && trustWorkspace ? (
      <ProjectTrustBanner
        sessionTrusted={conversation.settings?.permission.projectPermissionRulesTrusted === true}
        disabled={busy}
        onTrust={() => setTrustDialogOpen(true)}
        onDismiss={() => {
          setTrustBannerDismissedIds((current) => addWorkspaceId(current, trustWorkspace.id));
        }}
      />
    ) : null;

  const contextPrompt = snapshot?.contextPrompt ?? emptySessionContextPrompt();
  const paneFill = Boolean(snapshot || chatLoading) && !rightSidebarCollapsed;
  const collapsedHeaderActions =
    sidebarCollapsed && paneFill ? (
      <CollapsedSidebarActions
        layout="header"
        busy={busy}
        canNewSession={Boolean(activeWorkspaceId)}
        homeActive={!snapshot && !chatLoading}
        onGoHome={clearSelectedSession}
        onAddProject={pickAndAdoptWorkspace}
        onNewSession={() => {
          if (!activeWorkspaceId) {
            return;
          }
          startNewSession(activeWorkspaceId);
        }}
        onOpenSettings={openSettings}
      />
    ) : null;
  let rightSidebarPanel: ReactNode = null;
  if (!rightSidebarCollapsed) {
    switch (rightSidebarSurface) {
      case "context-prompt":
        rightSidebarPanel = snapshot ? (
          <ContextPromptDialog
            embedded
            contextPrompt={contextPrompt}
            busy={contextPromptBusy}
            onClose={() => {
              if (!contextPromptBusy) {
                collapseRightSidebar();
              }
            }}
            onSave={(input) => withContextPromptBusy(() => onUpdateContextPrompt(input))}
            onReset={() =>
              withContextPromptBusy(() =>
                onUpdateContextPrompt({
                  preamble: contextPrompt.defaultPreamble,
                  disabledSectionIds: [],
                  reset: true,
                }),
              )
            }
          />
        ) : (
          <p className="px-3 py-3 text-xs text-muted-foreground">Opening session…</p>
        );
        break;
      case "changes":
        rightSidebarPanel = changeReview.scope ? (
          <ChangeReviewSheet
            review={changeReview.review}
            selectedPath={changeReview.selectedPath}
            diff={changeReview.diff}
            loading={changeReview.loading}
            error={changeReview.error}
            busy={changeReview.busy}
            undoPreview={changeReview.undoPreview}
            onSelectPath={changeReview.selectPath}
            onApprove={(relativePath) => {
              void changeReview.approve([relativePath]);
            }}
            onApproveAll={() => {
              const paths = changeReview.review?.files
                .filter((file) => file.status === "pending" || file.status === "conflict")
                .map((file) => file.relativePath);
              void changeReview.approve(paths);
            }}
            onPrepareUndo={(relativePath) => {
              void changeReview.prepareUndo(relativePath);
            }}
            onApplyUndo={() => {
              void changeReview.applyUndo();
            }}
            onCancelUndo={changeReview.cancelUndo}
            onLoadMore={changeReview.loadMore}
            contextLines={changeReview.contextLines}
            onContextLinesChange={changeReview.setContextLines}
          />
        ) : (
          <p className="px-3 py-3 text-xs text-muted-foreground" data-testid="change-review-empty">
            No tracked write/edit files to review yet.
          </p>
        );
        break;
      case "plan":
        rightSidebarPanel = snapshot ? (
          <PlanDocumentPanel
            plan={snapshot.plan}
            idle={
              snapshot.run.status === "idle" ||
              snapshot.run.status === "settled" ||
              snapshot.run.status === "failed" ||
              snapshot.run.status === "cancelled"
            }
            busy={planBusy}
            onSave={onSavePlanDocument}
            onExecute={onExecutePlan}
            onRefine={onRefinePlan}
          />
        ) : (
          <p className="px-3 py-3 text-xs text-muted-foreground">Opening session…</p>
        );
        break;
      default: {
        const exhaustive: never = rightSidebarSurface;
        rightSidebarPanel = exhaustive;
      }
    }
  }

  function leaveSessionIfCurrent(workspaceId: string, sessionId: string, entries: readonly SessionCatalogEntry[]): void {
    if (snapshot?.workspace.id !== workspaceId || snapshot.session.id !== sessionId) {
      return;
    }
    const next = entries.find((entry) => !entry.archived && entry.sessionId !== sessionId);
    if (next) {
      void switchSession(workspaceId, next.sessionId, () =>
        getDesktopBridge().openSession({ workspaceId, sessionId: next.sessionId }),
      );
      return;
    }
    startNewSession(workspaceId);
  }

  function requestRemoveSession(workspaceId: string, sessionId: string): void {
    requestRemoval(() => getDesktopBridge().prepareRemoveSession({ workspaceId, sessionId }), setPendingRemoval);
  }

  function requestRemoveProject(workspaceId: string): void {
    requestRemoval(() => getDesktopBridge().prepareRemoveProject({ workspaceId }), setPendingProjectRemoval);
  }

  function requestRemoveAllArchived(workspaceId: string): void {
    requestRemoval(
      () => getDesktopBridge().prepareRemoveArchivedSessions({ workspaceId }),
      setPendingArchivedRemoval,
    );
  }

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
      const references = extractAtMentionPaths(text).map((path) => ({ path }));
      const payload = {
        sessionId: snapshot.session.id,
        workspaceId: snapshot.workspace.id,
        text,
        ...(references.length > 0 ? { references } : {}),
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
      onToggleSidebar={toggleSidebar}
      onToggleRightSidebar={toggleRightSidebar}
      sidebar={
        <AppSidebar
          collapsed={sidebarCollapsed}
          overlay={!(sidebarCollapsed && paneFill)}
          projects={projects}
          sessionsByWorkspace={sessionsByWorkspace}
          bootstrap={sidebarBootstrap}
          busy={busy}
          onToggleCollapsed={toggleSidebar}
            onGoHome={clearSelectedSession}
            homeActive={!snapshot && !chatLoading}
            onAddProject={pickAndAdoptWorkspace}
            onExpandProject={(workspaceId) => {
              void runCommand(
                async () => {
                  await refreshCatalog(workspaceId);
                },
                { busy: false },
              );
            }}
            onNewSession={startNewSession}
            onOpenSession={openSessionEntry}
            onArchiveSession={(workspaceId, sessionId) => {
              void runCommand(
                async () => {
                  await getDesktopBridge().archiveSession({ workspaceId, sessionId });
                  const entries = await refreshCatalog(workspaceId);
                  leaveSessionIfCurrent(workspaceId, sessionId, entries);
                },
                { busy: false },
              );
            }}
            onRemoveSession={requestRemoveSession}
            onRemoveProject={requestRemoveProject}
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
            onOpenSettings={openSettings}
            stopAllCount={liveRuns.length}
            onStopAll={() => {
              const targets = liveRuns;
              void runCommand(async () => {
                await Promise.allSettled(
                  targets.map((entry) =>
                    getDesktopBridge().abortRun({
                      workspaceId: entry.workspaceId,
                      sessionId: entry.sessionId,
                      runId: entry.runId as string,
                    }),
                  ),
                );
              }, { busy: false });
            }}
            {...(activeWorkspaceId ? { activeWorkspaceId } : {})}
            {...(selectedSessionId ? { selectedSessionId } : {})}
          />
      }
    >
      {error ? <p className="px-5 py-2 text-sm text-destructive-foreground" role="alert">{error}</p> : null}
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {chatLoading ? (
          <ChatPaneLoading
            sidebarCollapsed={sidebarCollapsed}
            paneFill={paneFill}
            {...(collapsedHeaderActions ? { headerActions: collapsedHeaderActions } : {})}
            onToggleSidebar={toggleSidebar}
          />
        ) : snapshot ? (
              <Conversation
                snapshot={snapshot}
                draft={draft}
                onDraftChange={setDraft}
                dialog={conversation.dialog}
                onResolveDialog={resolveHostDialog}
                sidebarCollapsed={sidebarCollapsed}
                paneFill={paneFill}
                {...(collapsedHeaderActions ? { headerActions: collapsedHeaderActions } : {})}
                onToggleSidebar={toggleSidebar}
                notice={trustNotice}
                {...(trustPending ? { onTrustProject: () => setTrustDialogOpen(true) } : {})}
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
                    const result = await getDesktopBridge().pickImages({
                      sessionId: snapshot.session.id,
                      workspaceId: snapshot.workspace.id,
                    });
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
                            sessionId: snapshot.session.id,
                            workspaceId: snapshot.workspace.id,
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
                        : await getDesktopBridge().pasteImages({
                            sessionId: snapshot.session.id,
                            workspaceId: snapshot.workspace.id,
                          });
                    if (result.images.length === 0) {
                      throw new Error("That paste did not contain a supported image.");
                    }
                    setPreparedImages((current) => [...current, ...result.images].slice(0, MAX_PREPARED_IMAGES));
                  });
                }}
                onRemoveImage={(imageId) => {
                  void runCommand(async () => {
                    await getDesktopBridge().removePreparedImage({
                      imageId,
                      sessionId: snapshot.session.id,
                      workspaceId: snapshot.workspace.id,
                    });
                    setPreparedImages((current) => current.filter((image) => image.id !== imageId));
                  });
                }}
                {...(conversation.settings?.skills ? { skills: conversation.settings.skills } : {})}
                onOpenChangeReview={openChangeReview}
                onRewrite={onRewrite}
                onSearchReferences={(query) => getDesktopBridge().searchWorkspaceReferences({ query })}
                onStop={() => {
                  const runId = snapshot.run.runId;
                  if (!runId) {
                    return;
                  }
                  void runCommand(async () => {
                    await getDesktopBridge().abortRun({
                      sessionId: snapshot.session.id,
                      workspaceId: snapshot.workspace.id,
                      runId,
                    });
                  }, { busy: false });
                }}
                onModelChange={(model: ModelSummary) => {
                  const previous = snapshot.model;
                  optimisticSnapshotCommand(
                    (current) => ({ ...current, model }),
                    (current) => {
                      if (previous) {
                        return { ...current, model: previous };
                      }
                      const next = { ...current };
                      delete next.model;
                      return next;
                    },
                    () =>
                      getDesktopBridge().setSessionModel({
                        sessionId: snapshot.session.id,
                        workspaceId: snapshot.workspace.id,
                        provider: model.provider,
                        id: model.id,
                      }),
                  );
                }}
                onThinkingChange={(level: ThinkingLevel) => {
                  const previous = snapshot.thinkingLevel;
                  optimisticSnapshotCommand(
                    (current) => ({ ...current, thinkingLevel: level }),
                    (current) => ({ ...current, thinkingLevel: previous }),
                    () =>
                      getDesktopBridge().setThinkingLevel({
                        sessionId: snapshot.session.id,
                        workspaceId: snapshot.workspace.id,
                        level,
                      }),
                  );
                }}
                onSessionModeChange={(mode) => {
                  void onSetSessionMode(mode);
                }}
              />
        ) : (
          <WorkspacePicker
            recents={bootstrap.recentWorkspaces}
            sessionsByWorkspace={sessionsByWorkspace}
            appName={bootstrap.appName}
            appVersion={bootstrap.appVersion}
            busy={busy}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleSidebar}
            notice={trustNotice}
            onPick={pickAndAdoptWorkspace}
            onOpenRecent={(workspaceId: string) => {
              void runCommand(() => openRecentAndAdopt(workspaceId));
            }}
            onNewSession={startNewSession}
            onOpenSession={openSessionEntry}
          />
        )}
      </div>
      {snapshot || chatLoading ? (
        <RightSidebar
          collapsed={rightSidebarCollapsed}
          surface={rightSidebarSurface}
          contextPromptCustomized={snapshot?.contextPrompt?.customized === true}
          planDocumentPresent={planDocumentPresent}
          onToggleCollapsed={toggleRightSidebar}
          onSelectSurface={selectRightSurface}
        >
          {rightSidebarPanel}
        </RightSidebar>
      ) : null}
      </div>
      {settingsVisible && conversation.settings ? (
        <SettingsView
          settings={conversation.settings}
          running={snapshot?.run.status === "admitted" || snapshot?.run.status === "streaming"}
          busy={busy}
          providerAccounts={providerAccounts}
          authFlow={conversation.authFlow ?? providerAccounts.flow}
          projects={projects}
          sessionsByWorkspace={sessionsByWorkspace}
          onClose={() => setSettingsOpen(false)}
          onAppearanceChange={(input: UpdateAppearanceSettingsInput) => {
            applySettingsCommand(() => getDesktopBridge().updateAppearanceSettings(input), { busy: false });
          }}
          onPermissionApply={async (input: UpdatePermissionSettingsInput) => {
            await runCommand(async () => {
              const next = await getDesktopBridge().updatePermissionSettings(input);
              applySettings(next);
            });
          }}
          onTrustProjectPermissionRules={async () => {
            setTrustDialogOpen(true);
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
          onRestoreArchived={(workspaceId, sessionId) => {
            void runCommand(
              async () => {
                await getDesktopBridge().restoreSession({ workspaceId, sessionId });
                await refreshCatalog(workspaceId);
              },
              { busy: false },
            );
          }}
          onOpenArchived={(workspaceId, sessionId) => {
            void runCommand(async () => {
              await getDesktopBridge().restoreSession({ workspaceId, sessionId });
              await refreshCatalog(workspaceId);
              setSettingsOpen(false);
              await switchSession(workspaceId, sessionId, () =>
                getDesktopBridge().openSession({ workspaceId, sessionId }),
              );
            });
          }}
          onRemoveSession={requestRemoveSession}
          onRemoveAllArchived={requestRemoveAllArchived}
          onSkillSourceChange={(input: UpdateSkillSourceSettingsInput) => {
            applySettingsCommand(() => getDesktopBridge().updateSkillSourceSettings(input));
          }}
          onRefreshSkills={() => {
            void runCommand(async () => {
              patchSettings({ skills: await getDesktopBridge().refreshSkills() });
            });
          }}
          onGitHubMcpChange={(input) => {
            applySettingsCommand(() => getDesktopBridge().updateGitHubMcpSettings(input));
          }}
          onImportGitHubPat={async (input) => {
            await runCommand(async () => {
              const result = await getDesktopBridge().importGitHubPat(input);
              patchSettings({ githubMcp: result.githubMcp });
            });
          }}
          onRemoveGitHubPat={() => {
            void runCommand(async () => {
              patchSettings({ githubMcp: await getDesktopBridge().removeGitHubPat() });
            });
          }}
          onSandboxChange={(input) => {
            applySettingsCommand(() => getDesktopBridge().updateSandboxSettings(input));
          }}
        />
      ) : null}
      {trustDialogOpen && trustWorkspace ? (
        <ProjectTrustDialog
          workspaceName={trustWorkspace.displayName}
          workspacePath={trustWorkspace.path}
          sessionTrusted={conversation.settings?.permission.projectPermissionRulesTrusted === true}
          busy={
            busy || snapshot?.run.status === "admitted" || snapshot?.run.status === "streaming"
          }
          onCancel={() => {
            setTrustDialogDismissedIds((current) => addWorkspaceId(current, trustWorkspace.id));
            setTrustDialogOpen(false);
          }}
          onConfirm={() => {
            void runCommand(async () => {
              const next = await getDesktopBridge().trustProjectPermissionRules();
              applySettings(next);
              await refreshBootstrap();
              clearSelectedNotification();
              setTrustDialogOpen(false);
            });
          }}
        />
      ) : null}
      {pendingRemoval ? (
        <RemoveSessionDialog
          pending={pendingRemoval}
          busy={busy}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => {
            const prepared = pendingRemoval;
            void runCommand(async () => {
              await getDesktopBridge().removeSession({
                workspaceId: prepared.workspaceId,
                sessionId: prepared.sessionId,
                confirmationToken: prepared.confirmationToken,
              });
              setPendingRemoval(null);
              const entries = await refreshCatalog(prepared.workspaceId);
              leaveSessionIfCurrent(prepared.workspaceId, prepared.sessionId, entries);
            });
          }}
        />
      ) : null}
      {pendingArchivedRemoval ? (
        <RemoveArchivedSessionsDialog
          pending={pendingArchivedRemoval}
          busy={busy}
          onCancel={() => setPendingArchivedRemoval(null)}
          onConfirm={() => {
            const prepared = pendingArchivedRemoval;
            void runCommand(async () => {
              await getDesktopBridge().removeArchivedSessions({
                workspaceId: prepared.workspaceId,
                confirmationToken: prepared.confirmationToken,
              });
              setPendingArchivedRemoval(null);
              await refreshCatalog(prepared.workspaceId);
            });
          }}
        />
      ) : null}
      {pendingProjectRemoval ? (
        <RemoveProjectDialog
          pending={pendingProjectRemoval}
          busy={busy}
          onCancel={() => setPendingProjectRemoval(null)}
          onConfirm={() => {
            const prepared = pendingProjectRemoval;
            void runCommand(async () => {
              const removed = await getDesktopBridge().removeProject({
                workspaceId: prepared.workspaceId,
                confirmationToken: prepared.confirmationToken,
              });
              setPendingProjectRemoval(null);
              setSessionsByWorkspace((current) => {
                const next = { ...current };
                delete next[prepared.workspaceId];
                return next;
              });
              setBootstrap((current) =>
                current ? { ...current, recentWorkspaces: removed.recentWorkspaces } : current,
              );
              const wasOpen =
                snapshot?.workspace.id === prepared.workspaceId || workspace?.workspace.id === prepared.workspaceId;
              if (!wasOpen) {
                await refreshBootstrap();
                return;
              }
              const nextProject = removed.recentWorkspaces[0];
              if (!nextProject) {
                setWorkspace(null);
                setDraft("");
                setPreparedImages([]);
                resetConversationChrome();
                await refreshBootstrap();
                return;
              }
              await openRecentAndAdopt(nextProject.id);
            });
          }}
        />
      ) : null}
      {conversation.notification && !looksLikeProjectTrustNotification(conversation.notification.message) ? (
        <NotificationToast
          notification={conversation.notification}
          onDismiss={clearSelectedNotification}
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

function addWorkspaceId(current: ReadonlySet<string>, workspaceId: string): ReadonlySet<string> {
  if (current.has(workspaceId)) {
    return current;
  }
  const next = new Set(current);
  next.add(workspaceId);
  return next;
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

function selectedConversation(cache: ConversationCacheState): ConversationViewState {
  const selected = cache.selectedKey ? cache.byKey[cache.selectedKey] : undefined;
  return {
    ...(selected ?? emptyConversationState()),
    settings: cache.settings ?? selected?.settings ?? null,
    authFlow: cache.authFlow ?? selected?.authFlow ?? null,
  };
}

function selectedCachedSnapshot(cache: ConversationCacheState): SessionSnapshot | undefined {
  return cache.selectedKey ? (cache.byKey[cache.selectedKey]?.snapshot ?? undefined) : undefined;
}
