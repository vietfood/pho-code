import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { FileFinder, type FileFinder as FileFinderInstance, type GrepMatch } from "@ff-labs/fff-node";
import type {
  LocalRetrievalStatus,
  PathSuggestion,
  SearchWorkspaceReferencesInput,
  SearchWorkspaceReferencesResult,
  WorkspaceReferenceKind,
} from "@pho-code/protocol";
import {
  DEFAULT_WORKSPACE_REFERENCE_LIMIT,
  MAX_WORKSPACE_REFERENCE_QUERY,
  MAX_WORKSPACE_REFERENCE_RESULTS,
} from "@pho-code/protocol";
import { isPathInside } from "./path-containment";
import { isSensitiveWorkspaceRelative, toPosixRelative } from "./workspace-reference";

const SCAN_TIMEOUT_MS = 15_000;
const DEFAULT_FIND_LIMIT = 30;
const DEFAULT_GREP_LIMIT = 20;
const MAX_TOOL_RESULTS = 100;
const MAX_CONTEXT_LINES = 5;
const MAX_OUTPUT_BYTES = 200 * 1024;
const GREP_TIME_BUDGET_MS = 5_000;

export interface LocalRetrievalRuntime {
  bind(workspacePath: string): Promise<void>;
  unbind(workspacePath: string): Promise<void>;
  runWithWorkspace<T>(workspacePath: string, fn: () => Promise<T>): Promise<T>;
  searchPaths(input: SearchWorkspaceReferencesInput & { workspacePath?: string }): Promise<SearchWorkspaceReferencesResult>;
  find(input: { pattern: string; path?: string; limit?: number; signal?: AbortSignal }): Promise<string>;
  grep(input: {
    pattern: string;
    path?: string;
    glob?: string;
    ignoreCase?: boolean;
    literal?: boolean;
    context?: number;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<string>;
  getSnapshot(workspacePath?: string): { status: LocalRetrievalStatus; storageDir?: string; diagnostic?: string };
  diagnostics(): Array<{ type: "warning" | "error"; message: string; path: string }>;
  dispose(): Promise<void>;
}

interface WorkspaceRetrievalContext {
  workspacePath: string;
  finder?: FileFinderInstance;
  storageDir?: string;
  status: LocalRetrievalStatus;
  diagnostic?: string;
}

export function createLocalRetrievalRuntime(options: { dataDir: string; persistRankingData?: boolean }): LocalRetrievalRuntime {
  const contexts = new Map<string, WorkspaceRetrievalContext>();
  const workspaceAls = new AsyncLocalStorage<string>();

  function canonicalKey(workspacePath: string): string {
    return path.resolve(workspacePath);
  }

  function contextFor(workspacePath: string | undefined): WorkspaceRetrievalContext | undefined {
    if (workspacePath) {
      return contexts.get(canonicalKey(workspacePath));
    }
    const fromAls = workspaceAls.getStore();
    if (fromAls) {
      return contexts.get(fromAls);
    }
    if (contexts.size === 1) {
      return contexts.values().next().value;
    }
    return undefined;
  }

  function requireContext(workspacePath?: string): WorkspaceRetrievalContext {
    const context = contextFor(workspacePath);
    if (!context) {
      throw new Error("Local retrieval is not available for this workspace.");
    }
    return context;
  }

  async function ensureFinder(context: WorkspaceRetrievalContext): Promise<FileFinderInstance> {
    if (!context.finder || context.finder.isDestroyed) {
      throw new Error(context.diagnostic ?? "Local retrieval is not available for this workspace.");
    }
    return context.finder;
  }

  function destroyContext(context: WorkspaceRetrievalContext): void {
    if (context.finder && !context.finder.isDestroyed) {
      context.finder.destroy();
    }
    context.finder = undefined;
    context.status = "unavailable";
  }

  return {
    async bind(nextWorkspacePath) {
      const canonical = canonicalKey(nextWorkspacePath);
      const existing = contexts.get(canonical);
      if (existing?.finder && !existing.finder.isDestroyed) {
        return;
      }
      const context: WorkspaceRetrievalContext = existing ?? {
        workspacePath: canonical,
        status: "indexing",
      };
      destroyContext(context);
      context.storageDir = path.join(options.dataDir, workspaceStorageId(canonical));
      mkdirSync(context.storageDir, { recursive: true });
      context.status = "indexing";
      context.diagnostic = undefined;
      const created = FileFinder.create({
        basePath: canonical,
        ...(options.persistRankingData === false
          ? {}
          : {
              frecencyDbPath: path.join(context.storageDir, "frecency.mdb"),
              historyDbPath: path.join(context.storageDir, "history.mdb"),
            }),
        aiMode: true,
        enableFsRootScanning: false,
        enableHomeDirScanning: false,
        followSymlinks: false,
      });
      if (!created.ok) {
        context.status = "unavailable";
        context.diagnostic = created.error;
        contexts.set(canonical, context);
        return;
      }
      context.finder = created.value;
      const scanned = await context.finder.waitForScan(SCAN_TIMEOUT_MS);
      if (!scanned.ok) {
        context.status = "unavailable";
        context.diagnostic = scanned.error;
        destroyContext(context);
        contexts.set(canonical, context);
        return;
      }
      context.status = scanned.value ? "ready" : "indexing";
      contexts.set(canonical, context);
    },
    async unbind(workspacePath) {
      const canonical = canonicalKey(workspacePath);
      const context = contexts.get(canonical);
      if (!context) {
        return;
      }
      destroyContext(context);
      contexts.delete(canonical);
    },
    runWithWorkspace(workspacePath, fn) {
      return workspaceAls.run(canonicalKey(workspacePath), fn);
    },
    async searchPaths(input) {
      const context = contextFor(input.workspacePath);
      if (!context?.finder || context.finder.isDestroyed) {
        return unavailableResult(context?.diagnostic);
      }
      const query = input.query.trim().slice(0, MAX_WORKSPACE_REFERENCE_QUERY);
      const limit = clampLimit(input.limit, DEFAULT_WORKSPACE_REFERENCE_LIMIT);
      const kinds = new Set(input.kinds && input.kinds.length > 0 ? input.kinds : ["file", "folder"]);
      const result = context.finder.mixedSearch(query, {
        pageSize: Math.min(limit * 2, MAX_WORKSPACE_REFERENCE_RESULTS * 2),
      });
      if (!result.ok) {
        return { suggestions: [], status: context.status, diagnostic: result.error };
      }
      const suggestions: PathSuggestion[] = [];
      for (const entry of result.value.items) {
        const suggestion = toSuggestion(entry);
        if (!suggestion || !kinds.has(suggestion.kind) || isSensitiveWorkspaceRelative(suggestion.path)) {
          continue;
        }
        suggestions.push(suggestion);
        if (suggestions.length >= limit) {
          break;
        }
      }
      return { suggestions, status: context.status };
    },
    async find(input) {
      throwIfAborted(input.signal);
      const context = requireContext();
      const current = await ensureFinder(context);
      const scope = await resolveScope(context.workspacePath, input.path, "directory");
      const limit = clampLimit(input.limit, DEFAULT_FIND_LIMIT, MAX_TOOL_RESULTS);
      let items = findFiles(current, input.pattern, limit, (relative) => matchesScope(relative, scope));
      if (items.length === 0 && scope.relative) {
        items = await withScopedFinder(scope.absolute, input.signal, (finder) =>
          findFiles(finder, input.pattern, limit, () => true).map((relative) => joinPosix(scope.relative, relative)),
        );
      }
      throwIfAborted(input.signal);
      return boundedOutput(items.length > 0 ? items.join("\n") : "No files found");
    },
    async grep(input) {
      throwIfAborted(input.signal);
      const context = requireContext();
      const current = await ensureFinder(context);
      const scope = await resolveScope(context.workspacePath, input.path, "file-or-directory");
      const limit = clampLimit(input.limit, DEFAULT_GREP_LIMIT, MAX_TOOL_RESULTS);
      const contextLines = clampNonNegative(input.context, MAX_CONTEXT_LINES);
      const query = grepQuery(input.pattern, input.ignoreCase === true, input.literal === true);
      const accepts = (relative: string) => matchesScope(relative, scope) && matchesGlob(relative, input.glob);
      let items = grepFiles(current, query, contextLines, limit, accepts);
      if (items.length === 0 && scope.relative) {
        items = await withScopedFinder(scope.basePath, input.signal, (finder) =>
          grepFiles(finder, query, contextLines, limit, (relative) => {
            const workspaceRelative = joinPosix(scope.baseRelative, relative);
            return matchesScope(workspaceRelative, scope) && matchesGlob(workspaceRelative, input.glob);
          }).map((item) => ({ ...item, relativePath: joinPosix(scope.baseRelative, item.relativePath) })),
        );
      }
      throwIfAborted(input.signal);
      return boundedOutput(formatGrepOutput(items));
    },
    getSnapshot(workspacePath) {
      const context = contextFor(workspacePath);
      if (!context) {
        return { status: "unavailable" };
      }
      return {
        status: context.status,
        ...(context.storageDir ? { storageDir: context.storageDir } : {}),
        ...(context.diagnostic ? { diagnostic: context.diagnostic } : {}),
      };
    },
    diagnostics() {
      const items: Array<{ type: "warning" | "error"; message: string; path: string }> = [];
      for (const context of contexts.values()) {
        if (context.diagnostic) {
          items.push({
            type: context.status === "unavailable" ? "error" : "warning",
            message: context.diagnostic,
            path: "local-retrieval",
          });
        }
      }
      return items;
    },
    async dispose() {
      for (const context of contexts.values()) {
        destroyContext(context);
      }
      contexts.clear();
    },
  };
}

function workspaceStorageId(workspacePath: string): string {
  return createHash("sha256").update(workspacePath).digest("hex").slice(0, 32);
}

function clampLimit(value: number | undefined, fallback: number, max = MAX_WORKSPACE_REFERENCE_RESULTS): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(Math.floor(value), max));
}

function clampNonNegative(value: number | undefined, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(Math.floor(value), max));
}

function toSuggestion(entry: { type: "file" | "directory"; item: { relativePath: string } }): PathSuggestion | undefined {
  const relative = toPosixRelative(entry.item.relativePath);
  if (!relative) {
    return undefined;
  }
  const kind: WorkspaceReferenceKind = entry.type === "directory" ? "folder" : "file";
  return { path: relative, kind };
}

function formatGrepOutput(items: ReadonlyArray<GrepMatch>): string {
  if (items.length === 0) {
    return "No matches found";
  }
  const lines: string[] = [];
  let currentFile = "";
  for (const match of items) {
    const relative = toPosixRelative(match.relativePath);
    if (relative !== currentFile) {
      if (lines.length > 0) {
        lines.push("");
      }
      currentFile = relative;
      lines.push(relative);
    }
    const before = match.contextBefore ?? [];
    for (const [index, line] of before.entries()) {
      lines.push(` ${match.lineNumber - before.length + index}- ${truncateLine(line)}`);
    }
    lines.push(` ${match.lineNumber}: ${truncateLine(match.lineContent)}`);
    for (const [index, line] of (match.contextAfter ?? []).entries()) {
      lines.push(` ${match.lineNumber + index + 1}- ${truncateLine(line)}`);
    }
  }
  return lines.join("\n");
}

function truncateLine(line: string, max = 500): string {
  const trimmed = line.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}...`;
}

interface SearchScope {
  absolute: string;
  relative: string;
  basePath: string;
  baseRelative: string;
  kind: "file" | "directory";
}

async function resolveScope(
  workspacePath: string,
  requestedPath: string | undefined,
  expected: "directory" | "file-or-directory",
): Promise<SearchScope> {
  const trimmed = requestedPath?.trim();
  const workspaceCanonical = await realpath(workspacePath);
  if (!trimmed || trimmed === "." || trimmed === "./") {
    return {
      absolute: workspaceCanonical,
      relative: "",
      basePath: workspaceCanonical,
      baseRelative: "",
      kind: "directory",
    };
  }
  if (path.isAbsolute(trimmed)) {
    throw new Error("Path must be relative to the workspace.");
  }
  const candidate = path.resolve(workspacePath, trimmed);
  if (candidate !== workspacePath && !isPathInside(workspacePath, candidate)) {
    throw new Error("Path must stay inside the workspace.");
  }
  let canonical: string;
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    [canonical, info] = await Promise.all([realpath(candidate), stat(candidate)]);
  } catch {
    throw new Error(`Path not found: ${trimmed}`);
  }
  if (canonical !== workspaceCanonical && !isPathInside(workspaceCanonical, canonical)) {
    throw new Error("Path must stay inside the workspace.");
  }
  const kind = info.isDirectory() ? "directory" : "file";
  if (expected === "directory" && kind !== "directory") {
    throw new Error(`Path is not a directory: ${trimmed}`);
  }
  const relative = toPosixRelative(path.relative(workspaceCanonical, canonical));
  const basePath = kind === "directory" ? canonical : path.dirname(canonical);
  const baseRelative = toPosixRelative(path.relative(workspaceCanonical, basePath));
  return { absolute: canonical, relative, basePath, baseRelative, kind };
}

function matchesScope(relativePath: string, scope: SearchScope): boolean {
  if (!scope.relative) {
    return true;
  }
  const relative = toPosixRelative(relativePath);
  return scope.kind === "file" ? relative === scope.relative : relative.startsWith(`${scope.relative}/`);
}

function matchesGlob(relativePath: string, glob: string | undefined): boolean {
  const pattern = glob?.trim();
  if (!pattern) {
    return true;
  }
  const relative = toPosixRelative(relativePath);
  return path.posix.matchesGlob(relative, pattern) || (!pattern.includes("/") && path.posix.matchesGlob(path.posix.basename(relative), pattern));
}

function findFiles(
  finder: FileFinderInstance,
  pattern: string,
  limit: number,
  accepts: (relativePath: string) => boolean,
): string[] {
  const query = pattern.trim();
  if (!query) {
    throw new Error("A file pattern is required.");
  }
  const useGlob = /[*?{}[\]]/u.test(query);
  const globQuery = useGlob && !query.includes("/") ? `**/${query}` : query;
  const results: string[] = [];
  for (let pageIndex = 0; pageIndex < 20 && results.length < limit; pageIndex += 1) {
    const result = useGlob
      ? finder.glob(globQuery, { pageIndex, pageSize: MAX_TOOL_RESULTS })
      : finder.fileSearch(query, { pageIndex, pageSize: MAX_TOOL_RESULTS });
    if (!result.ok) {
      throw new Error(result.error);
    }
    for (const item of result.value.items) {
      const relative = toPosixRelative(item.relativePath);
      if (accepts(relative)) {
        results.push(relative);
        if (results.length >= limit) break;
      }
    }
    if (result.value.items.length < MAX_TOOL_RESULTS) break;
  }
  return results;
}

function grepQuery(pattern: string, ignoreCase: boolean, literal: boolean): { text: string; mode: "plain" | "regex" } {
  if (!pattern) {
    throw new Error("A search pattern is required.");
  }
  if (!ignoreCase) {
    return { text: pattern, mode: literal ? "plain" : "regex" };
  }
  const expression = literal ? pattern.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&") : pattern;
  return { text: `(?i)${expression}`, mode: "regex" };
}

function grepFiles(
  finder: FileFinderInstance,
  query: { text: string; mode: "plain" | "regex" },
  context: number,
  limit: number,
  accepts: (relativePath: string) => boolean,
): GrepMatch[] {
  const startedAt = Date.now();
  const items: GrepMatch[] = [];
  let cursor = null;
  for (let page = 0; page < 20 && items.length < limit; page += 1) {
    const result = finder.grep(query.text, {
      mode: query.mode,
      smartCase: false,
      maxMatchesPerFile: limit,
      pageSize: MAX_TOOL_RESULTS,
      cursor,
      timeBudgetMs: Math.max(1, GREP_TIME_BUDGET_MS - (Date.now() - startedAt)),
      beforeContext: context,
      afterContext: context,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    if (result.value.regexFallbackError) {
      throw new Error(`Invalid regular expression: ${result.value.regexFallbackError}`);
    }
    for (const item of result.value.items) {
      if (accepts(toPosixRelative(item.relativePath))) {
        items.push(item);
        if (items.length >= limit) break;
      }
    }
    cursor = result.value.nextCursor;
    if (!cursor || Date.now() - startedAt >= GREP_TIME_BUDGET_MS) break;
  }
  return items;
}

async function withScopedFinder<T>(basePath: string, signal: AbortSignal | undefined, run: (finder: FileFinderInstance) => T): Promise<T> {
  throwIfAborted(signal);
  const created = FileFinder.create({
    basePath,
    aiMode: true,
    disableWatch: true,
    enableFsRootScanning: false,
    enableHomeDirScanning: false,
    followSymlinks: false,
  });
  if (!created.ok) {
    throw new Error(created.error);
  }
  try {
    const scanned = await created.value.waitForScan(SCAN_TIMEOUT_MS);
    if (!scanned.ok) throw new Error(scanned.error);
    if (!scanned.value) throw new Error("Local retrieval scan timed out.");
    throwIfAborted(signal);
    return run(created.value);
  } finally {
    created.value.destroy();
  }
}

function joinPosix(prefix: string, relative: string): string {
  return prefix ? path.posix.join(prefix, toPosixRelative(relative)) : toPosixRelative(relative);
}

function boundedOutput(value: string): string {
  if (Buffer.byteLength(value, "utf8") <= MAX_OUTPUT_BYTES) {
    return value;
  }
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(value.slice(0, middle), "utf8") <= MAX_OUTPUT_BYTES - 64) low = middle;
    else high = middle - 1;
  }
  return `${value.slice(0, low)}\n[Truncated: 200KB output limit]`;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("Operation aborted");
  }
}

function unavailableResult(diagnostic: string | undefined): SearchWorkspaceReferencesResult {
  return {
    suggestions: [],
    status: "unavailable",
    diagnostic: diagnostic ?? "Local retrieval is not ready.",
  };
}
