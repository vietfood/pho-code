# Milestone 2: Stop-all and test teardown

Status: in implementation; all automated gates pass, owner manual acceptance pending  
Owner: urgent/agent-stop  
Plan: [`../implementation-plan.md`](../implementation-plan.md) Milestone 2  
Related logs: [`2026-08-19-m1-bounded-stop.md`](./2026-08-19-m1-bounded-stop.md), [`2026-08-19-m1-acceptance-review.md`](./2026-08-19-m1-acceptance-review.md)

## Intent

Owner can cancel every live run from one control, and Playwright close does not wait on a stuck abort.

## Contracts and files

- `packages/runtime/src/pi-runtime.ts` — `disposeLiveSession` now uses the same bounded abort as `abortRun` (`clearQueue`, `abortBash` when running, `abortRetry`, `abortCompaction`, then `abortSessionWithDeadline`) instead of awaiting `session.abort()` plus `promptDone` without a deadline. Shutdown and controller eviction can no longer hang on `waitForIdle`/`promptDone`.
- `apps/desktop/src/App.tsx` — `liveRuns` derived from the existing `cache.activity` stream (`runId` present and phase `working`/`attention`); new `onStopAll` loops the existing `abortRun` command over every live row via `Promise.allSettled`, with `{ busy: false }` like composer Stop.
- `packages/ui/src/app-sidebar.tsx` — conditional `Stop all` row under Open folder, visible only while at least one run is live; shows the count when more than one (`Stop all (2)`); never disabled by `busy`.
- `apps/desktop/tests/helpers/electron-app.ts` — new `stopRunsAndClose(page, harness)` teardown: clicks Stop on the selected chat when live, waits for Send, clicks `stop-all` when visible and waits for it to disappear, then closes; fails with `run did not cancel` when a deadline is exceeded.
- `apps/desktop/tests/abort.spec.ts` — new desktop spec (below).
- Protocol, preload, and IPC: unchanged. The plan's preferred option (renderer loop over live activity rows) was chosen over a named `abortAllRuns` command; no new command exists. No renderer-exposed process kill.

## Changes and decisions

1. **Loop, not a command.** `SessionActivitySummary` already carries `runId` and `phase`, so the renderer loops `abortRun` per live row. A single `abortAllRuns` command would be smaller only in call count, not in contract surface, so the plan's preference holds.
2. **Bounded dispose.** `AgentSessionRuntime.dispose()` in Pi `0.84.1` is synchronous after a shutdown event and does not wait on the agent loop (verified in `dist/core/agent-session-runtime.js` / `agent-session.js`), so the only unbounded close wait was the harness's own `abort()` + `promptDone` await in `disposeLiveSession`. It now shares the 1 000 ms `ABORT_IDLE_DEADLINE_MS` race. The Electron `runBoundedShutdown` 5 s cap is unchanged and remains the outer backstop, not the primary mechanism.
3. **Chrome.** Stop-all is a sidebar row (not composer, not collapsed pill) because it addresses background chats; it renders only while a live run exists and stays enabled during `busy`, matching the Stop-must-stay-clickable rule.
4. **Not done in this slice.** No Escape-to-Stop (still unpromoted from Milestone 1 item 5). Existing specs were not migrated to `stopRunsAndClose`; none of them leave a live run at close today.

## Verification

- **integration verified:** `bun test` (full suite, 2026-08-19): 653 pass / 17 fail — the 17 are the same Cursor-sandbox environment failures as the clean-tree baseline; no regression. New test `dispose returns within the deadline with a run stuck in a tool gate`: `runtime.dispose()` with a never-settling tool gate returns in ~1.4 s.
- **unit verified:** `bun run typecheck` all five packages exit 0; `bun run lint` 0 errors (8 pre-existing warnings in untouched files).
- **desktop verified:** `bun run test:desktop` (2026-08-19): **25 passed**, including the new `tests/abort.spec.ts` spec `Stop all cancels a background run and close stays bounded` — session A stuck behind a permission dock (attention), session B streaming `ABORT_ME`; `stop-all` shows `Stop all (2)`; composer Stop cancels B and Send returns while `Stop all` remains for A; `stopRunsAndClose` cancels A through the Stop-all row and `harness.close()` completes well inside the 60 s Playwright test timeout (whole spec 4.4 s).
- **not verified:** packaged lane (not required: no protocol/preload/packaged-resource change).

## Mistakes and corrections

None.

## Owner feedback

Owner accepted Milestone 1 and directed the track to Milestone 2 (2026-08-19).

## UI impact

New conditional sidebar row `Stop all` (with count when > 1) while any run is live, including background chats stuck on a permission or ask-user card. No other chrome changes. Logged in [`../../../ui/logs/2026-08-19-change-sidebar-stop-all.md`](../../../ui/logs/2026-08-19-change-sidebar-stop-all.md).

## Blockers and handoff

Milestone 2 is **not accepted**: every automated acceptance item has evidence (two live chats, Stop on the selected one, Stop-all cancels the background one, bounded close; bounded dispose integration test), but owner manual confirmation is the remaining step. On acceptance, the track gate is satisfiable: update `current-state.md` and the track README, then the track can close with crash isolation still owned by window-first Milestone 3.
