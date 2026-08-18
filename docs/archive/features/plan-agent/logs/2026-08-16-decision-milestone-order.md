# Implementation order: ask-back, then Plan/Agent, then todos

Status: ready for review  
Owner: features/plan-agent  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`2026-08-16-promotion.md`](./2026-08-16-promotion.md), [`2026-08-16-decision-session-todos.md`](./2026-08-16-decision-session-todos.md), [`../../../../ui/logs/2026-08-16-decision-plan-sidebar-surface.md`](../../../../ui/logs/2026-08-16-decision-plan-sidebar-surface.md)

## Intent

Replace the previous milestone sequence with an owner-testable order. The product is unchanged.

## Contracts and files

- Plan: [`../implementation-plan.md`](../implementation-plan.md)
- Product: [`../product.md`](../product.md) (todo tool name picked in Milestone 2)

## Changes and decisions

Owner order (2026-08-16):

0. **Ask-back** in the running app (questionnaire card, so it can be tested).
1. **Full Plan and Agent** (hardest): modes, tool policy, Plan document, Execute / Stay / Refine.
2. **Cursor-style todo tool**, same list in Agent and Plan.
3. Packaged honesty remains the acceptance wrap, not a fourth product.

The earlier plan registered todos and Plan policy in Milestone 0 and delayed the ask-back card. That is reversed.

## Verification

Not verified: implementation has not started.

## Mistakes and corrections

Do not treat Milestone 0 as “envelope only.” The owner wants to click A/B/C in Electron. Sequential `select`/`input` is fallback, not the M0 UX.

## Owner feedback

Ask-back first so it can be tested. Plan/Agent next because it is hardest. Todos last, Cursor-shaped.

## UI impact

Milestone 0 adds the questionnaire card only. Plan toggle and Plan sidebar wait for Milestone 1. Todo chip waits for Milestone 2.

## Blockers and handoff

Start Milestone 0 with the factory + `questionnaire` host dialog + card. Do not block it on Plan mode or todos.
