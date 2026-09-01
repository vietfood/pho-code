import type {
  AgentTaskSnapshot,
  TaskBriefContent,
  TaskBriefStatus,
  VerificationOutcome,
} from "@pho-agent/protocol";

export type {
  AgentTaskSnapshot,
  CompletionAssessment,
  CompletionOutcome,
  CriterionAssessment,
  EvidenceFreshness,
  EvidenceCandidate,
  EvidencePackItem,
  EvidencePackSummary,
  TaskAcceptanceCriterion,
  TaskBriefContent,
  TaskBriefSnapshot,
  TaskBriefStatus,
  VerificationLedgerSnapshot,
  VerificationOutcome,
  VerificationRecord,
  VerificationSubject,
} from "@pho-agent/protocol";

export {
  COMPLETE_TASK_TOOL_NAME,
  TASK_BRIEF_CRITERION_ID_MAX_CHARS,
  TASK_BRIEF_ITEM_MAX_CHARS,
  TASK_BRIEF_MAX_CRITERIA,
  TASK_BRIEF_MAX_LIST_ITEMS,
  TASK_BRIEF_MAX_OPEN_QUESTIONS,
  TASK_BRIEF_OBJECTIVE_MAX_CHARS,
  TASK_EVIDENCE_MAX_ITEMS,
  TASK_VERIFICATION_MAX_RECORDS,
  UPDATE_TASK_BRIEF_TOOL_NAME,
  boundedTaskText,
  normalizeTaskBriefContent,
} from "@pho-agent/protocol";

export interface TaskSessionScope {
  backendId?: string;
  workspaceId?: string;
  sessionId: string;
}

export interface UpdateTaskBriefInput extends TaskSessionScope {
  expectedRevision?: string;
  status?: Extract<TaskBriefStatus, "draft" | "active">;
  content: TaskBriefContent;
}

export interface ResetTaskBriefInput extends TaskSessionScope {
  expectedRevision?: string;
}

export type ReopenTaskInput = TaskSessionScope;

export interface RecordOwnerVerificationInput extends TaskSessionScope {
  criterionId?: string;
  outcome: VerificationOutcome;
  summary: string;
}

export type AcceptTaskCompletionGapsInput = TaskSessionScope;

export function emptyTaskSnapshot(): AgentTaskSnapshot {
  return { verification: { records: [], truncated: false } };
}
