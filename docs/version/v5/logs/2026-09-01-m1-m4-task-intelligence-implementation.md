# V5 M1–M4 Task intelligence implementation

Date: 2026-09-01
Status: Implemented and machine-verified; owner real-model verification pending ([handoff](../handoff.md))
Owner: repository owner
Scope: V5 M1–M4

## Owner direction

Implement the remaining V5 Task intelligence end-to-end and provide a later owner-test handoff because no model is currently available. This explicitly resumes implementation despite the 2026-08-28 hold and groups the milestone implementation gates, as the owner previously directed for compaction. It does not waive real-model acceptance, accept the backend foundation, or absorb V4.

## Implemented contracts

- Added backend-neutral Task Brief, evidence, verification, and completion protocol types and strict bounds under `@pho-agent/protocol`.
- Added append-only Pi active-branch projection for `pho-agent.task-brief`, `pho-agent.evidence-pack`, `pho-agent.verification`, and `pho-agent.completion`, including compare-and-set edits, tombstone reset, reopen, composite scope/session ownership, source-call validation, deterministic dedupe, and completion invalidation.
- Added `update_task_brief` and `complete_task` to the reusable Task feature. Plan keeps both state tools while still removing accepted write/Cursor tools. Pho Code approval policy treats them as contained baked state operations.
- Added concurrent evidence collection with eight-provider/64-candidate/24-item/64-KiB bounds, restricted-source exclusion, stable ordering/dedupe, hidden untrusted JSON injection, 5-second provider and 10-second aggregate defaults, and an abort race that also bounds providers that ignore their signal.
- Added a registered settled-command verification adapter for the deterministic harness and reviewed test/typecheck/lint/build command families. Explicit owner records remain labeled owner. Missing authoritative source calls restore as stale.
- Added criteria-exact completion validation. Passed requires current compatible passed verification; failed cannot be accepted; unverified requires a note and an idle owner command.
- Added `AgentSessionSnapshot.task`, the `task-intelligence` capability, five host/runtime/application/IPC/preload commands, and external-adapter routing only when supported.
- Added Pho Code's initial narrow session-verification evidence provider and composed the Task feature even with the deterministic empty feature manifest.
- Added the Task right-sidebar tile with Brief editor, evidence disclosures, ledger/owner form, completion, reset/reopen/gap acceptance, present badge, live-run inspect-only behavior, and automatic reveal on first brief.
- Added a deterministic candidate evaluation command while preserving the prior M0 runner as `eval:v5:baseline`.

No generic memory, hidden workspace crawl, Pho Research behavior, terminal evidence, subagent orchestration, V4 process extraction, signing, update, or release contract was added. Pi is the first native Task adapter; Codex/ACP capabilities remain honest and absent.

## Verification run

| Class | Command | Result |
| --- | --- | --- |
| Focused core | `cd packages/pho-agent && bun test packages/runtime/test/task-evidence.test.ts packages/runtime/test/task-state.test.ts packages/runtime/test/plan-agent-state.test.ts --timeout 20000` | PASS — 19 tests after restore/abort/completion hardening |
| Focused product | `bun test packages/runtime/test/task-runtime.test.ts packages/ui/test/task-panel.test.ts packages/ui/test/right-sidebar.test.ts apps/desktop/tests/unit/package-boundaries.test.ts --timeout 20000` | PASS — 27 tests |
| Types | `bun run typecheck` | PASS — all workspace packages |
| Lint | `bun run lint` | PASS — 0 errors, 8 unrelated hook warnings |
| Full unit | `bun test --timeout 20000` outside the filesystem sandbox | QUALIFIED — 1,131 pass, 1 unrelated failure: `appearance-theme.test.ts` still expects the prior 42rem empty-session width while current CSS is 48rem |
| Task desktop | `cd apps/desktop && bunx playwright test task.spec.ts` | PASS — 1 test; manual brief, evidence, automatic verification, incomplete completion, owner acceptance, relaunch restore |
| Full desktop | `cd apps/desktop && bunx playwright test` | QUALIFIED — 29 pass, 7 unrelated failures in concurrent approval/sandbox/starter/smoke expectations; V5 Task passed |
| Build | `bun run --filter @pho-code/desktop build` and `bun run build` equivalent | PASS |
| Package | `bun run package:mac` outside the sandbox for the approved Trash staging step | PASS — unsigned `mac-arm64/Pho Code.app` |
| Task packaged | `cd apps/desktop && bunx playwright test -c playwright.packaged.config.ts --grep "persists the V5 Task journey"` | PASS — 1 test, PATH without Pi CLI and relaunch restore |
| Diff hygiene | `git diff --check` and `git -C packages/pho-agent diff --check` | PASS |

The first sandboxed package run failed only because macOS denied Trash access to generated `apps/desktop/resources/features`; the approved outside-sandbox rerun passed. The first sandboxed full-unit run similarly could not exercise Seatbelt/home fixtures; the outside-sandbox run passed every sandbox test.

## Deterministic evaluation

`bun run eval:v5` passed three development and three frozen-holdout repetitions.

| Cohort | Task | Recall | Precision | Forbidden | Unsupported | False pass | Coverage | Recovery |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Development (each run) | 1 | 1 | 0.857142857 | 0 | 0 | 0 | 1 | 1 |
| Holdout (each run) | 1 | 1 | 1 | 0 | 0 | 0 | 1 | 1 |

- configuration fingerprint: `7ede9213c865fb1867dcc290bb16646521875670398c05f6e1f88ed9b4373cb4`;
- development fixture checksum: `2a1e6bfb54ba1bad8969ae0bb34f32ad41054fe2090d6fc14d930e249cff9662`;
- holdout fixture checksum: `78b646b5af35bb20e00414a1dace2b89054e43eb9df26c11ec37b3f603601929`.

The runner uses deterministic mechanics and zero provider calls/cost. It proves the frozen state/selection/honesty/recovery contract, not real-provider quality or model improvement.

## Corrections made during the slice

- Replaced an await-only provider timeout with an abort race so a provider that ignores `AbortSignal` cannot hold prompt admission indefinitely.
- Updated the obsolete M0 boundary assertion from “Task surfaces must not exist” to the current one-way package boundary.
- Added explicit contained-policy classification for Task state tools.
- Added restart source validation so a missing tool call makes a record stale rather than silently retaining current passed authority.
- Replaced permissive persisted-state casts with bounded field-by-field evidence, verification, and completion parsing; malformed custom entries now fail closed.
- Made an already-aborted run end evidence collection immediately and isolated a broken verification adapter from the authoritative tool result.
- Invalidated ready/owner-accepted completion when linked passed evidence becomes stale or a current criterion failure contradicts an accepted gap.
- Required explicit Reopen before a completed Brief can return to its editable active state.
- Split the V5 packaged smoke from an unrelated broad test whose concurrent approval-mode setup no longer exposed Full mode.

## Handoff and remaining gate

The owner real-model cohort and Task-surface review in [`../handoff.md`](../handoff.md) remain required. V5 is not accepted or archived. After owner evidence, one integrator must resolve or explicitly disposition the unrelated full-suite failures, run the complete clean exit matrix, write the acceptance review, and then update accepted architecture/archive indexes.
