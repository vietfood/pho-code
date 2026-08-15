import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CHANGE_KINDS,
  CHANGE_LIMITATIONS,
  MAX_CHANGE_LEDGER_BYTES,
  REVIEW_STATUSES,
  createHarnessError,
  HARNESS_ERROR_CODES,
  type ChangeKind,
  type ChangeLimitation,
  type ChangeScope,
  type ReviewStatus,
} from "@pho-code/protocol";
import { hashBytes } from "./change-hash";
import type { ChangeOperation, StoredFileChangeRecord } from "./change-record";

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
}

export interface ChangeLedgerStore {
  load(scope: ChangeScope): Promise<ChangeLedgerManifest | undefined>;
  save(manifest: ChangeLedgerManifest): Promise<void>;
  listForSession(workspaceId: string, sessionId: string): Promise<ChangeLedgerManifest[]>;
  putBlob(bytes: Uint8Array): Promise<{ blobId: string; created: boolean }>;
  getBlob(blobId: string): Promise<Uint8Array | undefined>;
  totalBytes(): Promise<number>;
}

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

  return {
    async load(scope) {
      await ensureDirs();
      let raw: string;
      try {
        raw = await readFile(manifestPath(scope), "utf8");
      } catch (error) {
        if (isNotFoundError(error)) {
          return undefined;
        }
        throw error;
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        throw corruptManifestError();
      }
      const parsed = parseManifest(parsedJson, scope);
      if (!parsed) {
        throw corruptManifestError();
      }
      return parsed;
    },
    async save(manifest) {
      await ensureDirs();
      const decoded = parseManifest(manifest, {
        workspaceId: manifest.workspaceId,
        sessionId: manifest.sessionId,
        runId: manifest.runId,
      });
      if (!decoded) {
        throw new Error("Refusing to persist an invalid change-ledger manifest.");
      }
      const target = manifestPath(decoded);
      const temp = path.join(tmpDir, `${opaqueScopeId(decoded)}.${process.pid}.${Date.now()}.json`);
      await writeFile(temp, `${JSON.stringify(decoded)}\n`, "utf8");
      await rename(temp, target);
    },
    async listForSession(workspaceId, sessionId) {
      await ensureDirs();
      let names: string[];
      try {
        names = await readdir(manifestsDir);
      } catch {
        return [];
      }
      const manifests: ChangeLedgerManifest[] = [];
      for (const name of names) {
        if (!name.endsWith(".json")) {
          continue;
        }
        try {
          const raw = await readFile(path.join(manifestsDir, name), "utf8");
          const parsed = parseManifest(JSON.parse(raw));
          if (parsed && parsed.workspaceId === workspaceId && parsed.sessionId === sessionId) {
            manifests.push(parsed);
          }
        } catch {
          // Corrupt manifests must not block chat.
        }
      }
      return manifests.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
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
        await writeFile(temp, bytes);
        await rename(temp, target);
        return { blobId, created: true };
      }
    },
    async getBlob(blobId) {
      if (!/^[a-f0-9]{64}$/u.test(blobId)) {
        return undefined;
      }
      try {
        return await readFile(path.join(blobsDir, blobId));
      } catch {
        return undefined;
      }
    },
    async totalBytes() {
      await ensureDirs();
      let total = 0;
      total += await directorySize(manifestsDir);
      total += await directorySize(blobsDir);
      return total;
    },
  };
}

export function ledgerBudgetExceeded(totalBytes: number): boolean {
  return totalBytes >= MAX_CHANGE_LEDGER_BYTES;
}

function corruptManifestError() {
  return createHarnessError({
    code: HARNESS_ERROR_CODES.changeReviewCorrupt,
    message: "The change-ledger manifest is unreadable. Chat continues, but this review set cannot be opened until the record is repaired.",
    operation: "loadChangeLedger",
    recoverable: true,
  });
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

function parseManifest(value: unknown, expected?: ChangeScope): ChangeLedgerManifest | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Partial<ChangeLedgerManifest>;
  if (candidate.schemaVersion !== CHANGE_LEDGER_SCHEMA_VERSION) {
    return undefined;
  }
  if (
    typeof candidate.workspaceId !== "string" ||
    typeof candidate.sessionId !== "string" ||
    typeof candidate.runId !== "string" ||
    typeof candidate.revision !== "number" ||
    !Number.isInteger(candidate.revision) ||
    candidate.revision < 0 ||
    typeof candidate.updatedAt !== "string" ||
    typeof candidate.blobBytes !== "number" ||
    !Array.isArray(candidate.files) ||
    !Array.isArray(candidate.operations)
  ) {
    return undefined;
  }
  if (
    expected &&
    (candidate.workspaceId !== expected.workspaceId ||
      candidate.sessionId !== expected.sessionId ||
      candidate.runId !== expected.runId)
  ) {
    return undefined;
  }
  const files: StoredFileChangeRecord[] = [];
  for (const file of candidate.files) {
    const parsed = parseFileRecord(file);
    if (!parsed) {
      return undefined;
    }
    files.push(parsed);
  }
  const operations: ChangeOperation[] = [];
  for (const operation of candidate.operations) {
    const parsed = parseOperation(operation);
    if (!parsed) {
      return undefined;
    }
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
  };
}

function parseFileRecord(value: unknown): StoredFileChangeRecord | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Partial<StoredFileChangeRecord>;
  if (typeof candidate.relativePath !== "string" || candidate.relativePath.includes("..") || candidate.relativePath.startsWith("/")) {
    return undefined;
  }
  if (!isStoredKind(candidate.kind) || !isStoredStatus(candidate.status)) {
    return undefined;
  }
  if (
    typeof candidate.firstToolCallId !== "string" ||
    typeof candidate.latestToolCallId !== "string" ||
    typeof candidate.startedAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return undefined;
  }
  if (candidate.limitation !== undefined && !isStoredLimitation(candidate.limitation)) {
    return undefined;
  }
  const record: StoredFileChangeRecord = {
    relativePath: candidate.relativePath,
    kind: candidate.kind,
    status: candidate.status,
    firstToolCallId: candidate.firstToolCallId,
    latestToolCallId: candidate.latestToolCallId,
    startedAt: candidate.startedAt,
    updatedAt: candidate.updatedAt,
  };
  if (typeof candidate.beforeHash === "string") {
    record.beforeHash = candidate.beforeHash;
  }
  if (typeof candidate.afterHash === "string") {
    record.afterHash = candidate.afterHash;
  }
  if (typeof candidate.beforeBlobId === "string") {
    record.beforeBlobId = candidate.beforeBlobId;
  }
  if (typeof candidate.afterBlobId === "string") {
    record.afterBlobId = candidate.afterBlobId;
  }
  if (typeof candidate.byteLengthBefore === "number") {
    record.byteLengthBefore = candidate.byteLengthBefore;
  }
  if (typeof candidate.byteLengthAfter === "number") {
    record.byteLengthAfter = candidate.byteLengthAfter;
  }
  if (candidate.limitation) {
    record.limitation = candidate.limitation;
  }
  return record;
}

function parseOperation(value: unknown): ChangeOperation | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Partial<ChangeOperation>;
  if (
    typeof candidate.toolCallId !== "string" ||
    (candidate.toolName !== "write" && candidate.toolName !== "edit") ||
    typeof candidate.relativePath !== "string" ||
    typeof candidate.at !== "string"
  ) {
    return undefined;
  }
  const operation: ChangeOperation = {
    toolCallId: candidate.toolCallId,
    toolName: candidate.toolName,
    relativePath: candidate.relativePath,
    at: candidate.at,
  };
  if (typeof candidate.isError === "boolean") {
    operation.isError = candidate.isError;
  }
  return operation;
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
