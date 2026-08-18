# Session todos belong in this add-on, both modes

Status: ready for review  
Owner: features/plan-agent  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`2026-08-16-promotion.md`](./2026-08-16-promotion.md)

## Intent

Close whether Cursor-style agent todos are a second add-on or Plan-only.

## Contracts and files

- Product: [`../product.md`](../product.md) (Session todos)
- Plan: [`../implementation-plan.md`](../implementation-plan.md) Milestone 2

## Changes and decisions

Owner question (2026-08-16): give the agent a todo list as in Cursor — standalone, or embed in Plan mode?

**Selected: embed in this add-on; do not restrict to Plan.**

Cursor todos are a session checklist the model writes in **Agent** (`TodoWrite`: pending / in_progress / completed). Plan Execute is the same list, not a second store. Ask-user already follows this pattern (tool in both modes).

Pi `examples/extensions/todo.ts` supplies persist: reconstruct from tool-result details on the branch. Do not bake that TUI `/todos` overlay.

Rejected:

- a standalone todos feature (duplicate factory, protocol, chrome);
- Plan-only todos (misses the Cursor Agent-mode list).

## Verification

Not verified: implementation has not started.

## Mistakes and corrections

The promotion contract treated todos as Plan-surface/Execute chrome. That under-specified Cursor Agent todos. This decision corrects the product. Implementation order later moved the tool to Milestone 2 ([`2026-08-16-decision-milestone-order.md`](./2026-08-16-decision-milestone-order.md)).

## Owner feedback

Asked whether todos are another standalone or Plan-embedded.

## UI impact

Composer `n/m` chip and a compact transcript checklist in any mode when the list is non-empty. Plan sidebar renders the same list.

## Blockers and handoff

Milestone 2 registers `todo`. That milestone is not done until Agent-mode todos work without opening Plan.
