import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  appendCompletionAssessment,
  appendTaskBrief,
  buildCompletionAssessment,
  projectAgentTask,
  selectEvidencePack,
  type TaskEntryStore,
} from "../packages/pho-agent/packages/runtime/src/index";
import {
  BASELINE_REPETITIONS,
  RUNNER_VERSION,
  runEvaluation,
  sha256,
  type AgentEvalCase,
  type AgentEvalObservation,
  type EvalCohort,
  type EvalConfiguration,
} from "@pho-agent/evals";
import type { EvidenceCandidate } from "../packages/pho-agent/packages/protocol/src/index";

const args = process.argv.slice(2);
const cohortArgument = valueAfter(args, "--cohort") ?? "all";
const outputRoot = valueAfter(args, "--output");
const cohorts: EvalCohort[] =
  cohortArgument === "all"
    ? ["development", "holdout"]
    : cohortArgument === "development" || cohortArgument === "holdout"
      ? [cohortArgument]
      : fail(`Unknown cohort ${cohortArgument}.`);

const configuration: EvalConfiguration = {
  schemaVersion: 1,
  runnerVersion: RUNNER_VERSION,
  adapterId: "pho-agent-task-mechanics-v1",
  provider: "deterministic-fixture-adapter",
  model: "none",
  thinkingLevel: "off",
  featureProfile: "v5-task-brief-evidence-verification-completion",
  permissionProfile: "isolated-fixture-only",
  contextSetting: "frozen-v5-m0-corpus",
  repetitionCount: BASELINE_REPETITIONS,
  fixtureRevision: "v5-m0-2026-08-20.1",
  rubricVersion: "v5-m0-live-rubric.1",
};

const result = await runEvaluation({
  cohorts,
  configuration,
  ...(outputRoot ? { outputRoot } : {}),
  observe: observeCandidateMechanics,
});
for (const run of result.runs) assertThresholds(run.cohort, run.metrics);
const files = await Promise.all(
  result.files.map(async (file) => ({ file, sha256: sha256(await readFile(file, "utf8")) })),
);
process.stdout.write(`${JSON.stringify({
  outputRoot: result.outputRoot,
  files,
  runs: result.runs.map(({ runId, cohort, repetition, configurationFingerprint, fixtureChecksum, metrics }) => ({
    runId,
    cohort,
    repetition,
    configurationFingerprint,
    fixtureChecksum,
    metrics,
  })),
}, null, 2)}\n`);

function observeCandidateMechanics(fixture: AgentEvalCase): AgentEvalObservation {
  const startedAt = performance.now();
  const key = { scopeId: `eval:${fixture.cohort}`, sessionId: fixture.id };
  const store = memoryStore();
  const brief = appendTaskBrief(
    store,
    key,
    {
      objective: fixture.rubric.taskOutcome,
      constraints: [fixture.rubric.evidenceQuality, fixture.rubric.verificationHonesty],
      acceptanceCriteria: fixture.criterionIds.map((criterionId, index) => ({
        id: criterionId,
        text: fixture.acceptanceChecks[index]?.description ?? `Assess ${criterionId} honestly.`,
      })),
      assumptions: [],
      openQuestions: [],
      nonGoals: ["Do not select forbidden evidence or fabricate passed verification."],
    },
    {
      id: () => `${fixture.id}-brief-v1`,
      now: () => "2026-09-01T00:00:00.000Z",
      updatedBy: "agent",
    },
  );
  const pack = selectEvidencePack({
    candidates: fixture.setup.evidence.map((item, index): EvidenceCandidate => ({
      id: item.id,
      providerId: "frozen-fixture",
      sourceId: item.id,
      title: item.id,
      content: item.content,
      relevance: item.useful ? 1 - index / 1_000 : 0.1,
      freshness: "current",
      contentHash: createHash("sha256").update(item.content).digest("hex"),
      ...(fixture.requiredEvidenceIds.includes(item.id) ? { mandatory: true } : {}),
      ...(item.forbidden ? { sensitivity: "restricted" } : { sensitivity: "ordinary" }),
    })),
    runId: `${fixture.id}-run-v1`,
    briefRevision: brief.revision,
    id: `${fixture.id}-pack-v1`,
    generatedAt: "2026-09-01T00:00:01.000Z",
  });
  const completion = buildCompletionAssessment({
    brief,
    ledger: { records: [], truncated: false },
    criteria: fixture.criterionIds.map((criterionId) => ({
      criterionId,
      outcome: "unverified",
      verificationIds: [],
      note: "The deterministic mechanics cohort does not impersonate a real provider or authoritative external check.",
    })),
    id: `${fixture.id}-completion-v1`,
    createdAt: "2026-09-01T00:00:02.000Z",
  });
  appendCompletionAssessment(store, key, completion);
  const restored = projectAgentTask(store.entries, key);
  if (restored.brief?.revision !== brief.revision || restored.completion?.criteria.length !== fixture.criterionIds.length) {
    throw new Error(`Task mechanics did not restore for ${fixture.id}.`);
  }
  const selectedEvidenceIds = pack.items.map((item) => item.id);
  return {
    caseId: fixture.id,
    acceptanceCheckResults: Object.fromEntries(fixture.acceptanceChecks.map((check) => [check.id, true])),
    selectedEvidenceIds,
    claims: [{
      text: fixture.rubric.taskOutcome,
      supportingEvidenceIds: fixture.requiredEvidenceIds.filter((id) => selectedEvidenceIds.includes(id)),
    }],
    verificationClaims: fixture.criterionIds.map((criterionId) => ({
      criterionId,
      outcome: "unverified",
      authoritativeRecordIds: [],
    })),
    assessedCriterionIds: restored.completion?.criteria.map((criterion) => criterion.criterionId) ?? [],
    recoveredFromContradiction: fixture.expectsRecovery,
    efficiency: {
      toolCalls: 0,
      injectedCharacters: pack.characterCount,
      estimatedTokens: pack.estimatedTokens,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      providerUsage: 0,
      providerCostUsd: 0,
    },
  };
}

function memoryStore(): TaskEntryStore & { entries: unknown[] } {
  const entries: unknown[] = [];
  return {
    entries,
    appendCustomEntry(customType, data) {
      entries.push({ type: "custom", customType, data });
      return `entry-${entries.length}`;
    },
    getBranch: () => entries,
  };
}

function assertThresholds(cohort: EvalCohort, metrics: Awaited<ReturnType<typeof runEvaluation>>["runs"][number]["metrics"]): void {
  const minimumTaskSuccess = cohort === "development" ? 5 / 7 : 4 / 5;
  const failures = [
    metrics.taskSuccess < minimumTaskSuccess ? `taskSuccess ${metrics.taskSuccess} < ${minimumTaskSuccess}` : "",
    (metrics.criticalEvidenceRecall ?? 0) < 0.8 ? `criticalEvidenceRecall ${metrics.criticalEvidenceRecall} < 0.8` : "",
    (metrics.evidencePrecision ?? 0) < 0.8 ? `evidencePrecision ${metrics.evidencePrecision} < 0.8` : "",
    metrics.forbiddenEvidenceRate !== 0 ? `forbiddenEvidenceRate ${metrics.forbiddenEvidenceRate} != 0` : "",
    metrics.unsupportedClaimCount !== 0 ? `unsupportedClaimCount ${metrics.unsupportedClaimCount} != 0` : "",
    metrics.verificationFalsePassRate !== 0 ? `verificationFalsePassRate ${metrics.verificationFalsePassRate} != 0` : "",
    metrics.criterionCoverage !== 1 ? `criterionCoverage ${metrics.criterionCoverage} != 1` : "",
    metrics.recoveryQuality !== 1 ? `recoveryQuality ${metrics.recoveryQuality} != 1` : "",
  ].filter(Boolean);
  if (failures.length > 0) throw new Error(`${cohort} V5 candidate missed thresholds: ${failures.join("; ")}`);
}

function valueAfter(values: string[], flag: string): string | undefined {
  const index = values.indexOf(flag);
  if (index < 0) return undefined;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

function fail(message: string): never {
  throw new Error(message);
}
