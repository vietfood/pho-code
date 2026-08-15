import { useCallback, useEffect, useRef, useState } from "react";
import {
  changeScopeEquals,
  isHarnessError,
  type ChangeDiffPage,
  type ChangeReviewSetSnapshot,
  type ChangeScope,
  type ConversationCacheState,
  type UndoPreview,
} from "@pho-code/protocol";
import { firstSelectablePath } from "@pho-code/ui";
import { getDesktopBridge } from "./bridge";

export function useChangeReview(cache: ConversationCacheState) {
  const [scope, setScope] = useState<ChangeScope | null>(null);
  const [review, setReview] = useState<ChangeReviewSetSnapshot | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [diff, setDiff] = useState<ChangeDiffPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoPreview, setUndoPreview] = useState<UndoPreview | null>(null);
  const generationRef = useRef(0);
  const scopeRef = useRef<ChangeScope | null>(null);
  const selectedPathRef = useRef<string | null>(null);
  const reloadRevisionRef = useRef<number | null>(null);

  selectedPathRef.current = selectedPath;

  const isCurrent = useCallback((generation: number, nextScope: ChangeScope) => {
    return (
      generation === generationRef.current &&
      scopeRef.current !== null &&
      changeScopeEquals(scopeRef.current, nextScope)
    );
  }, []);

  const loadDiff = useCallback(
    async (generation: number, nextScope: ChangeScope, relativePath: string, cursor?: string) => {
      const page = await getDesktopBridge().getChangeDiff({
        ...nextScope,
        relativePath,
        ...(cursor ? { cursor } : {}),
      });
      if (!isCurrent(generation, nextScope) || selectedPathRef.current !== relativePath) {
        return;
      }
      setDiff((current) => mergeDiffPage(current, page, cursor));
    },
    [isCurrent],
  );

  const open = useCallback(
    (nextScope: ChangeScope) => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      reloadRevisionRef.current = null;
      scopeRef.current = nextScope;
      setScope(nextScope);
      setError(null);
      setLoading(true);
      setDiff(null);
      setUndoPreview(null);
      void (async () => {
        try {
          const snapshot = await getDesktopBridge().getChangeReviewSet(nextScope);
          if (generation !== generationRef.current) {
            return;
          }
          setReview(snapshot);
          const path = firstSelectablePath(snapshot);
          setSelectedPath(path);
          selectedPathRef.current = path;
          if (path) {
            await loadDiff(generation, nextScope, path);
          }
        } catch (cause) {
          if (generation !== generationRef.current) {
            return;
          }
          setError(isHarnessError(cause) ? cause.message : "Unable to open the review set.");
        } finally {
          if (generation === generationRef.current) {
            setLoading(false);
          }
        }
      })();
    },
    [loadDiff],
  );

  const close = useCallback(() => {
    generationRef.current += 1;
    reloadRevisionRef.current = null;
    scopeRef.current = null;
    setScope(null);
    setReview(null);
    setSelectedPath(null);
    selectedPathRef.current = null;
    setDiff(null);
    setUndoPreview(null);
    setError(null);
  }, []);

  const selectPath = useCallback(
    (relativePath: string) => {
      if (!scope) {
        return;
      }
      const generation = generationRef.current;
      const nextScope = scope;
      setSelectedPath(relativePath);
      setUndoPreview(null);
      selectedPathRef.current = relativePath;
      setLoading(true);
      void (async () => {
        try {
          await loadDiff(generation, nextScope, relativePath);
        } catch (cause) {
          if (!isCurrent(generation, nextScope)) {
            return;
          }
          setError(isHarnessError(cause) ? cause.message : "Unable to load that file.");
        } finally {
          if (isCurrent(generation, nextScope) && selectedPathRef.current === relativePath) {
            setLoading(false);
          }
        }
      })();
    },
    [isCurrent, loadDiff, scope],
  );

  const approve = useCallback(
    async (relativePaths?: string[]) => {
      if (!scope || !review) {
        return;
      }
      const generation = generationRef.current;
      const nextScope = scope;
      setBusy(true);
      setUndoPreview(null);
      setError(null);
      try {
        const snapshot = await getDesktopBridge().approveChanges({
          ...nextScope,
          expectedRevision: review.revision,
          ...(relativePaths ? { relativePaths } : {}),
        });
        if (!isCurrent(generation, nextScope)) {
          return;
        }
        setReview(snapshot);
        const path = selectedPathRef.current;
        if (path) {
          await loadDiff(generation, nextScope, path);
        }
      } catch (cause) {
        if (!isCurrent(generation, nextScope)) {
          return;
        }
        setError(isHarnessError(cause) ? cause.message : "Approve failed.");
        try {
          const snapshot = await getDesktopBridge().getChangeReviewSet(nextScope);
          if (!isCurrent(generation, nextScope)) {
            return;
          }
          setReview(snapshot);
          const path = selectedPathRef.current;
          if (path) {
            await loadDiff(generation, nextScope, path);
          }
        } catch {
          // Keep the Approve error as the visible diagnostic.
        }
      } finally {
        if (isCurrent(generation, nextScope)) {
          setBusy(false);
        }
      }
    },
    [isCurrent, loadDiff, review, scope],
  );

  const loadMore = useCallback(() => {
    if (!scope || !selectedPath || !diff?.nextCursor) {
      return;
    }
    void loadDiff(generationRef.current, scope, selectedPath, diff.nextCursor);
  }, [diff?.nextCursor, loadDiff, scope, selectedPath]);

  const prepareUndo = useCallback(
    async (relativePath: string) => {
      if (!scope || !review) {
        return;
      }
      const generation = generationRef.current;
      const nextScope = scope;
      setBusy(true);
      setError(null);
      setUndoPreview(null);
      try {
        const preview = await getDesktopBridge().prepareUndoChanges({
          ...nextScope,
          relativePath,
          expectedRevision: review.revision,
        });
        if (isCurrent(generation, nextScope) && selectedPathRef.current === relativePath) {
          setUndoPreview(preview);
        }
      } catch (cause) {
        if (isCurrent(generation, nextScope)) {
          setError(isHarnessError(cause) ? cause.message : "Unable to prepare Undo.");
          const snapshot = await getDesktopBridge().getChangeReviewSet(nextScope).catch(() => null);
          if (snapshot && isCurrent(generation, nextScope)) {
            setReview(snapshot);
          }
        }
      } finally {
        if (isCurrent(generation, nextScope)) {
          setBusy(false);
        }
      }
    },
    [isCurrent, review, scope],
  );

  const applyUndo = useCallback(async () => {
    if (!scope || !undoPreview) {
      return;
    }
    const generation = generationRef.current;
    const nextScope = scope;
    const relativePath = undoPreview.relativePath;
    setBusy(true);
    setError(null);
    try {
      const snapshot = await getDesktopBridge().applyUndoChanges({
        ...nextScope,
        previewToken: undoPreview.previewToken,
      });
      if (!isCurrent(generation, nextScope)) {
        return;
      }
      setUndoPreview(null);
      setReview(snapshot);
      if (selectedPathRef.current === relativePath) {
        await loadDiff(generation, nextScope, relativePath);
      }
    } catch (cause) {
      if (!isCurrent(generation, nextScope)) {
        return;
      }
      setUndoPreview(null);
      setError(isHarnessError(cause) ? cause.message : "Undo failed.");
      const snapshot = await getDesktopBridge().getChangeReviewSet(nextScope).catch(() => null);
      if (snapshot && isCurrent(generation, nextScope)) {
        setReview(snapshot);
        if (selectedPathRef.current === relativePath) {
          await loadDiff(generation, nextScope, relativePath).catch(() => undefined);
        }
      }
    } finally {
      if (isCurrent(generation, nextScope)) {
        setBusy(false);
      }
    }
  }, [isCurrent, loadDiff, scope, undoPreview]);

  const cancelUndo = useCallback(() => {
    setUndoPreview(null);
  }, []);

  useEffect(() => {
    if (!scope) {
      return;
    }
    const cached = Object.values(cache.byKey).find((entry) => {
      const snapshot = entry.snapshot;
      return snapshot?.workspace.id === scope.workspaceId && snapshot.session.id === scope.sessionId;
    });
    const matching = cached?.snapshot?.changeReviews?.find((entry) => changeScopeEquals(entry, scope));
    if (!matching || matching.revision === review?.revision) {
      return;
    }
    if (reloadRevisionRef.current === matching.revision) {
      return;
    }
    reloadRevisionRef.current = matching.revision;
    setUndoPreview(null);
    const generation = generationRef.current;
    const nextScope = scope;
    setLoading(true);
    void (async () => {
      try {
        const snapshot = await getDesktopBridge().getChangeReviewSet(nextScope);
        if (!isCurrent(generation, nextScope)) {
          return;
        }
        setReview(snapshot);
        const path = selectedPathRef.current ?? firstSelectablePath(snapshot);
        if (path) {
          await loadDiff(generation, nextScope, path);
        } else {
          setDiff(null);
        }
      } catch (cause) {
        if (!isCurrent(generation, nextScope)) {
          return;
        }
        setError(isHarnessError(cause) ? cause.message : "Unable to refresh the review set.");
      } finally {
        if (isCurrent(generation, nextScope)) {
          setLoading(false);
        }
      }
    })();
  }, [cache.byKey, isCurrent, loadDiff, review?.revision, scope]);

  return {
    scope,
    review,
    selectedPath,
    diff,
    loading,
    busy,
    error,
    undoPreview,
    open,
    close,
    selectPath,
    approve,
    prepareUndo,
    applyUndo,
    cancelUndo,
    loadMore,
  };
}

function mergeDiffPage(current: ChangeDiffPage | null, page: ChangeDiffPage, cursor?: string): ChangeDiffPage {
  if (!cursor || !current) {
    return page;
  }
  if (/^hunk:\d+:line:/u.test(cursor) && current.hunks.length > 0 && page.hunks.length > 0) {
    const continued = page.hunks[0];
    const last = current.hunks[current.hunks.length - 1];
    if (continued && last && last.header === continued.header) {
      return {
        ...page,
        hunks: [
          ...current.hunks.slice(0, -1),
          { ...last, lines: [...last.lines, ...continued.lines] },
          ...page.hunks.slice(1),
        ],
      };
    }
  }
  return { ...page, hunks: [...current.hunks, ...page.hunks] };
}
