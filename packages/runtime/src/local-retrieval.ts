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
  searchPaths(input: SearchWorkspaceReferencesInput): Promise<SearchWorkspaceReferencesResult>;
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
  getSnapshot(): { status: LocalRetrievalStatus; storageDir?: string; diagnostic?: string };
  diagnostics(): Array<{ type: "warning" | "error"; message: string; path: string }>;
  dispose(): Promise<void>;
}

export function createLocalRetrievalRuntime(options: { dataDir: string }): LocalRetrievalRuntime {
  let finder: FileFinderInstance | undefined;
  let workspacePath: string | undefined;
  let storageDir: string | undefined;
  let status: LocalRetrievalStatus = "unavailable";
  let diagnostic: string | undefined;
  const grepCursors = new Map<string, GrepCursor>();
  let cursorCounter = 0;

  async function ensureFinder(): Promise<FileFinderInstance> {
    if (!finder || finder.isDestroyed) {
      throw new Error(diagnostic ?? "Local retrieval is not available for this workspace.");
    }
    return finder;
  }

  return {
    async bind(nextWorkspacePath) {
      const canonical = path.resolve(nextWorkspacePath);
      if (finder && !finder.isDestroyed && workspacePath === canonical) {
        return;
      }
      destroyFinder();
      workspacePath = canonical;
      storageDir = path.join(options.dataDir, workspaceStorageId(canonical));
      mkdirSync(storageDir, { recursive: true });
      status = "indexing";
      diagnostic = undefined;
      const created = FileFinder.create({
        basePath: canonical,
        frecencyDbPath: path.join(storageDir, "frecency.mdb"),
        historyDbPath: path.join(storageDir, "history.mdb"),
        aiMode: true,
        enableFsRootScanning: false,
        enableHomeDirScanning: false,
        followSymlinks: false,
      });
      if (!created.ok) {
        status = "unavailable";
        diagnostic = created.error;
        return;
      }
      finder = created.value;
      const scanned = await finder.waitForScan(SCAN_TIMEOUT_MS);
      if (!scanned.ok) {
        status = "unavailable";
        diagnostic = scanned.error;
        destroyFinder();
        return;
      }
      status = scanned.value ? "ready" : "indexing";
    },
    async searchPaths(input) {
      if (!workspacePath || !finder || finder.isDestroyed) {
        return unavailableResult(diagnostic);
      }
      const query = input.query.trim().slice(0, MAX_WORKSPACE_REFERENCE_QUERY);
      const limit = clampLimit(input.limit, DEFAULT_WORKSPACE_REFERENCE_LIMIT);
      const kinds = new Set(input.kinds && input.kinds.length > 0 ? input.kinds : ["file", "folder"]);
      const result = finder.mixedSearch(query, { pageSize: Math.min(limit * 2, MAX_WORKSPACE_REFERENCE_RESULTS * 2) });
      if (!result.ok) {
        return { suggestions: [], status, diagnostic: result.error };
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
      return { suggestions, status };
    },
    async fileSearch(input) {
      const current = await ensureFinder();
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
      const current = await ensureFinder();
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
        cursor: (input.cursor ? grepCursors.get(input.cursor) : undefined) ?? null,
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
        output += `\n\n[Continue with cursor="${storeCursor(result.nextCursor)}"]`;
      }
      if (fuzzyNotice) {
        output = `[${fuzzyNotice}]\n${output}`;
      }
      return output;
    },
    async multiGrep(input) {
      const current = await ensureFinder();
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
        cursor: (input.cursor ? grepCursors.get(input.cursor) : undefined) ?? null,
        beforeContext: input.context ?? 0,
        afterContext: input.context ?? 0,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      let output = formatGrepOutput(result.value.items);
      if (result.value.nextCursor) {
        output += `\n\n[Continue with cursor="${storeCursor(result.value.nextCursor)}"]`;
      }
      return output;
    },
    getSnapshot() {
      return {
        status,
        ...(storageDir ? { storageDir } : {}),
        ...(diagnostic ? { diagnostic } : {}),
      };
    },
    diagnostics() {
      if (!diagnostic) {
        return [];
      }
      return [
        {
          type: status === "unavailable" ? "error" : "warning",
          message: diagnostic,
          path: "local-retrieval",
        },
      ];
    },
    async dispose() {
      destroyFinder();
      workspacePath = undefined;
      storageDir = undefined;
      status = "unavailable";
      diagnostic = undefined;
    },
  };

  function destroyFinder(): void {
    if (finder && !finder.isDestroyed) {
      finder.destroy();
    }
    finder = undefined;
    grepCursors.clear();
  }

  function storeCursor(cursor: GrepCursor): string {
    const id = `fff_c${++cursorCounter}`;
    grepCursors.set(id, cursor);
    if (grepCursors.size > 50) {
      const first = grepCursors.keys().next().value;
      if (first) {
        grepCursors.delete(first);
      }
    }
    return id;
  }
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
