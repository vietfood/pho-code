import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { FileFinder, type FileFinder as FileFinderInstance, type GrepCursor } from "@ff-labs/fff-node";
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
import { isSensitiveWorkspaceRelative, toPosixRelative } from "./workspace-reference";

const SCAN_TIMEOUT_MS = 15_000;
const DEFAULT_FIND_LIMIT = 30;
const DEFAULT_GREP_LIMIT = 20;

export interface LocalRetrievalRuntime {
  bind(workspacePath: string): Promise<void>;
  unbind(workspacePath: string): Promise<void>;
  runWithWorkspace<T>(workspacePath: string, fn: () => Promise<T>): Promise<T>;
  searchPaths(input: SearchWorkspaceReferencesInput & { workspacePath?: string }): Promise<SearchWorkspaceReferencesResult>;
  fileSearch(input: { pattern: string; path?: string; limit?: number }): Promise<string>;
  grep(input: {
    pattern: string;
    path?: string;
    context?: number;
    limit?: number;
    cursor?: string;
    caseSensitive?: boolean;
  }): Promise<string>;
  multiGrep(input: {
    patterns: readonly string[];
    constraints?: string;
    context?: number;
    limit?: number;
    cursor?: string;
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
  grepCursors: Map<string, GrepCursor>;
  cursorCounter: number;
}

export function createLocalRetrievalRuntime(options: { dataDir: string }): LocalRetrievalRuntime {
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
    context.grepCursors.clear();
    context.status = "unavailable";
  }

  function storeCursor(context: WorkspaceRetrievalContext, cursor: GrepCursor): string {
    const id = `fff_c${++context.cursorCounter}`;
    context.grepCursors.set(id, cursor);
    if (context.grepCursors.size > 50) {
      const first = context.grepCursors.keys().next().value;
      if (first) {
        context.grepCursors.delete(first);
      }
    }
    return id;
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
        grepCursors: new Map(),
        cursorCounter: 0,
      };
      destroyContext(context);
      context.storageDir = path.join(options.dataDir, workspaceStorageId(canonical));
      mkdirSync(context.storageDir, { recursive: true });
      context.status = "indexing";
      context.diagnostic = undefined;
      const created = FileFinder.create({
        basePath: canonical,
        frecencyDbPath: path.join(context.storageDir, "frecency.mdb"),
        historyDbPath: path.join(context.storageDir, "history.mdb"),
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
        if (!suggestion || !kinds.has(suggestion.kind)) {
          continue;
        }
        if (isSensitiveWorkspaceRelative(suggestion.path)) {
          continue;
        }
        suggestions.push(suggestion);
        if (suggestions.length >= limit) {
          break;
        }
      }
      return { suggestions, status: context.status };
    },
    async fileSearch(input) {
      const current = await ensureFinder(requireContext());
      const query = buildConstrainedQuery(input.path, input.pattern);
      const limit = clampLimit(input.limit, DEFAULT_FIND_LIMIT, 100);
      const result = current.fileSearch(query, { pageSize: limit });
      if (!result.ok) {
        throw new Error(result.error);
      }
      if (result.value.items.length === 0) {
        return "No files found";
      }
      return result.value.items.map((item) => toPosixRelative(item.relativePath)).join("\n");
    },
    async grep(input) {
      const context = requireContext();
      const current = await ensureFinder(context);
      const query = buildConstrainedQuery(input.path, input.pattern);
      const limit = clampLimit(input.limit, DEFAULT_GREP_LIMIT, 100);
      const hasRegexSyntax = input.pattern !== input.pattern.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      let mode: "plain" | "regex" = hasRegexSyntax ? "regex" : "plain";
      if (mode === "regex") {
        try {
          new RegExp(input.pattern);
        } catch {
          mode = "plain";
        }
      }
      const grepResult = current.grep(query, {
        mode,
        smartCase: input.caseSensitive !== true,
        maxMatchesPerFile: Math.min(limit, 50),
        pageSize: limit,
        cursor: (input.cursor ? context.grepCursors.get(input.cursor) : undefined) ?? null,
        beforeContext: input.context ?? 0,
        afterContext: input.context ?? 0,
      });
      if (!grepResult.ok) {
        throw new Error(grepResult.error);
      }
      let result = grepResult.value;
      let fuzzyNotice: string | undefined;
      if (result.items.length === 0 && !input.cursor && mode !== "regex") {
        const fuzzy = current.grep(input.pattern, {
          mode: "fuzzy",
          smartCase: input.caseSensitive !== true,
          maxMatchesPerFile: Math.min(limit, 50),
          pageSize: limit,
          cursor: null,
        });
        if (fuzzy.ok && fuzzy.value.items.length > 0) {
          fuzzyNotice = "0 exact matches. Maybe you meant this?";
          result = fuzzy.value;
        }
      }
      let output = formatGrepOutput(result.items);
      if (result.nextCursor) {
        output += `\n\n[Continue with cursor="${storeCursor(context, result.nextCursor)}"]`;
      }
      if (fuzzyNotice) {
        output = `[${fuzzyNotice}]\n${output}`;
      }
      return output;
    },
    async multiGrep(input) {
      const context = requireContext();
      const current = await ensureFinder(context);
      const patterns = input.patterns.map((pattern) => pattern.trim()).filter(Boolean);
      if (patterns.length === 0) {
        throw new Error("At least one search pattern is required.");
      }
      const limit = clampLimit(input.limit, DEFAULT_GREP_LIMIT, 100);
      const result = current.multiGrep({
        patterns,
        ...(input.constraints ? { constraints: input.constraints } : {}),
        pageSize: limit,
        maxMatchesPerFile: Math.min(limit, 50),
        cursor: (input.cursor ? context.grepCursors.get(input.cursor) : undefined) ?? null,
        beforeContext: input.context ?? 0,
        afterContext: input.context ?? 0,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      let output = formatGrepOutput(result.value.items);
      if (result.value.nextCursor) {
        output += `\n\n[Continue with cursor="${storeCursor(context, result.value.nextCursor)}"]`;
      }
      return output;
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
        if (!context.diagnostic) {
          continue;
        }
        items.push({
          type: context.status === "unavailable" ? "error" : "warning",
          message: context.diagnostic,
          path: "local-retrieval",
        });
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

function buildConstrainedQuery(pathConstraint: string | undefined, pattern: string): string {
  const trimmedPattern = pattern.trim();
  const trimmedPath = pathConstraint?.trim();
  if (!trimmedPath || trimmedPath === "." || trimmedPath === "./") {
    return trimmedPattern;
  }
  const posix = toPosixRelative(trimmedPath);
  if (posix.startsWith("..") || posix.startsWith("/")) {
    throw new Error("Path constraint must stay inside the workspace.");
  }
  const prefix = posix.includes("*") || posix.endsWith("/") ? posix : `${posix}/`;
  return `${prefix} ${trimmedPattern}`.trim();
}

function toSuggestion(entry: { type: "file" | "directory"; item: { relativePath: string } }): PathSuggestion | undefined {
  const relative = toPosixRelative(entry.item.relativePath);
  if (!relative) {
    return undefined;
  }
  const kind: WorkspaceReferenceKind = entry.type === "directory" ? "folder" : "file";
  return { path: relative, kind };
}

function formatGrepOutput(items: ReadonlyArray<{ relativePath: string; lineNumber: number; lineContent: string }>): string {
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
    lines.push(` ${match.lineNumber}: ${truncateLine(match.lineContent)}`);
  }
  return lines.join("\n");
}

function truncateLine(line: string, max = 500): string {
  const trimmed = line.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}...`;
}

function unavailableResult(diagnostic: string | undefined): SearchWorkspaceReferencesResult {
  return {
    suggestions: [],
    status: "unavailable",
    ...(diagnostic ? { diagnostic } : { diagnostic: "Local retrieval is not ready." }),
  };
}
