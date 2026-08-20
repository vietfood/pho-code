import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  emptyConversationCache,
  mergeLiveRun,
  sessionKeyId,
  type ConversationCacheState,
  type PreparedImageSummary,
  type SessionSnapshot,
  type SessionSummary,
  type WorkspaceSnapshot,
} from "@pho-code/protocol";
import { getLiveRunForKey, replaceLiveRun, resetLiveRunStore, selectLiveRunKey } from "@pho-code/ui";

export type PendingSession = {
  workspaceId: string;
  sessionId: string | null;
};

type ComposerChrome = {
  draft: string;
  images: PreparedImageSummary[];
};

export function useSessionSwitch(options: {
  cache: ConversationCacheState;
  setCache: Dispatch<SetStateAction<ConversationCacheState>>;
  setWorkspace: Dispatch<SetStateAction<WorkspaceSnapshot | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  upsertCatalog: (session: SessionSummary) => void;
  errorMessage: (cause: unknown) => string;
}): {
  pendingSession: PendingSession | null;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  preparedImages: PreparedImageSummary[];
  setPreparedImages: Dispatch<SetStateAction<PreparedImageSummary[]>>;
  switchSession: (
    workspaceId: string,
    sessionId: string | null,
    action: () => Promise<SessionSnapshot>,
  ) => Promise<void>;
  clearSelectedSession: () => void;
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
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);
  const [draft, setDraft] = useState("");
  const [preparedImages, setPreparedImages] = useState<PreparedImageSummary[]>([]);
  const composersRef = useRef<Record<string, ComposerChrome>>({});
  const switchGen = useRef(0);
  const pendingRef = useRef(pendingSession);
  pendingRef.current = pendingSession;
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const imagesRef = useRef(preparedImages);
  imagesRef.current = preparedImages;
  const upsertCatalogRef = useRef(upsertCatalog);
  upsertCatalogRef.current = upsertCatalog;

  const saveComposer = useCallback((key: string | null): void => {
    if (!key) {
      return;
    }
    composersRef.current[key] = { draft: draftRef.current, images: imagesRef.current };
  }, []);

  const restoreComposer = useCallback((key: string | null): void => {
    if (!key) {
      setDraft("");
      setPreparedImages([]);
      return;
    }
    const stored = composersRef.current[key];
    setDraft(stored?.draft ?? "");
    setPreparedImages(stored?.images ?? []);
  }, []);

  const putSnapshot = useCallback(
    (snapshot: SessionSnapshot, select: boolean): void => {
      const key = sessionKeyId({ workspaceId: snapshot.workspace.id, sessionId: snapshot.session.id });
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

  const resetConversationChrome = useCallback((): void => {
    resetLiveRunStore();
    setCache((current) => ({
      ...emptyConversationCache(),
      settings: current.settings,
      authFlow: current.authFlow,
    }));
  }, [setCache]);

  const clearSelectedSession = useCallback((): void => {
    const currentKey = cacheRef.current.selectedKey;
    if (!currentKey && pendingRef.current === null) {
      return;
    }
    saveComposer(currentKey);
    switchGen.current += 1;
    setPendingSession(null);
    setError(null);
    selectLiveRunKey(undefined);
    setCache((current) => ({ ...current, selectedKey: null }));
    restoreComposer(null);
  }, [restoreComposer, saveComposer, setCache, setError]);

  const switchSession = useCallback(
    async (
      workspaceId: string,
      sessionId: string | null,
      action: () => Promise<SessionSnapshot>,
    ): Promise<void> => {
      const currentKey = cacheRef.current.selectedKey;
      if (
        !sessionId &&
        pendingRef.current?.sessionId === null &&
        pendingRef.current.workspaceId === workspaceId
      ) {
        return;
      }
      if (sessionId) {
        const nextKey = sessionKeyId({ workspaceId, sessionId });
        const pending = pendingRef.current;
        if (nextKey === currentKey && pending === null) {
          return;
        }
        if (pending?.workspaceId === workspaceId && pending.sessionId === sessionId) {
          return;
        }
      }
      const gen = ++switchGen.current;
      saveComposer(currentKey);
      setPendingSession({ workspaceId, sessionId });
      setError(null);
      setSettingsOpen(false);

      const nextKey = sessionId ? sessionKeyId({ workspaceId, sessionId }) : null;
      const cached = nextKey ? cacheRef.current.byKey[nextKey] : undefined;
      const hadCache = Boolean(cached?.snapshot);

      if (nextKey && cached?.snapshot) {
        const merged = mergeLiveRun(getLiveRunForKey(nextKey), cached.snapshot.run);
        replaceLiveRun(merged, { immediate: true, key: nextKey });
        selectLiveRunKey(nextKey);
        setCache((current) => {
          const existing = current.byKey[nextKey];
          if (!existing?.snapshot) {
            return current;
          }
          return {
            ...current,
            selectedKey: nextKey,
            byKey: {
              ...current.byKey,
              [nextKey]: {
                ...existing,
                snapshot: { ...existing.snapshot, run: merged },
              },
            },
          };
        });
        restoreComposer(nextKey);
      } else if (nextKey) {
        restoreComposer(nextKey);
      } else {
        restoreComposer(null);
      }

      try {
        const opened = await action();
        putSnapshot(opened, gen === switchGen.current);
        if (gen !== switchGen.current) {
          return;
        }
        if (!hadCache) {
          restoreComposer(sessionKeyId({ workspaceId: opened.workspace.id, sessionId: opened.session.id }));
        }
        setPendingSession(null);
      } catch (cause) {
        if (gen !== switchGen.current) {
          return;
        }
        setError(errorMessage(cause));
        setPendingSession(null);
        setCache((current) => ({ ...current, selectedKey: currentKey }));
        restoreComposer(currentKey);
        if (currentKey) {
          selectLiveRunKey(currentKey);
        } else {
          selectLiveRunKey(undefined);
        }
      }
    },
    [errorMessage, putSnapshot, restoreComposer, saveComposer, setCache, setError, setSettingsOpen],
  );

  return {
    pendingSession,
    draft,
    setDraft,
    preparedImages,
    setPreparedImages,
    switchSession,
    clearSelectedSession,
    resetConversationChrome,
  };
}
