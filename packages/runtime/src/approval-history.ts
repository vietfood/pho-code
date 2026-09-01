import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  MAX_APPROVAL_HISTORY_PAGE_SIZE,
  type ApprovalDecisionHistoryEntry,
  type ApprovalDecisionHistoryPage,
  type ListApprovalDecisionHistoryInput,
} from "@pho-code/protocol";

const MAX_HISTORY_ENTRIES = 1_000;

export function createApprovalDecisionHistory(applicationDataDir: string) {
  const filePath = path.join(applicationDataDir, "approval-decisions", "v1", "history.json");
  let entries = load(filePath);

  function persist(): void {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.${process.pid}.tmp`;
    try {
      writeFileSync(temp, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
      renameSync(temp, filePath);
    } catch (error) {
      try {
        if (existsSync(temp)) unlinkSync(temp);
      } catch {
        // The previous bounded history stays readable.
      }
      throw error;
    }
  }

  return {
    append(entry: ApprovalDecisionHistoryEntry): void {
      entries.push(entry);
      if (entries.length > MAX_HISTORY_ENTRIES) entries = entries.slice(-MAX_HISTORY_ENTRIES);
      persist();
    },
    list(input: ListApprovalDecisionHistoryInput = {}): ApprovalDecisionHistoryPage {
      const offset = parseCursor(input.cursor);
      const limit = Math.min(
        MAX_APPROVAL_HISTORY_PAGE_SIZE,
        Math.max(1, Number.isSafeInteger(input.limit) ? input.limit! : MAX_APPROVAL_HISTORY_PAGE_SIZE),
      );
      const newest = [...entries].reverse();
      const page = newest.slice(offset, offset + limit);
      return {
        entries: page,
        ...(offset + page.length < newest.length ? { nextCursor: String(offset + page.length) } : {}),
      };
    },
  };
}

function load(filePath: string): ApprovalDecisionHistoryEntry[] {
  if (!existsSync(filePath)) return [];
  try {
    const value = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(validEntry).slice(-MAX_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

function validEntry(value: unknown): value is ApprovalDecisionHistoryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<ApprovalDecisionHistoryEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.occurredAt === "string" &&
    typeof entry.workspaceId === "string" &&
    typeof entry.sessionId === "string" &&
    typeof entry.runId === "string" &&
    (entry.mode === "ask" || entry.mode === "auto" || entry.mode === "full") &&
    typeof entry.outcome === "string" &&
    typeof entry.source === "string" &&
    typeof entry.ruleId === "string" &&
    typeof entry.toolName === "string" &&
    !!entry.action &&
    typeof entry.action.title === "string" &&
    typeof entry.action.summary === "string"
  );
}

function parseCursor(value: string | undefined): number {
  if (!value || !/^\d+$/u.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}
