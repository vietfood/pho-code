import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  emptyConversationCache,
  mergeLiveRun,
  parseSessionKeyId,
  sessionKeyId,
  type ConversationCacheState,
  type PreparedImageSummary,
  type SessionSnapshot,
  type SessionSummary,
  type WorkspaceSnapshot,
} from "@pho-code/protocol";
import {
  closeChatTab,
  emptyChatTabs,
  focusChatTab,
  isChatTabOpen,
  openChatTab,
  readChatTabs,
  replaceChatTabKey,
  writeChatTabs,
  getLiveRunForKey,
  replaceLiveRun,
  resetLiveRunStore,
  selectLiveRunKey,
  type ChatTabs,
} from "@pho-code/ui";
import { getDesktopBridge } from "./bridge";

export interface PendingTab {
  token: number;
  backendId?: string;
  workspaceId: string;
  sessionId: string | null;
}

export interface ComposerChrome {
  draft: string;
  images: PreparedImageSummary[];
}

export const EMPTY_COMPOSER: ComposerChrome = { draft: "", images: [] };

/**
 * Owns the main region's chat tab strip: the persisted open-tab list, per-tab
 * composer chrome, and per-tab loading state. The active tab is the
 * conversation cache's selectedKey, so the right-sidebar surfaces, dialogs,
 * and composer commands keep reading the active chat exactly as before.
 *
 * Every tab transition persists through `applyTabs`; activation changes sync
 * the live-run store selection and the workspace snapshot. Closing a tab is
 * view-only — the session keeps running and stays in the sidebar.
 */
export function useChatTabs(options: {
  cache: ConversationCacheState;
  setCache: Dispatch<SetStateAction<ConversationCacheState>>;
  setWorkspace: Dispatch<SetStateAction<WorkspaceSnapshot | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  upsertCatalog: (session: SessionSummary) => void;
  errorMessage: (cause: unknown) => string;
}): {
  chatTabs: ChatTabs;
  pendingByKey: Record<string, PendingTab>;
  composerFor: (key: string) => ComposerChrome;
  setComposerDraft: (key: string, value: string) => void;
  setComposerImages: (key: string, images: PreparedImageSummary[]) => void;
  /** Open-or-focus: a new tab appends and activates, an open tab activates. */
  openTab: (
    workspaceId: string,
    sessionId: string | null,
    action: () => Promise<SessionSnapshot>,
    backendId?: string,
  ) => Promise<void>;
  focusTab: (key: string) => void;
  closeTab: (key: string) => void;
  /** Home: closes every tab (view-only) and returns to the welcome launcher. */
  closeAllTabs: () => void;
  /** Archive/Trash: closes the session's tab; returns the post-close state. */
  closeSessionTab: (workspaceId: string, sessionId: string, backendId?: string) => ChatTabs | null;
  /** Project removal: closes every tab belonging to the workspace. */
  closeWorkspaceTabs: (workspaceId: string) => void;
  /** Bootstrap restore: the runtime's active session becomes the active tab. */
  reconcileActiveSession: (key: string) => void;
  /** Loads a restored tab whose snapshot is not cached yet. */
  ensureTabLoaded: (key: string) => void;
  resetConversationChrome: () => void;
} {
  const {
    cache,
    setCache,
    setWorkspace,
    setError,
    setSettingsOpen,
    upsertCatalog,
    errorMessage,
  } = options;
  const [tabs, setTabs] = useState<ChatTabs>(() => readChatTabs());
  const [pendingByKey, setPendingByKey] = useState<Record<string, PendingTab>>({});
  const [composers, setComposers] = useState<Record<string, ComposerChrome>>({});
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const pendingRef = useRef(pendingByKey);
  pendingRef.current = pendingByKey;
  const composersRef = useRef(composers);
  composersRef.current = composers;
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const tokenCounter = useRef(0);
  const pendingNewCounter = useRef(0);
  const upsertCatalogRef = useRef(upsertCatalog);
  upsertCatalogRef.current = upsertCatalog;

  const applyTabs = useCallback((next: ChatTabs) => {
    if (next === tabsRef.current) {
      return;
    }
    tabsRef.current = next;
    setTabs(next);
    writeChatTabs(next);
  }, []);

  const dropPending = useCallback((key: string) => {
    setPendingByKey((current) => {
      if (!(key in current)) {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const syncSelection = useCallback(
    (next: ChatTabs) => {
      const active = next.active;
      selectLiveRunKey(active ?? undefined);
      setCache((current) => (current.selectedKey === active ? current : { ...current, selectedKey: active }));
      if (active) {
        const snap = cacheRef.current.byKey[active]?.snapshot;
        if (snap) {
          setWorkspace({
            workspace: snap.workspace,
            sessions: snap.sessions,
            models: snap.models,
            features: snap.features,
            ...(snap.modelError ? { modelError: snap.modelError } : {}),
          });
        }
      }
    },
    [setCache, setWorkspace],
  );

  const putSnapshot = useCallback(
    (snapshot: SessionSnapshot, select: boolean): void => {
      const key = sessionKeyId({
        ...(snapshot.session.backendId ? { backendId: snapshot.session.backendId } : {}),
        workspaceId: snapshot.workspace.id,
        sessionId: snapshot.session.id,
      });
      const run = mergeLiveRun(getLiveRunForKey(key), snapshot.run);
      const nextSnapshot = { ...snapshot, run };
      replaceLiveRun(run, { immediate: true, key });
      if (select) {
        selectLiveRunKey(key);
      }
      setCache((current) => {
        const existing = current.byKey[key];
        return {
          ...current,
          ...(select ? { selectedKey: key } : {}),
          byKey: {
            ...current.byKey,
            [key]: {
              lastSequence: existing?.lastSequence ?? current.lastSequence,
              snapshot: nextSnapshot,
              dialog: existing?.dialog ?? null,
              approvalRequest: existing?.approvalRequest ?? null,
              notification: existing?.notification ?? null,
            },
          },
        };
      });
      if (select) {
        setWorkspace({
          workspace: snapshot.workspace,
          sessions: snapshot.sessions,
          models: snapshot.models,
          features: snapshot.features,
          ...(snapshot.modelError ? { modelError: snapshot.modelError } : {}),
        });
      }
      upsertCatalogRef.current(snapshot.session);
    },
    [setCache, setWorkspace],
  );

  const loadExistingTab = useCallback(
    async (
      key: string,
      ids: { workspaceId: string; sessionId: string; backendId?: string },
      action: () => Promise<SessionSnapshot>,
    ): Promise<void> => {
      const token = ++tokenCounter.current;
      setPendingByKey((current) => ({
        ...current,
        [key]: {
          token,
          workspaceId: ids.workspaceId,
          sessionId: ids.sessionId,
          ...(ids.backendId ? { backendId: ids.backendId } : {}),
        },
      }));
      try {
        const opened = await action();
        if (pendingRef.current[key]?.token !== token) {
          return;
        }
        dropPending(key);
        putSnapshot(opened, tabsRef.current.active === key);
      } catch (cause) {
        if (pendingRef.current[key]?.token !== token) {
          return;
        }
        dropPending(key);
        setError(errorMessage(cause));
        if (!cacheRef.current.byKey[key]?.snapshot) {
          const next = closeChatTab(tabsRef.current, key);
          applyTabs(next);
          syncSelection(next);
        }
      }
    },
    [applyTabs, dropPending, errorMessage, putSnapshot, setError, syncSelection],
  );

  const ensureTabLoaded = useCallback(
    (key: string) => {
      if (cacheRef.current.byKey[key]?.snapshot || pendingRef.current[key]) {
        return;
      }
      const parsed = parseSessionKeyId(key);
      if (!parsed) {
        return;
      }
      void loadExistingTab(key, parsed, () =>
        getDesktopBridge().openSession({
          ...(parsed.backendId ? { backendId: parsed.backendId } : {}),
          workspaceId: parsed.workspaceId,
          sessionId: parsed.sessionId,
        }),
      );
    },
    [loadExistingTab],
  );

  const openTab = useCallback(
    async (
      workspaceId: string,
      sessionId: string | null,
      action: () => Promise<SessionSnapshot>,
      backendId?: string,
    ): Promise<void> => {
      setError(null);
      setSettingsOpen(false);

      if (sessionId) {
        const key = sessionKeyId({ ...(backendId ? { backendId } : {}), workspaceId, sessionId });
        const current = tabsRef.current;
        if (isChatTabOpen(current, key)) {
          const next = focusChatTab(current, key);
          applyTabs(next);
          syncSelection(next);
          ensureTabLoaded(key);
          return;
        }
        const next = openChatTab(current, key);
        applyTabs(next);
        const cached = cacheRef.current.byKey[key];
        if (cached?.snapshot) {
          replaceLiveRun(mergeLiveRun(getLiveRunForKey(key), cached.snapshot.run), {
            immediate: true,
            key,
          });
        }
        syncSelection(next);
        await loadExistingTab(key, { workspaceId, sessionId, ...(backendId ? { backendId } : {}) }, action);
        return;
      }

      const pendingNew = Object.entries(pendingRef.current).find(
        ([, pending]) =>
          pending.sessionId === null &&
          pending.workspaceId === workspaceId &&
          (pending.backendId ?? "pi") === (backendId ?? "pi"),
      );
      if (pendingNew) {
        const next = focusChatTab(tabsRef.current, pendingNew[0]);
        applyTabs(next);
        syncSelection(next);
        return;
      }
      const tempKey = `pending-new-${++pendingNewCounter.current}`;
      const token = ++tokenCounter.current;
      const openedTabs = openChatTab(tabsRef.current, tempKey);
      applyTabs(openedTabs);
      setPendingByKey((current) => ({
        ...current,
        [tempKey]: { token, workspaceId, sessionId: null, ...(backendId ? { backendId } : {}) },
      }));
      syncSelection(openedTabs);
      try {
        const opened = await action();
        if (pendingRef.current[tempKey]?.token !== token) {
          return;
        }
        const realKey = sessionKeyId({
          ...(opened.session.backendId ? { backendId: opened.session.backendId } : {}),
          workspaceId: opened.workspace.id,
          sessionId: opened.session.id,
        });
        dropPending(tempKey);
        setComposers((current) => {
          const carried = current[tempKey];
          if (!carried) {
            return current;
          }
          const next = { ...current, [realKey]: carried };
          delete next[tempKey];
          return next;
        });
        const next = replaceChatTabKey(tabsRef.current, tempKey, realKey);
        applyTabs(next);
        putSnapshot(opened, next.active === realKey);
      } catch (cause) {
        if (pendingRef.current[tempKey]?.token !== token) {
          return;
        }
        dropPending(tempKey);
        setError(errorMessage(cause));
        const next = closeChatTab(tabsRef.current, tempKey);
        applyTabs(next);
        syncSelection(next);
      }
    },
    [applyTabs, dropPending, ensureTabLoaded, errorMessage, loadExistingTab, putSnapshot, setError, setSettingsOpen, syncSelection],
  );

  const focusTab = useCallback(
    (key: string) => {
      const next = focusChatTab(tabsRef.current, key);
      applyTabs(next);
      syncSelection(next);
      ensureTabLoaded(key);
    },
    [applyTabs, ensureTabLoaded, syncSelection],
  );

  const closeTab = useCallback(
    (key: string) => {
      const next = closeChatTab(tabsRef.current, key);
      if (next === tabsRef.current) {
        return;
      }
      applyTabs(next);
      dropPending(key);
      syncSelection(next);
    },
    [applyTabs, dropPending, syncSelection],
  );

  const closeAllTabs = useCallback(() => {
    applyTabs(emptyChatTabs());
    setPendingByKey({});
    selectLiveRunKey(undefined);
    setCache((current) => ({ ...current, selectedKey: null }));
  }, [applyTabs, setCache]);

  const closeSessionTab = useCallback(
    (workspaceId: string, sessionId: string, backendId?: string): ChatTabs | null => {
      const key = sessionKeyId({ ...(backendId ? { backendId } : {}), workspaceId, sessionId });
      if (!isChatTabOpen(tabsRef.current, key)) {
        return null;
      }
      const next = closeChatTab(tabsRef.current, key);
      applyTabs(next);
      dropPending(key);
      setComposers((current) => {
        if (!(key in current)) {
          return current;
        }
        const nextComposers = { ...current };
        delete nextComposers[key];
        return nextComposers;
      });
      syncSelection(next);
      return next;
    },
    [applyTabs, dropPending, syncSelection],
  );

  const closeWorkspaceTabs = useCallback(
    (workspaceId: string) => {
      let next = tabsRef.current;
      for (const key of next.tabs) {
        if (parseSessionKeyId(key)?.workspaceId === workspaceId) {
          next = closeChatTab(next, key);
          dropPending(key);
        }
      }
      if (next !== tabsRef.current) {
        applyTabs(next);
        syncSelection(next);
      }
    },
    [applyTabs, dropPending, syncSelection],
  );

  const reconcileActiveSession = useCallback(
    (key: string) => {
      const current = tabsRef.current;
      let next = current;
      if (!isChatTabOpen(next, key)) {
        next = openChatTab(next, key);
      }
      next = focusChatTab(next, key);
      if (next !== current) {
        applyTabs(next);
      }
    },
    [applyTabs],
  );

  const resetConversationChrome = useCallback((): void => {
    resetLiveRunStore();
    applyTabs(emptyChatTabs());
    setPendingByKey({});
    setComposers({});
    setCache((current) => ({
      ...emptyConversationCache(),
      settings: current.settings,
      authFlow: current.authFlow,
    }));
  }, [applyTabs, setCache]);

  const composerFor = useCallback((key: string): ComposerChrome => {
    return composersRef.current[key] ?? EMPTY_COMPOSER;
  }, []);

  const setComposerDraft = useCallback((key: string, value: string) => {
    setComposers((current) => ({
      ...current,
      [key]: { draft: value, images: current[key]?.images ?? [] },
    }));
  }, []);

  const setComposerImages = useCallback((key: string, images: PreparedImageSummary[]) => {
    setComposers((current) => ({
      ...current,
      [key]: { draft: current[key]?.draft ?? "", images },
    }));
  }, []);

  return {
    chatTabs: tabs,
    pendingByKey,
    composerFor,
    setComposerDraft,
    setComposerImages,
    openTab,
    focusTab,
    closeTab,
    closeAllTabs,
    closeSessionTab,
    closeWorkspaceTabs,
    reconcileActiveSession,
    ensureTabLoaded,
    resetConversationChrome,
  };
}
