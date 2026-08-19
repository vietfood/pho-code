# Milestone 1: bounded Stop

Status: accepted 2026-08-19; see [`2026-08-19-m1-acceptance-review.md`](./2026-08-19-m1-acceptance-review.md)  
Owner: urgent/agent-stop  
Plan: [`../implementation-plan.md`](../implementation-plan.md) Milestone 1  
Related logs: [`2026-08-16-research-handoff.md`](./2026-08-16-research-handoff.md), [`2026-08-19-m1-acceptance-review.md`](./2026-08-19-m1-acceptance-review.md), [`../../../ui/logs/2026-08-16-bug-stop-does-not-cancel-stuck-run.md`](../../../ui/logs/2026-08-16-bug-stop-does-not-cancel-stuck-run.md), [`../../window-first-pi-core/logs/2026-08-16-related-urgent-agent-stop.md`](../../window-first-pi-core/logs/2026-08-16-related-urgent-agent-stop.md)

## Intent

Make Stop return the chat to Send within a bounded deadline: cancel pending host dialogs, signal Pi abort without awaiting idle on the IPC path, publish `cancelled` after the deadline, and recover a still-busy session by reopening its controller from Pi JSONL.

## Contracts and files

- `packages/runtime/src/pi-runtime.ts` — bounded `abortRun`; new `abortSessionWithDeadline` and `reopenStuckController`; `watchPromptDone` no longer lets `run.promptDone` reject unhandled.
- `apps/desktop/src/App.tsx` — `onStop` now uses `runCommand(..., { busy: false })` so the global `busy` flag no longer stays set while Stop is in flight. The composer Stop button already had no `disabled` gate.
- `packages/runtime/test/pi-runtime.test.ts` — two new abort tests (below).
- `apps/desktop/tests/abort.spec.ts` — two new desktop Stop-click specs (below).
- Protocol, preload, and IPC: unchanged. `AbortRunInput` and the `abortRun` command shape are untouched; no cancelled-after-deadline detail flag was added.

## Changes and decisions

1. **Abort sequence.** `abortRun` sets `abortRequested`, calls `session.clearQueue()`, `extensionHost.cancelPending()`, `abortBash()` when `isBashRunning`, `abortRetry()`, `abortCompaction()`, then races `session.abort()` against a **1 000 ms** deadline (`ABORT_IDLE_DEADLINE_MS`). Call shapes verified against installed Pi `0.84.1` typings (`dist/core/agent-session.d.ts`).
2. **No `promptDone` on the IPC path.** Settlement is still observed by the existing `watchPromptDone` observer, which finishes the run when Pi later idles. `run.promptDone` is now non-rejecting so an abandoned prompt cannot produce an unhandled rejection.
3. **Deadline path.** When the deadline fires (or `abort()` throws), `abortRun` calls `finishRun` immediately, publishing `runSettled` with `status: "cancelled"` and an authoritative snapshot so the composer returns to Send. If the Pi session is still not `isIdle`, the controller is disposed (the run is already settled, so disposal skips the cooperative abort wait) and reopened from Pi JSONL under the same session id; a selected session is re-selected and republishes its snapshot. Session files are never deleted.
4. **Renderer busy flag.** `onStop` passes `{ busy: false }`; sidebar New session and other busy-gated controls are no longer blocked by a hung abort.
5. **Not done in this slice.** Escape-to-Stop (plan item 5, optional) is not implemented. Milestone 2 (Stop-all / Playwright teardown) is not started.

## Verification

- **integration verified:** `bun test` (full suite, 2026-08-19, this workspace): 652 pass / 17 fail across 139 files. The 17 failures are byte-identical to the clean-tree baseline (`git stash`, 650 pass / 17 fail) and are Cursor-sandbox environment restrictions (Seatbelt sandbox lanes, `mkdir ~/.pi` EPERM from late async `finishRun` after env restore, symlink-target and network probes). No previously-passing test regressed.
- Focused: `bun test packages/runtime/test/pi-runtime.test.ts` — `abort settles the run and allows another prompt` (existing, still green), `abort cancels a pending host dialog and admits a second prompt` (new: pending permission select is cancelled by Stop, run settles `cancelled`, second prompt admitted and settles), `abort returns within the deadline and reopens a session stuck in a tool gate` (new: tool_call gate that never settles; `abortRun` returns in ~1.4 s, publishes `cancelled`, reopens the controller, second prompt admitted and settles).
- **unit verified:** `bun run typecheck` (2026-08-19): all five packages exit 0. `bun run lint` (2026-08-19): 0 errors, 8 pre-existing `react-hooks/exhaustive-deps` warnings in files untouched by this slice.
- **desktop verified:** `bun run test:desktop` (2026-08-19, real Electron surface): **24 passed**, including the two new `tests/abort.spec.ts` specs — `Stop during a streaming run returns Send before the stream ends and keeps New session usable` (Stop click on `ABORT_ME` mid-stream; Send returns before `END_ABORT_STREAM`; sidebar New session stays enabled through the abort; a second prompt settles) and `Stop dismisses a pending permission card and returns Send` (Stop click with the `USE_SAFE_SHELL` permission dock visible; card dismissed; Send returns; a second prompt settles). These cover the plan's three desktop acceptance items.
- **not verified:** packaged lane (not required: no protocol/preload/packaged-resource change). Owner manual start-to-end pass is the remaining acceptance step.

## Mistakes and corrections

None yet. The pre-existing late-`finishRun` test-isolation leak (a background settle firing after `PI_CODING_AGENT_DIR` is restored, hitting `~/.pi`) was observed while classifying failures; it is masked outside the Cursor sandbox and is not caused by this slice. It is recorded here, not fixed here.

## Owner feedback

Owner first scoped the slice to `bun test` only, then asked for the full gate (`typecheck`, `lint`, `bun test`, `test:desktop`) and will run a manual start-to-end pass themselves before acceptance.

## UI impact

Composer Stop no longer sets the global `busy` flag. Stop remains clickable while an abort is in flight. No chrome changes; Escape-to-Stop deferred.

## Blockers and handoff

Milestone 1 is **not accepted**: every automated acceptance item now has evidence (runtime integration tests, desktop Stop-click specs, typecheck, lint, full desktop lane), but the owner will run a manual start-to-end pass before acceptance. Next check: owner manual run; on acceptance, one integrator records the review, updates `current-state.md` / architecture to describe bounded Stop as accepted behavior, and only then opens Milestone 2 (Stop-all / Playwright teardown).
