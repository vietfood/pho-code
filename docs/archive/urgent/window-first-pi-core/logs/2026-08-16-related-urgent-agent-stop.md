# Related: urgent agent-stop is not window-first

Status: ready for review  
Owner: urgent/window-first-pi-core  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`agent-stop research`](../../agent-stop/logs/2026-08-16-research-handoff.md), [`agent-stop closure`](../../agent-stop/logs/2026-08-20-m2-acceptance-and-closure.md)

## Intent

Cross-link the new urgent Stop track so agents do not fold bounded `abortRun` into first-paint or `utilityProcess` work.

## Contracts and files

- Window-first product: [`../product.md`](../product.md) — window before `ModelRuntime.create`; later crash isolation
- Agent-stop product: [`agent-stop`](../../agent-stop/product.md) — accepted bounded in-process Stop; not crash isolation

## Changes and decisions

No window-first contract change. Agent-stop Milestone 1 must not become a prerequisite for window-first Milestone 1. Window-first Milestone 3 remains the only queued hard-kill / child-crash path. Agent-stop must not spawn `utilityProcess`.

## Verification

Not verified: documentation-only reciprocal link.

## Mistakes and corrections

Do not describe bounded Stop as “if Pi dies the UI stays up.” That sentence belongs to Milestone 3 on this track.

## Owner feedback

Owner asked to queue Stop as urgent after reporting stuck agents in testing, separately from long startup.

## UI impact

None.

## Blockers and handoff

Window-first Milestone 1 is implemented and desktop verified as of 2026-08-20, with packaged acceptance still pending. Agent-stop closed and moved to archive the same day. Crash isolation remains here as Milestone 3.
