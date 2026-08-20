# Milestone 2 acceptance and agent-stop closure

Status: accepted and archived 2026-08-20
Owner: archived urgent/agent-stop
Plan: [`../implementation-plan.md`](../implementation-plan.md) Milestone 2
Evidence log: [`2026-08-19-m2-stop-all-and-teardown.md`](./2026-08-19-m2-stop-all-and-teardown.md)

## Verdict

Milestone 2 and the complete agent-stop urgent track are **accepted**. The owner asked to audit the work, finish it if necessary, and archive it when complete. Source inspection found no missing implementation item, and fresh focused checks confirmed the accepted behavior. The track moved from `docs/urgent/agent-stop/` to `docs/archive/urgent/agent-stop/`.

Crash isolation is deliberately not part of this acceptance. A dead or busy-looping Pi can still freeze Electron main; archived [`window-first-pi-core`](../../window-first-pi-core/README.md) later deferred process extraction to roadmap Phase F.

## Accepted behavior

- Composer Stop cancels a selected live run without raising the global `busy` flag.
- Pending permission and ask-user dialogs are cancelled with their run.
- Abort and live-controller disposal use the 1,000 ms Pi-idle race instead of waiting without a bound on `waitForIdle` or `promptDone`.
- A still-busy controller is reopened from the same Pi JSONL session without deleting session data.
- The conditional sidebar **Stop all** action loops the existing narrow `abortRun` command over all working/attention rows, including background chats. No `abortAllRuns` or renderer process-kill command was added.
- Repository-owned Electron teardown can stop selected and background runs before closing.

## Fresh verification

Run 2026-08-20 in this workspace:

- **integration verified:** the relevant cases in `bun test ./packages/runtime/test/pi-runtime.test.ts` passed: cooperative abort, pending-dialog cancel plus second prompt, stuck-gate deadline plus controller reopen, and bounded runtime disposal. The complete file reported 23 pass / 4 fail; all four failures are the already-recorded late `finishRun` test-isolation leak restoring `PI_CODING_AGENT_DIR` before background settlement and attempting `~/.pi` in the restricted environment. They are not agent-stop failures. The suite was not rerun outside the sandbox because doing so could write to the owner's real Pi directory.
- **repository test lane classified:** `bun test` reported **659 pass / 13 fail**. The failing aggregate was not called green: it contains one baked-resource staging timeout plus the previously documented Pi-runtime isolation and host sandbox classes. No agent-stop acceptance spec failed.
- **desktop verified:** after the focused `bunx playwright test tests/abort.spec.ts` passed **3/3**, the complete `bun run test:desktop` lane passed **25/25** in the real Electron surface, including streaming Stop, selected plus background Stop-all with bounded close, and pending-permission cancellation. The desktop test command built source Vite bundles as its test prerequisite; it did not package the app.
- **static checks verified:** `bun run typecheck` passed. `bun run lint` completed with zero errors and eight pre-existing React hook warnings in untouched source files.
- **source build verified:** `bun run build` passed before the complete desktop lane.
- **historical gate:** the implementation log records the earlier typecheck, lint, full unit/integration baseline comparison, and 25-test desktop pass on 2026-08-19.
- **not run:** packaged build/test. Agent-stop changed no protocol, preload, packaged resource, native dependency, credential, or data-root boundary, and the owner explicitly asked not to build a package on this machine.

## Documentation closure

Living accepted behavior remains in [`runtime-and-data.md`](../../../../architecture/runtime-and-data.md), [`overview.md`](../../../../architecture/overview.md), [`desktop-shell.md`](../../../../architecture/desktop-shell.md), [`current-state.md`](../../../../current-state.md), and the conversation UI record. Historical product, plan, and implementation logs remain together in this archive.

## Known limits

- The Stop-all teardown helper waits up to 15 seconds for UI settlement; it proves bounded completion but does not assert the exact 1,000 ms internal idle deadline.
- Escape-to-Stop was optional and was never promoted.
- A main-process Pi crash or busy loop still requires process isolation, not another cooperative abort path.
