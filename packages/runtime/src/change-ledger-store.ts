import { mkdir, open, readFile, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import {
  CHANGE_KINDS,
  CHANGE_LIMITATIONS,
  CHANGE_UNREADABLE_RUN_ID,
  MAX_CHANGE_LEDGER_BYTES,
  MAX_CHANGE_LEDGER_STRING_CHARS,
  MAX_CHANGE_MANIFEST_BYTES,
  MAX_CHANGE_OPERATIONS_PER_RUN,
  MAX_CHANGE_PATHS_PER_RUN,
  MAX_CHANGE_SCOPE_ID_CHARS,
  MAX_CHANGE_SNAPSHOT_BYTES,
  MAX_CHANGE_TOOL_CALL_ID_CHARS,
  REVIEW_STATUSES,
  failCommand,
  HARNESS_ERROR_CODES,
  hasDisallowedControlChars,
  isChangeContentHash,
  isPersistableRelativePath,
  type ChangeKind,
  type ChangeLimitation,
  type ChangeScope,
  type ReviewStatus,
} from "@pho-code/protocol";
import { hashBytes } from "./change-hash";
import { fsyncParentDirectory, writeFileDurable } from "./change-fsync";
import type { ChangeOperation, StoredFileChangeRecord } from "./change-record";
import { isUndoTempName } from "./change-identity";

export const CHANGE_LEDGER_SCHEMA_VERSION = 1 as const;

export interface ChangeLedgerManifest {
  schemaVersion: typeof CHANGE_LEDGER_SCHEMA_VERSION;
  workspaceId: string;
  sessionId: string;
  runId: string;
  revision: number;
  updatedAt: string;
  files: StoredFileChangeRecord[];
  operations: ChangeOperation[];
  blobBytes: number;
  captureCapped?: boolean;
}

export interface ChangeLedgerSessionListing {
  manifests: ChangeLedgerManifest[];
  unreadable: boolean;
  unreadableScopes: ChangeScope[];
}

export interface ChangeLedgerStore {
  load(scope: ChangeScope): Promise<ChangeLedgerManifest | undefined>;
  save(manifest: ChangeLedgerManifest): Promise<void>;
  listForSession(workspaceId: string, sessionId: string): Promise<ChangeLedgerSessionListing>;
  putBlob(bytes: Uint8Array): Promise<{ blobId: string; created: boolean }>;
  getBlob(blobId: string): Promise<Uint8Array | undefined>;
  totalBytes(): Promise<number>;
}

export function encodedManifestSize(manifest: ChangeLedgerManifest): number {
  return Buffer.byteLength(`${JSON.stringify(manifest)}\n`, "utf8");
}

export function exceedsPersistenceBudget(manifest: ChangeLedgerManifest): boolean {
  return (
    manifest.files.length > MAX_CHANGE_PATHS_PER_RUN ||
    manifest.operations.length > MAX_CHANGE_OPERATIONS_PER_RUN ||
    encodedManifestSize(manifest) > MAX_CHANGE_MANIFEST_BYTES
  );
}

type ManifestFileRead =
  | { status: "missing" }
  | { status: "valid"; manifest: ChangeLedgerManifest }
  | { status: "corrupt"; owner?: { workspaceId: string; sessionId: string; runId?: string } };

export function opaqueScopeId(scope: ChangeScope): string {
  return hashBytes(Buffer.from(`${scope.workspaceId}\0${scope.sessionId}\0${scope.runId}`, "utf8"));
}

export function createEmptyManifest(scope: ChangeScope, now: string): ChangeLedgerManifest {
  return {
    schemaVersion: CHANGE_LEDGER_SCHEMA_VERSION,
    workspaceId: scope.workspaceId,
    sessionId: scope.sessionId,
    runId: scope.runId,
    revision: 0,
    updatedAt: now,
    files: [],
    operations: [],
    blobBytes: 0,
  };
}

export function createFileChangeLedgerStore(rootDir: string): ChangeLedgerStore {
  const root = path.resolve(rootDir);
  const manifestsDir = path.join(root, "manifests");
  const blobsDir = path.join(root, "blobs");
  const tmpDir = path.join(root, "tmp");

  async function ensureDirs(): Promise<void> {
    await mkdir(manifestsDir, { recursive: true });
    await mkdir(blobsDir, { recursive: true });
    await mkdir(tmpDir, { recursive: true });
  }

  function manifestPath(scope: ChangeScope): string {
    return path.join(manifestsDir, `${opaqueScopeId(scope)}.json`);
  }

  async function readManifestFile(filePath: string): Promise<ManifestFileRead> {
    let info;
    try {
      info = await stat(filePath);
    } catch (error) {
      if (isNotFoundError(error)) {
        return { status: "missing" };
      }
      throw error;
    }
    if (!info.isFile() || info.size > MAX_CHANGE_MANIFEST_BYTES) {
      return { status: "corrupt" };
    }
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) {
        return { status: "missing" };
      }
      throw error;
    }
    if (raw.length > MAX_CHANGE_MANIFEST_BYTES) {
      return { status: "corrupt" };
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return { status: "corrupt" };
    }
    const parsed = parseManifest(parsedJson);
    if (!parsed) {
      return { status: "corrupt", owner: peekLedgerOwner(parsedJson) };
    }
    return { status: "valid", manifest: parsed };
  }

  return {
    async load(scope) {
      await ensureDirs();
      const parsed = await readManifestFile(manifestPath(scope));
      if (parsed.status === "missing") {
        return undefined;
      }
      if (
        parsed.status === "corrupt" ||
        parsed.manifest.workspaceId !== scope.workspaceId ||
        parsed.manifest.sessionId !== scope.sessionId ||
        parsed.manifest.runId !== scope.runId
      ) {
        failCommand(
          "loadChangeLedger",
          "The change-ledger manifest is unreadable. Chat continues, but this review set cannot be opened until the record is repaired.",
          HARNESS_ERROR_CODES.changeReviewCorrupt,
        );
      }
      return parsed.manifest;
    },
    async save(manifest) {
      await ensureDirs();
      const decoded = parseManifest(manifest);
      if (
        !decoded ||
        decoded.workspaceId !== manifest.workspaceId ||
        decoded.sessionId !== manifest.sessionId ||
        decoded.runId !== manifest.runId ||
        exceedsPersistenceBudget(decoded)
      ) {
        throw new Error("Refusing to persist an invalid change-ledger manifest.");
      }
      const target = manifestPath(decoded);
      const temp = path.join(tmpDir, `${opaqueScopeId(decoded)}.${process.pid}.${Date.now()}.json`);
      await writeFileDurable(temp, `${JSON.stringify(decoded)}\n`);
      await rename(temp, target);
      await fsyncParentDirectory(target);
    },
    async listForSession(workspaceId, sessionId) {
      await ensureDirs();
      let names: string[];
      try {
        names = await readdir(manifestsDir);
      } catch {
        return { manifests: [], unreadable: false, unreadableScopes: [] };
      }
      const manifests: ChangeLedgerManifest[] = [];
      const unreadableScopes: ChangeScope[] = [];
      let unreadable = false;
      for (const name of names) {
        if (!name.endsWith(".json")) {
          continue;
        }
        const parsed = await readManifestFile(path.join(manifestsDir, name));
        if (parsed.status === "missing") {
          continue;
        }
        if (parsed.status === "valid") {
          if (parsed.manifest.workspaceId === workspaceId && parsed.manifest.sessionId === sessionId) {
            manifests.push(parsed.manifest);
          }
          continue;
        }
        const owner = parsed.owner;
        const attributed = owner?.workspaceId === workspaceId && owner.sessionId === sessionId;
        if (!attributed && owner !== undefined) {
          continue;
        }
        unreadable = true;
        if (unreadableScopes.length === 0) {
          unreadableScopes.push({ workspaceId, sessionId, runId: CHANGE_UNREADABLE_RUN_ID });
        }
      }
      return {
        manifests: manifests.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)),
        unreadable,
        unreadableScopes,
      };
    },
    async putBlob(bytes) {
      await ensureDirs();
      const blobId = hashBytes(bytes);
      const target = path.join(blobsDir, blobId);
      try {
        await stat(target);
        return { blobId, created: false };
      } catch {
        const temp = path.join(tmpDir, `${blobId}.${process.pid}.${Date.now()}`);
        await writeFileDurable(temp, bytes);
        await rename(temp, target);
        await fsyncParentDirectory(target);
        return { blobId, created: true };
      }
    },
    async getBlob(blobId) {
      if (!isChangeContentHash(blobId)) {
        return undefined;
      }
      let handle;
      try {
        handle = await open(path.join(blobsDir, blobId), "r");
      } catch {
        return undefined;
      }
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > MAX_CHANGE_SNAPSHOT_BYTES) {
          return undefined;
        }
        const buffer = Buffer.alloc(info.size);
        const { bytesRead } = await handle.read(buffer, 0, info.size, 0);
        if (bytesRead !== info.size) {
          return undefined;
        }
        const bytes = buffer.subarray(0, bytesRead);
        if (hashBytes(bytes) !== blobId) {
          return undefined;
        }
        return bytes;
      } finally {
        await handle.close();
      }
    },
    async totalBytes() {
      await ensureDirs();
      return (await directorySize(manifestsDir)) + (await directorySize(blobsDir));
    },
  };
}

export function ledgerBudgetExceeded(totalBytes: number): boolean {
  return totalBytes >= MAX_CHANGE_LEDGER_BYTES;
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === "ENOENT");
}

async function directorySize(directory: string): Promise<number> {
  let total = 0;
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return 0;
  }
  for (const name of names) {
    try {
      const info = await stat(path.join(directory, name));
      if (info.isFile()) {
        total += info.size;
      }
    } catch {
      // Ignore vanished temp files.
    }
  }
  return total;
}

function peekLedgerOwner(value: unknown): { workspaceId: string; sessionId: string; runId?: string } | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Partial<ChangeScope>;
  if (
    !isBoundedLedgerString(candidate.workspaceId, MAX_CHANGE_SCOPE_ID_CHARS) ||
    !isBoundedLedgerString(candidate.sessionId, MAX_CHANGE_SCOPE_ID_CHARS)
  ) {
    return undefined;
  }
  return {
    workspaceId: candidate.workspaceId,
    sessionId: candidate.sessionId,
    ...(isBoundedLedgerString(candidate.runId, MAX_CHANGE_SCOPE_ID_CHARS) ? { runId: candidate.runId } : {}),
  };
}

function parseManifest(value: unknown): ChangeLedgerManifest | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Partial<ChangeLedgerManifest>;
  if (candidate.schemaVersion !== CHANGE_LEDGER_SCHEMA_VERSION) {
    return undefined;
  }
  if (
    !isBoundedLedgerString(candidate.workspaceId, MAX_CHANGE_SCOPE_ID_CHARS) ||
    !isBoundedLedgerString(candidate.sessionId, MAX_CHANGE_SCOPE_ID_CHARS) ||
    !isBoundedLedgerString(candidate.runId, MAX_CHANGE_SCOPE_ID_CHARS) ||
    !isNonNegativeInt(candidate.revision) ||
    !isBoundedLedgerString(candidate.updatedAt, MAX_CHANGE_LEDGER_STRING_CHARS) ||
    !isNonNegativeInt(candidate.blobBytes) ||
    candidate.blobBytes > MAX_CHANGE_LEDGER_BYTES ||
    !Array.isArray(candidate.files) ||
    !Array.isArray(candidate.operations) ||
    candidate.files.length > MAX_CHANGE_PATHS_PER_RUN ||
    candidate.operations.length > MAX_CHANGE_OPERATIONS_PER_RUN
  ) {
    return undefined;
  }
  if (candidate.captureCapped !== undefined && typeof candidate.captureCapped !== "boolean") {
    return undefined;
  }
  const files: StoredFileChangeRecord[] = [];
  const filePaths = new Set<string>();
  for (const file of candidate.files) {
    const parsed = parseFileRecord(file);
    if (!parsed || filePaths.has(parsed.relativePath)) {
      return undefined;
    }
    filePaths.add(parsed.relativePath);
    files.push(parsed);
  }
  const operations: ChangeOperation[] = [];
  const toolCallIds = new Set<string>();
  for (const operation of candidate.operations) {
    const parsed = parseOperation(operation);
    if (!parsed || toolCallIds.has(parsed.toolCallId) || !filePaths.has(parsed.relativePath)) {
      return undefined;
    }
    toolCallIds.add(parsed.toolCallId);
    operations.push(parsed);
  }
  return {
    schemaVersion: CHANGE_LEDGER_SCHEMA_VERSION,
    workspaceId: candidate.workspaceId,
    sessionId: candidate.sessionId,
    runId: candidate.runId,
    revision: candidate.revision,
    updatedAt: candidate.updatedAt,
    files,
    operations,
    blobBytes: candidate.blobBytes,
    ...(candidate.captureCapped ? { captureCapped: true } : {}),
  };
}

function parseFileRecord(value: unknown): StoredFileChangeRecord | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Partial<StoredFileChangeRecord>;
  if (!isPersistableRelativePath(candidate.relativePath)) {
    return undefined;
  }
  if (!isStoredKind(candidate.kind) || !isStoredStatus(candidate.status)) {
    return undefined;
  }
  if (
    !isBoundedLedgerString(candidate.firstToolCallId, MAX_CHANGE_TOOL_CALL_ID_CHARS) ||
    !isBoundedLedgerString(candidate.latestToolCallId, MAX_CHANGE_TOOL_CALL_ID_CHARS) ||
    !isBoundedLedgerString(candidate.startedAt, MAX_CHANGE_LEDGER_STRING_CHARS) ||
    !isBoundedLedgerString(candidate.updatedAt, MAX_CHANGE_LEDGER_STRING_CHARS)
  ) {
    return undefined;
  }
  if (candidate.limitation !== undefined && !isStoredLimitation(candidate.limitation)) {
    return undefined;
  }
  for (const key of ["beforeHash", "afterHash", "beforeBlobId", "afterBlobId"] as const) {
    if (candidate[key] !== undefined && !isChangeContentHash(candidate[key])) {
      return undefined;
    }
  }
  for (const key of ["byteLengthBefore", "byteLengthAfter"] as const) {
    if (candidate[key] !== undefined && !isBoundedByteLength(candidate[key])) {
      return undefined;
    }
  }
  if (candidate.status === "pending") {
    if (candidate.limitation) {
      return undefined;
    }
    if (candidate.kind === "created" && typeof candidate.afterHash !== "string") {
      return undefined;
    }
    if (candidate.kind === "modified" && (typeof candidate.beforeHash !== "string" || typeof candidate.afterHash !== "string")) {
      return undefined;
    }
  }
  if (
    (candidate.beforeBlobId && candidate.beforeHash && candidate.beforeBlobId !== candidate.beforeHash) ||
    (candidate.afterBlobId && candidate.afterHash && candidate.afterBlobId !== candidate.afterHash)
  ) {
    return undefined;
  }
  if (typeof candidate.undoTempName === "string" && !isUndoTempName(candidate.undoTempName)) {
    return undefined;
  }
  return {
    relativePath: candidate.relativePath,
    kind: candidate.kind,
    status: candidate.status,
    firstToolCallId: candidate.firstToolCallId,
    latestToolCallId: candidate.latestToolCallId,
    startedAt: candidate.startedAt,
    updatedAt: candidate.updatedAt,
    ...(candidate.beforeHash ? { beforeHash: candidate.beforeHash } : {}),
    ...(candidate.afterHash ? { afterHash: candidate.afterHash } : {}),
    ...(candidate.beforeBlobId ? { beforeBlobId: candidate.beforeBlobId } : {}),
    ...(candidate.afterBlobId ? { afterBlobId: candidate.afterBlobId } : {}),
    ...(candidate.byteLengthBefore !== undefined ? { byteLengthBefore: candidate.byteLengthBefore } : {}),
    ...(candidate.byteLengthAfter !== undefined ? { byteLengthAfter: candidate.byteLengthAfter } : {}),
    ...(candidate.limitation ? { limitation: candidate.limitation } : {}),
    ...(typeof candidate.undoTempName === "string" ? { undoTempName: candidate.undoTempName } : {}),
  };
}

function parseOperation(value: unknown): ChangeOperation | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Partial<ChangeOperation>;
  if (
    !isBoundedLedgerString(candidate.toolCallId, MAX_CHANGE_TOOL_CALL_ID_CHARS) ||
    (candidate.toolName !== "write" && candidate.toolName !== "edit") ||
    !isPersistableRelativePath(candidate.relativePath) ||
    !isBoundedLedgerString(candidate.at, MAX_CHANGE_LEDGER_STRING_CHARS)
  ) {
    return undefined;
  }
  if (candidate.isError !== undefined && typeof candidate.isError !== "boolean") {
    return undefined;
  }
  return {
    toolCallId: candidate.toolCallId,
    toolName: candidate.toolName,
    relativePath: candidate.relativePath,
    at: candidate.at,
    ...(candidate.isError !== undefined ? { isError: candidate.isError } : {}),
  };
}

function isStoredKind(value: unknown): value is ChangeKind {
  return typeof value === "string" && (CHANGE_KINDS as readonly string[]).includes(value);
}

function isStoredStatus(value: unknown): value is ReviewStatus {
  return typeof value === "string" && (REVIEW_STATUSES as readonly string[]).includes(value);
}

function isStoredLimitation(value: unknown): value is ChangeLimitation {
  return typeof value === "string" && (CHANGE_LIMITATIONS as readonly string[]).includes(value);
}

function isBoundedLedgerString(value: unknown, maxChars: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxChars &&
    !hasDisallowedControlChars(value)
  );
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function isBoundedByteLength(value: unknown): value is number {
  return isNonNegativeInt(value) && value <= MAX_CHANGE_LEDGER_BYTES;
}
