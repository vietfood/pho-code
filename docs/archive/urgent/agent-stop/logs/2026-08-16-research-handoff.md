# Agent stop research handoff

Status: ready for review  
Owner: urgent/agent-stop  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`UI bug`](../../../../ui/logs/2026-08-16-bug-stop-does-not-cancel-stuck-run.md), [`window-first cross-link`](../../window-first-pi-core/logs/2026-08-16-related-urgent-agent-stop.md), [`plan-agent cross-link`](../../../features/plan-agent/logs/2026-08-16-related-urgent-agent-stop.md), [`sandbox cross-link`](../../../features/sandbox/logs/2026-08-16-related-urgent-agent-stop.md), [`sandbox settings`](../../../features/sandbox/logs/2026-08-16-m1-settings.md)

## Intent

Record 2026-08-16 owner research: Stop and crash isolation are different jobs. Queue bounded in-process abort as an urgent track. Leave `utilityProcess` on window-first Milestone 3.

## Contracts and files

- Product: [`../product.md`](../product.md)
- Plan: [`../implementation-plan.md`](../implementation-plan.md)
- Queue: [`../../README.md`](../../README.md)
- Evidence in source: `packages/runtime/src/pi-runtime.ts` `abortRun`; `apps/desktop/src/App.tsx` `onStop`; `packages/ui/src/composer.tsx` Stop; Pi `0.84.1` `AgentSession.abort()` = `abortRetry` + `agent.abort` + `waitForIdle`
- Desktop tests: `apps/desktop/tests/session-lifecycle.spec.ts` uses `ABORT_ME` as a long stream and never clicks Stop

## Changes and decisions

1. **Urgent track, not a feature add-on.** Stop already exists; the hang is a safety defect in `abortRun`.
2. **Two jobs.** Cooperative/bounded Stop is this track. Pi death taking the window is window-first Milestone 3.
3. **Do not await idle on IPC.** `session.abort()` waits for idle; `abortRun` then waits for `promptDone`. pi-gui marks idle after best-effort abort.
4. **`abortRun` does not `cancelPending()`.** Dispose does. Permission/ask-user can keep idle from arriving.
5. **`abort()` does not call `abortBash()`.** A live bash child can outlast Stop.
6. **No desktop Stop click.** Runtime `ABORT_ME` abort is the only proof. Owner testing cannot stop a stuck agent.
7. **Do not block** terminal, Plan/Agent, sandbox, or window-first on this track.

## Verification

Not verified: clicking Stop in Electron against a hung dialog or bash. Runtime abort-on-`ABORT_ME` remains historical evidence from v1, not this track’s gate.

Code-path evidence is from reading source and Pi `0.84.1` typings/dist on 2026-08-16.

## Mistakes and corrections

Do not describe renderer `sandbox: true` as letting Stop survive a dead Pi. Do not fold this track into the sandbox add-on or into window-first first-paint work. Do not switch the product to `pi --mode rpc` to get cancellation.

## Owner feedback

Owner asked for the ability to stop the agent and everything, for runtime isolation if Pi dies, and reported that during testing they cannot stop a stuck agent. Owner then asked to place this on the urgent plan, not as a later feature.

## UI impact

Composer Stop behavior will change in Milestone 1 (busy flag, possible Escape). No UI change in this documentation-only slice.

## Blockers and handoff

Implementation starts when the owner promotes Milestone 1. Architecture pages must keep describing unbounded `abortRun` until that milestone is accepted. Crash isolation stays queued on window-first Milestone 3.
