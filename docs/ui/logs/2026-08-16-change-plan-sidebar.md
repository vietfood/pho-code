# Plan surface and composer Plan/Agent control

Kind: change
Status: implemented; not accepted
Surface: composer footer; right sidebar host; Plan document panel
Owner: features/plan-agent (product); ui/conversation chrome (host rules only)
Owning plan: [`../../archive/features/plan-agent/implementation-plan.md`](../../archive/features/plan-agent/implementation-plan.md)
Related logs: [`2026-08-16-decision-plan-sidebar-surface.md`](./2026-08-16-decision-plan-sidebar-surface.md), [`2026-08-16-change-right-sidebar-surface-toggle.md`](./2026-08-16-change-right-sidebar-surface-toggle.md), [`2026-08-16-change-ask-user-card.md`](./2026-08-16-change-ask-user-card.md), [`../../archive/features/plan-agent/logs/2026-08-16-m1-plan-agent.md`](../../archive/features/plan-agent/logs/2026-08-16-m1-plan-agent.md)

## Intended change

Add a Plan document surface on the existing right sidebar and a composer Plan/Agent control. Conversation UI keeps host chrome only (exhaustive surface, re-click collapse, no dedicated Collapse control).

## Expected / actual (before)

Expected: `"plan"` on `RightSidebarSurface` with the same host rules as Changes / Context prompt.

Actual: surfaces were `"changes" | "context-prompt"`. No Plan rail or composer mode control.

## Changes and decisions

- Surface union is `"changes" | "context-prompt" | "plan"`. Re-click of Plan hides the panel.
- Plan panel: sanitized markdown preview while Execute is live; owner textarea + Save while idle. Execute / Stay / Refine on the panel.
- Composer select next to thinking. Plan shows a compact “Writes off” mark. No sandbox claim.
- Switching to Plan opens the Plan surface.

## Verification

Unit: right-sidebar exhaustive switch including `"plan"`. Desktop not verified in this slice.

## Owner feedback

None yet.

## Handoff

Product semantics remain in [`../../archive/features/plan-agent/product.md`](../../archive/features/plan-agent/product.md). Reciprocal record: [`../../archive/features/plan-agent/logs/2026-08-16-m1-plan-agent.md`](../../archive/features/plan-agent/logs/2026-08-16-m1-plan-agent.md).
