# Plan / Agent and ask-user promotion

Status: ready for review  
Owner: features/plan-agent  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`../../../ui/logs/2026-08-16-decision-plan-sidebar-surface.md`](../../../ui/logs/2026-08-16-decision-plan-sidebar-surface.md), [`../../../ui/logs/2026-08-16-change-right-sidebar-surface-toggle.md`](../../../ui/logs/2026-08-16-change-right-sidebar-surface-toggle.md), [`../../sandbox/logs/2026-08-16-promotion.md`](../../sandbox/logs/2026-08-16-promotion.md), [`2026-08-16-decision-session-todos.md`](./2026-08-16-decision-session-todos.md), [`2026-08-16-decision-milestone-order.md`](./2026-08-16-decision-milestone-order.md)

## Intent

Record owner decisions that close the Plan/Agent research note and promote an **end-to-end** add-on product plus implementation plan. Implementation has not started.

## Contracts and files

- Product: [`../product.md`](../product.md)
- Plan: [`../implementation-plan.md`](../implementation-plan.md)
- Research retained as [`../research.md`](../research.md)
- Stub: [`../../plan-agent.md`](../../plan-agent.md)

## Changes and decisions

Owner answers (2026-08-16):

1. Ask is **ask-back**, same idea as juicesharp / Claude: the model pauses with A, B, C (or D) plus **Type something**. Not Cursor Ask mode.
2. Reuse juicesharp **schema, envelope, validation, guidelines, and RPC fallback** inside a Pho-owned factory. Do not bake the npm package.
3. **One add-on**, not two. Plan, ask-back, and the Plan document ship together.
4. **End-to-end product**, not a toggle-only first slice. The questionnaire card and Plan sidebar are required for acceptance (Milestones 2 and 3), the same way sandbox’s file-tool policy is required.
5. Composer Plan/Agent toggle. Ask-user stays available in Agent; Plan only makes the model use it more.
6. No Pi bash regex allowlist. Plan is write-tool policy, not a sandbox.
7. Plan document on the existing right sidebar (markdown/mermaid). Session todos are the same add-on, in **both** Agent and Plan — see [`2026-08-16-decision-session-todos.md`](./2026-08-16-decision-session-todos.md). Not a live React canvas compiler.

## Verification

Not verified: every implementation and acceptance check in the plan-agent plan remains outstanding.

## Mistakes and corrections

The research note offered sequential `select`/`input` as the first-slice UX. That split is rejected. Sequential dialogs are fallback only.

Do not describe this promoted plan as shipped. Do not call Plan a sandbox. Do not call ask-user a permission.

## Owner feedback

Ask-back like juicesharp/Claude (choose A/B/C or type an answer). Like the research direction. Want a full plan in the sandbox add-on shape, not a first slice.

## UI impact

- Composer footer Plan/Agent control.
- Questionnaire card distinct from the permission dock.
- Right-sidebar surface `"plan"` with the same host rules as Changes / Context prompt / Terminal.

## Blockers and handoff

Superseded for sequence by [`2026-08-16-decision-milestone-order.md`](./2026-08-16-decision-milestone-order.md): Milestone 0 is the ask-back card; Plan/Agent is Milestone 1; todos are Milestone 2.
