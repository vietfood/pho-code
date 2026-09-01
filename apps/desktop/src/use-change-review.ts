import { useCallback, useEffect, useRef, useState } from "react";
import {
  changeScopeEquals,
  DEFAULT_CHANGE_CONTEXT_LINES,
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
  const [contextLines, setContextLines] = useState(DEFAULT_CHANGE_CONTEXT_LINES);
  const [diffs, setDiffs] = useState<Record<string, ChangeDiffPage>>({});
  const fileLinesRef = useRef(new Map<string, readonly string[]>());
  const generationRef = useRef(0);
  const pendingDiffsRef = useRef(new Set<string>());
  const diffRef = useRef<ChangeDiffPage | null>(null);
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
    async (generation: number, nextScope: ChangeScope, relativePath: string, cursor?: string, nextContext = contextLines) => {
      const page = await getDesktopBridge().getChangeDiff({
        ...nextScope,
        relativePath,
        ...(cursor ? { cursor } : {}),
        contextLines: nextContext,
      });
      if (!isCurrent(generation, nextScope) || selectedPathRef.current !== relativePath) {
        return;
      }
      const next = cursor ? mergeDiffPage(diffRef.current, page, cursor) : page;
      diffRef.current = next;
      setDiff(next);
      setDiffs((cached) => ({ ...cached, [relativePath]: next }));
    },
    [contextLines, isCurrent],
  );

  const runLoadingTask = useCallback(
    (generation: number, nextScope: ChangeScope, fallback: string, task: () => Promise<void>, done?: () => boolean) => {
      setLoading(true);
      void (async () => {
        try {
          await task();
        } catch (cause) {
          if (isCurrent(generation, nextScope)) {
            setError(isHarnessError(cause) ? cause.message : fallback);
          }
        } finally {
          if (isCurrent(generation, nextScope) && (done?.() ?? true)) {
            setLoading(false);
          }
        }
      })();
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
      setDiff(null);
      diffRef.current = null;
      setDiffs({});
      fileLinesRef.current.clear();
      setUndoPreview(null);
      runLoadingTask(generation, nextScope, "Unable to open the review set.", async () => {
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
      });
    },
    [loadDiff, runLoadingTask],
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
    diffRef.current = null;
    setDiffs({});
    fileLinesRef.current.clear();
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
      runLoadingTask(
        generation,
        nextScope,
        "Unable to load that file.",
        () => loadDiff(generation, nextScope, relativePath),
        () => selectedPathRef.current === relativePath,
      );
    },
    [isCurrent, loadDiff, runLoadingTask, scope],
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
        setError(isHarnessError(cause) ? cause.message : "Mark reviewed failed.");
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
          // Keep the Mark reviewed error as the visible diagnostic.
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

  const changeContextLines = useCallback(
    (value: number) => {
      setContextLines(value);
      if (!scope || !selectedPath) {
        return;
      }
      const generation = generationRef.current;
      const nextScope = scope;
      const path = selectedPath;
      runLoadingTask(
        generation,
        nextScope,
        "Unable to load that file.",
        () => loadDiff(generation, nextScope, path, undefined, value),
        () => selectedPathRef.current === path,
      );
    },
    [isCurrent, loadDiff, runLoadingTask, scope, selectedPath],
  );

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

  const ensureDiff = useCallback(
    (relativePath: string) => {
      const nextScope = scopeRef.current;
      if (!nextScope || pendingDiffsRef.current.has(relativePath)) {
        return;
      }
      const generation = generationRef.current;
      pendingDiffsRef.current.add(relativePath);
      void getDesktopBridge()
        .getChangeDiff({ ...nextScope, relativePath, contextLines })
        .then((page) => {
          if (generation !== generationRef.current) {
            return;
          }
          setDiffs((cached) => ({ ...cached, [relativePath]: page }));
        })
        .catch((cause) => {
          if (generation === generationRef.current) {
            setError(isHarnessError(cause) ? cause.message : "Unable to load that file.");
          }
        })
        .finally(() => {
          pendingDiffsRef.current.delete(relativePath);
        });
    },
    [contextLines],
  );

  /** Current on-disk lines, used to expand collapsed runs inside a diff. */
  const requestFileLines = useCallback(async (relativePath: string): Promise<readonly string[] | null> => {
    const cached = fileLinesRef.current.get(relativePath);
    if (cached) {
      return cached;
    }
    const nextScope = scopeRef.current;
    if (!nextScope) {
      return null;
    }
    const page = await getDesktopBridge()
      .getChangeFileView({ ...nextScope, relativePath, version: "current" })
      .catch(() => null);
    if (!page?.text) {
      return null;
    }
    const lines = page.text.split("\n");
    fileLinesRef.current.set(relativePath, lines);
    return lines;
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
    setDiffs({});
    fileLinesRef.current.clear();
    const generation = generationRef.current;
    const nextScope = scope;
    runLoadingTask(generation, nextScope, "Unable to refresh the review set.", async () => {
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
        diffRef.current = null;
      }
    });
  }, [cache.byKey, isCurrent, loadDiff, review?.revision, runLoadingTask, scope]);

  return {
    scope,
    review,
    selectedPath,
    diff,
    loading,
    busy,
    error,
    undoPreview,
    contextLines,
    open,
    close,
    selectPath,
    diffs,
    ensureDiff,
    requestFileLines,
    approve,
    prepareUndo,
    applyUndo,
    cancelUndo,
    loadMore,
    setContextLines: changeContextLines,
  };
}

function mergeDiffPage(current: ChangeDiffPage | null, page: ChangeDiffPage, cursor?: string): ChangeDiffPage {
  if (!cursor || !current) {
    return page;
  }
  if (current.hunks.length === 0 || page.hunks.length === 0) {
    return { ...page, hunks: [...current.hunks, ...page.hunks] };
  }
  const continued = page.hunks[0];
  const last = current.hunks[current.hunks.length - 1];
  if (continued && last && last.header === continued.header) {
    const lastLine = last.lines[last.lines.length - 1];
    const firstLine = continued.lines[0];
    if (
      lastLine &&
      firstLine &&
      /:char:\d+$/u.test(cursor) &&
      lastLine.kind === firstLine.kind &&
      lastLine.beforeLine === firstLine.beforeLine &&
      lastLine.afterLine === firstLine.afterLine
    ) {
      return {
        ...page,
        hunks: [
          ...current.hunks.slice(0, -1),
          {
            ...last,
            lines: [
              ...last.lines.slice(0, -1),
              { ...lastLine, text: `${lastLine.text}${firstLine.text}` },
              ...continued.lines.slice(1),
            ],
          },
          ...page.hunks.slice(1),
        ],
      };
    }
    if (/^hunk:\d+:line:/u.test(cursor)) {
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
