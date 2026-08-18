# Composer todo chip and Plan checklist

Kind: change
Status: implemented; not accepted
Surface: composer footer; Plan document panel; transcript todo tool row
Owner: features/plan-agent (product); ui/conversation chrome (host rules only)
Owning plan: [`../../archive/features/plan-agent/implementation-plan.md`](../../archive/features/plan-agent/implementation-plan.md)
Related logs: [`2026-08-16-change-plan-sidebar.md`](./2026-08-16-change-plan-sidebar.md), [`2026-08-16-feedback-plan-rendered-markdown.md`](./2026-08-16-feedback-plan-rendered-markdown.md), [`../../archive/features/plan-agent/logs/2026-08-16-m2-todos.md`](../../archive/features/plan-agent/logs/2026-08-16-m2-todos.md), [`2026-08-18-bug-todo-plan-desync.md`](./2026-08-18-bug-todo-plan-desync.md)

## Intended change

Show the session todo list in Agent and Plan without a second dashboard: composer `n/m` chip in any mode, the same list on the Plan surface, and a compact checklist on the `todo` tool row.

## Expected / actual (before)

Expected: non-empty session todos show `completed/total` in the composer and the Plan rail.

Actual: snapshot `plan.todos` was always empty; no chip or checklist.

## Changes and decisions

- Composer chip is visible in Agent without opening Plan.
- Plan panel renders `snapshot.plan.todos` above the document.
- Latest `todo` tool row shows the checklist from that call’s input (untrusted text).

## Verification

Typecheck/lint recorded on the M2 feature log. Desktop not verified in this slice.

## Owner feedback

None yet.

## Handoff

Product semantics remain in [`../../archive/features/plan-agent/product.md`](../../archive/features/plan-agent/product.md). Reciprocal record: [`../../archive/features/plan-agent/logs/2026-08-16-m2-todos.md`](../../archive/features/plan-agent/logs/2026-08-16-m2-todos.md).
