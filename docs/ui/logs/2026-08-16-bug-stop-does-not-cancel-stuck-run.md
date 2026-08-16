# Stop does not cancel a stuck run

Status: open  
Surface: composer Stop / live run  
Owner: [`urgent/agent-stop`](../../urgent/agent-stop/README.md)  
Owning plan: [`../../urgent/agent-stop/implementation-plan.md`](../../urgent/agent-stop/implementation-plan.md)  
Related logs: [`../../urgent/agent-stop/logs/2026-08-16-research-handoff.md`](../../urgent/agent-stop/logs/2026-08-16-research-handoff.md)

## Expected

While a run is live, Stop cancels that run. Permission and ask-user cards for that session dismiss. The composer returns to Send. A later prompt is admitted. Tests can click Stop instead of waiting for the agent to finish or hanging until the spec timeout.

## Actual

Stop calls `abortRun`, which awaits Pi `session.abort()` (`waitForIdle`) and then `promptDone`. A stuck tool, ignored abort, or pending host dialog can leave the IPC outstanding. `onStop` also sets global `busy`. Desktop specs never click Stop; they use `ABORT_ME` as a long stream that is allowed to finish.

If Pi busy-loops or crashes in Electron main, the window is stuck or gone. That is not this bug; see [`urgent/window-first-pi-core`](../../urgent/window-first-pi-core/README.md) Milestone 3.

## Reproduction / evidence

1. Start a live run that opens a permission or ask-user card, or a long `ABORT_ME` stream.
2. Click Stop.
3. Observe: Stop may appear to do nothing until Pi becomes idle; sidebar `busy` can stay true.

Source: `packages/runtime/src/pi-runtime.ts` `abortRun`; `apps/desktop/src/App.tsx` `onStop`; Pi `0.84.1` `AgentSession.abort()`.

Not verified: a timed hung-bash Electron click. That is Milestone 1 of the urgent plan.

## Changes and decisions

None in source. Track opened 2026-08-16.

## Verification

Not verified: bounded Stop. Runtime abort on cooperative `ABORT_ME` is v1 evidence, not this defect’s fix.

## Mistakes and corrections

Do not treat “Stop exists in the composer” as “Stop cancels stuck work.” Do not treat this as a sandbox or `utilityProcess` prerequisite.

## Fix or handoff

Implement Milestone 1 in the urgent plan. Do not wait on window-first first paint.
