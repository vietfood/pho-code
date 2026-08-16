# Related: urgent agent-stop is not window-first

Status: ready for review  
Owner: urgent/window-first-pi-core  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`../../agent-stop/logs/2026-08-16-research-handoff.md`](../../agent-stop/logs/2026-08-16-research-handoff.md)

## Intent

Cross-link the new urgent Stop track so agents do not fold bounded `abortRun` into first-paint or `utilityProcess` work.

## Contracts and files

- Window-first product: [`../product.md`](../product.md) — window before `ModelRuntime.create`; later crash isolation
- Agent-stop product: [`../../agent-stop/product.md`](../../agent-stop/product.md) — bounded in-process Stop; not crash isolation

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

Window-first remains proposed. Agent-stop remains proposed. Neither waits on the other.
