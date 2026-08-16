# Plan document as a right-sidebar surface

Kind: decision  
Status: planned; not implemented  
Surface: right sidebar host; composer footer  
Owner: features/plan-agent (product); ui/conversation chrome (host rules only)  
Owning plan: [`../../features/plan-agent/implementation-plan.md`](../../features/plan-agent/implementation-plan.md)  
Related logs: [`2026-08-16-change-right-sidebar-surface-toggle.md`](./2026-08-16-change-right-sidebar-surface-toggle.md), [`2026-08-15-change-v3-right-sidebar.md`](./2026-08-15-change-v3-right-sidebar.md), [`../../features/terminal/logs/2026-08-16-promotion.md`](../../features/terminal/logs/2026-08-16-promotion.md), [`../../features/plan-agent/logs/2026-08-16-promotion.md`](../../features/plan-agent/logs/2026-08-16-promotion.md), [`../../features/plan-agent/logs/2026-08-16-decision-milestone-order.md`](../../features/plan-agent/logs/2026-08-16-decision-milestone-order.md)

## Intended change

The Plan / Agent add-on will add a **Plan** surface on the existing right sidebar (document + todos + Execute / Stay / Refine) and a composer Plan/Agent control. Conversation UI keeps host chrome only.

## Expected / actual (before)

Expected: Plan/Multitask stays out of the conversation-UI track; add-ons that need a rail icon follow Changes / Context prompt host rules (re-click collapse, no dedicated Collapse control, ⌘R / Ctrl+R toggle).

Actual: `RightSidebarSurface` is `"changes" | "context-prompt"`. Conversation UI lists Plan/Multitask as out of scope. No Plan surface exists.

## Changes and decisions

- Product owns Plan meaning, questionnaire card, and Plan document content.
- UI track owns exhaustive surface switching when `"plan"` is added, matching Terminal’s host contract.
- Plan document is sanitized markdown/mermaid, not a React canvas runtime.
- Do not restore a dedicated Collapse icon when Plan lands.

## Verification

Not verified: no Plan surface in source. Implementation is Milestone 1 of the plan-agent add-on (sequence corrected in [`../../features/plan-agent/logs/2026-08-16-decision-milestone-order.md`](../../features/plan-agent/logs/2026-08-16-decision-milestone-order.md); this log previously said Milestone 3).

## Mistakes and corrections

Do not implement Plan chrome from this idea log. The contract is [`features/plan-agent/product.md`](../../features/plan-agent/product.md).

## Owner feedback

Full Plan/Agent + juicesharp-style ask-back product, including a plan document beside the chat, not a first slice.

## Handoff

When adding `"plan"` to `RightSidebarSurface`, keep re-click collapse and exhaustive switch. Reciprocal record: [`../../features/plan-agent/logs/2026-08-16-promotion.md`](../../features/plan-agent/logs/2026-08-16-promotion.md).
