# Milestone 1 acceptance review: bounded Stop

Status: accepted 2026-08-19  
Owner: urgent/agent-stop  
Plan: [`../implementation-plan.md`](../implementation-plan.md) Milestone 1  
Evidence log: [`2026-08-19-m1-bounded-stop.md`](./2026-08-19-m1-bounded-stop.md)

## Verdict

Milestone 1 (bounded Stop) is **accepted**. Owner reviewed the green automated gate and directed the track to move to Milestone 2 ("Cool, move to next milestone", 2026-08-19).

## Gate evidence (all checks ran 2026-08-19, this workspace)

- `bun run typecheck` — all five packages exit 0.
- `bun run lint` — 0 errors; 8 pre-existing `react-hooks/exhaustive-deps` warnings in files untouched by the milestone.
- `bun test` — 652 pass / 17 fail; the 17 failures are byte-identical to the clean-tree baseline and are Cursor-sandbox environment restrictions, not regressions.
- `bun run test:desktop` — 24 passed, run twice independently, including `tests/abort.spec.ts`:
  - Stop click on `ABORT_ME` mid-stream returns Send before `END_ABORT_STREAM`; sidebar New session stays enabled through the abort; a second prompt settles.
  - Stop click with a visible permission card dismisses the card and returns Send; a second prompt settles.
- Runtime integration: abort with a pending host dialog settles `cancelled` and admits a second prompt; abort past the 1 s deadline publishes `cancelled` and reopens the stuck controller from Pi JSONL; existing `ABORT_ME` abort test still passes.

## Accepted behavior (now current architecture)

- `abortRun` sets `abortRequested`, clears the Pi queue, cancels pending host dialogs (`extensionHost.cancelPending()`), calls `abortBash()` when bash is running, `abortRetry()`, `abortCompaction()`, then races `session.abort()` against a 1 000 ms deadline (`ABORT_IDLE_DEADLINE_MS`).
- The IPC path never awaits `promptDone`; settlement is observed in the background. When the deadline fires, the runtime publishes `runSettled` with `status: "cancelled"` and an authoritative snapshot so the composer returns to Send; a still-busy Pi session is recovered by disposing and reopening its controller from Pi JSONL under the same session id. Session files are never deleted.
- Composer Stop never raises the global `busy` flag, so sidebar controls stay usable while an abort is in flight.
- Protocol, preload, and IPC shapes are unchanged.

## Known limits carried forward

- Stop cannot survive a dead or busy-looping main-process Pi; crash isolation stays with [`../../window-first-pi-core/`](../../window-first-pi-core/README.md) Milestone 3.
- Escape-to-Stop (plan item 5, optional) was not implemented and remains unpromoted.
- Stop-all for multiple live runs and Playwright close teardown are Milestone 2 scope.
