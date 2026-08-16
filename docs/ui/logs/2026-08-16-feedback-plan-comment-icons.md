# Plan comment send; icon-only Edit/Copy

Kind: feedback
Status: implemented; not accepted
Surface: Plan document panel; settled assistant turn actions
Owner: features/plan-agent (Plan chrome); ui/conversation chrome (Copy/Edit)
Owning plan: [`../../features/plan-agent/implementation-plan.md`](../../features/plan-agent/implementation-plan.md)
Related logs: [`2026-08-16-feedback-plan-rendered-markdown.md`](./2026-08-16-feedback-plan-rendered-markdown.md), [`../../features/plan-agent/logs/2026-08-16-m1-plan-agent.md`](../../features/plan-agent/logs/2026-08-16-m1-plan-agent.md)

## Intended change

Drop Stay and Refine buttons. The comment box is the follow-up (send / Enter). Plan Edit is a pen icon. Chat Copy and Edit are icon-only too.

## Expected / actual (before)

Expected: compact Plan footer (Execute only) and icon-only chat actions.
Actual: Stay / Refine / Edit labels on the Plan footer; assistant Copy showed “Copy” text and Edit showed “Edit”.

## Changes and decisions

- Plan header: pen to edit, X/check while editing. Footer: Execute only.
- Comment row has the composer-style send control. Enter sends; Shift+Enter is a newline.
- Assistant turn Copy drops `showLabel`. Edit keeps the pencil, no text. Aria-label/title remain.

## Verification

- Unit verified: `bun test packages/ui/test/work-log.test.ts packages/ui/test/markdown.test.ts` — 21 pass.
- `bun run typecheck` passed. `bun run lint` — 0 errors; remaining exhaustive-deps warnings are pre-existing.
- Desktop: not verified. Restart `bun run dev`.

## Owner feedback

2026-08-16: kill Refine if a comment box exists; pen icon for Edit; remove Stay; keep Execute; compact chat Copy and Edit to icons.

## Handoff

Product contract in [`../../features/plan-agent/product.md`](../../features/plan-agent/product.md). Restart `bun run dev`.
