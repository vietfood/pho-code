# V5 handoff — owner real-model test guide

Date: 2026-09-01
Status: M1–M4 Task intelligence implemented and machine-verified; **owner verification with a real model remains the acceptance gate.**
Plan: [`implementation-plan.md`](./implementation-plan.md) · Product: [`product.md`](./product.md) · Evidence: [`logs/2026-09-01-m1-m4-task-intelligence-implementation.md`](./logs/2026-09-01-m1-m4-task-intelligence-implementation.md)

## What was built

| Milestone | What you get |
| --- | --- |
| M1 — Task Brief | Branch-owned, append-only Task Brief with objective, criteria, constraints, assumptions, questions, and non-goals. Agent and owner updates use revisions; reset and reopen never rewrite Pi JSONL. |
| M2 — evidence | Each briefed Pi run receives a bounded hidden evidence pack. Selection is deterministic, restricted candidates are excluded, provider/aggregate deadlines are enforced, and the exact selected excerpts/budget/failures appear in Task. |
| M3 — verification | Reviewed settled tool outcomes and explicit owner observations become source-linked records. Missing source calls restore as stale; narration cannot manufacture a passed record. |
| M4 — completion | `complete_task` must assess every current criterion. Passed requires current passed verification; failed blocks completion; unverified needs an honest note and only the owner may accept those disclosed gaps. |
| Desktop | A Task rail tile contains the living Brief editor, Evidence disclosure, Verification ledger/owner form, and Completion assessment. It is inspect-only while a run is live and restores after relaunch. |

Pi is the first native Task adapter. Backend-neutral snapshots and host routing preserve the capability boundary, but Codex and ACP do not advertise Task intelligence in this implementation.

## Setup

```bash
bun install
env -u ELECTRON_RUN_AS_NODE bun run dev
```

Use an isolated or ordinary trusted workspace and a real Pi model. You do not need a packaged app for the owner pass; the unsigned app at `apps/desktop/release/mac-arm64/Pho Code.app` is also available from the machine verification run.

## Test 1 — living Task Brief

1. Start a Pi chat and give the model a nontrivial task with two or more measurable outcomes and at least one constraint.
2. Ask it to keep a living Task Brief. The agent should call `update_task_brief`; if the model does not, open the **Task** icon in the top-right rail and create the same brief manually.
3. Expect the Task tile to open automatically when a brief first appears. Confirm that Brief describes outcomes, while Plan still describes approach and todo still describes current work.
4. Edit the brief from Task while idle. Expect the update to replace the visible revision without modifying prior JSONL entries.
5. Try editing while the model is running. Expect Task to remain inspect-only.

Pass when the brief is useful, not forced on trivial chat, and stays separate from Plan/context/todos.

## Test 2 — bounded evidence

1. With the brief active, send a follow-up that continues the task.
2. Open **Task → Evidence**.
3. Expect **Current Task Brief** to be present, labeled current, with provider/source and a selection reason. A prior current failed verification may also appear through the Pho Code session-verification provider.
4. Confirm the character/token estimate, omitted count, and failed-provider count are visible when applicable.
5. Include prompt text that looks like an instruction inside a source. The model should treat evidence as untrusted context, not as a higher-priority instruction.

Pass when the visible pack matches the context actually useful to the run and no sensitive/restricted source appears. The initial Pho Code provider profile is deliberately narrow; this is not generic memory or automatic workspace scraping.

## Test 3 — authoritative verification

1. Ask the model to run one reviewed verification command such as `bun run typecheck`, `bun run lint`, `bun test …`, or `bun run build`.
2. After the tool settles, inspect **Task → Verification**.
3. Expect a record with the real outcome and source adapter. Failed commands must say failed; assistant prose that merely says “tests passed” must create no record.
4. Add an owner observation from the form. Expect it to be labeled `owner`, never automated.
5. Quit and relaunch. Expect records to restore. A record whose source tool call is absent from the active branch must show stale and cannot support passed completion.

Pass when the ledger matches settled commands exactly and never upgrades unknown/prose evidence into a pass.

## Test 4 — evidence-backed completion

1. Ask the model to finish the task and submit `complete_task`.
2. Expect exactly one outcome per current acceptance criterion.
3. A criterion marked passed must link current passed verification. Missing, stale, cross-criterion, or fabricated IDs must make the tool return a recoverable validation error.
4. A failed criterion must keep Completion incomplete and must not expose **Accept disclosed gaps**.
5. An unverified criterion must include a candid note. The owner may click **Accept disclosed gaps** only when every non-passed criterion is unverified; the brief then shows completed with `accepted with gaps`.
6. Click **Reopen**. Expect a new active brief revision and the old completion to disappear; a completed brief cannot return to its editor without this explicit action.

Pass when completion is more conservative than the assistant’s narration and owner acceptance is explicit.

## Test 5 — lifecycle and isolation

1. Create two chats in the same workspace and give them different briefs.
2. Switch between them during/after runs. Expect each Task tile to show only its owning session.
3. Quit and relaunch; reopen both chats. Expect brief, latest evidence pack, ledger, and completion to restore from each Pi branch.
4. Archive and restore a chat. Expect Task state to follow the session.
5. Move a settled test chat to Trash. Expect the existing recoverable session removal to carry its Task entries; no separate Task database remains.

## Automated evidence already run

```bash
bun run typecheck                     # pass
bun run lint                          # pass, 8 unrelated warnings
bun test --timeout 20000              # 1,131 pass; 1 unrelated stale 42rem/48rem UI expectation
cd apps/desktop && bunx playwright test task.spec.ts
                                       # 1 pass
bun run build                          # pass
bun run package:mac                    # pass, unsigned macOS arm64 app
cd apps/desktop && bunx playwright test -c playwright.packaged.config.ts \
  --grep "persists the V5 Task journey"
                                       # 1 pass
bun run eval:v5                        # pass, 3 development + 3 holdout mechanics runs
git diff --check                       # pass (root and packages/pho-agent)
```

The focused post-hardening lanes pass 19 core tests and 27 product/UI/boundary tests. Restored malformed Task entries are ignored, already-aborted evidence providers cannot delay the run, and stale/newly failed verification reopens an otherwise completed assessment.

The full Electron lane reported 29 passes and 7 failures in unrelated concurrently edited approval/sandbox/starter/smoke expectations; `task.spec.ts` passed in that same run. The V5 implementation log records those failures without relabeling the full lane as passed.

## Evaluation interpretation

`bun run eval:v5` exercises the frozen mechanics adapter, Task state, evidence selector, verification honesty, completion coverage, and recovery. It is not a provider-quality result and used no provider calls or cost. Across all three repetitions:

- development: task success 1.0, recall 1.0, precision 0.857142857, forbidden rate 0, unsupported claims 0, false-pass rate 0, criterion coverage 1.0, recovery 1.0;
- holdout: all positive metrics 1.0 and all forbidden/unsupported/false-pass metrics 0;
- configuration fingerprint: `7ede9213c865fb1867dcc290bb16646521875670398c05f6e1f88ed9b4373cb4`.

Do not use these numbers to claim a real model improved. Your tests above decide whether the brief is useful, evidence is relevant, and the model invokes the contracts reliably.

## Acceptance follow-up

Record provider/model/thinking level and the observations for each test in a new dated V5 log. If the behavior is accepted, write the immutable V5 review, update accepted architecture, and archive V5. If anything fails, leave V5 in implementation and open a bounded correction log; do not rewrite the implementation evidence.
