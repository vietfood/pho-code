# Plan chip chrome and labeled plan document

Kind: feedback
Status: implemented; not accepted
Surface: composer footer; Plan document panel
Owner: features/plan-agent (product); ui/conversation chrome (host rules only)
Owning plan: [`../../archive/features/plan-agent/implementation-plan.md`](../../archive/features/plan-agent/implementation-plan.md)
Related logs: [`2026-08-16-change-plan-sidebar.md`](./2026-08-16-change-plan-sidebar.md), [`2026-08-16-feedback-plan-rendered-markdown.md`](./2026-08-16-feedback-plan-rendered-markdown.md), [`../../archive/features/plan-agent/logs/2026-08-16-m1-plan-agent.md`](../../archive/features/plan-agent/logs/2026-08-16-m1-plan-agent.md)

## Intended change

Owner asked to drop the standing “Writes off” line, keep Agent/Plan as a visible chip (Cursor-style, but not buried in a + menu), put the description on hover, and show the Plan document only after the agent writes markdown. Headings become labels; the owner can edit or add a description under each.

## Expected / actual (before)

Expected: compact Agent/Plan chip with icon; hover explains Plan vs Agent; empty Plan waits for agent markdown.

Actual: native select plus always-visible “Writes off”; empty Plan showed a blank markdown textarea; switching to Plan opened the rail immediately.

## Changes and decisions

- Composer `SessionModeChip`: icon + Agent/Plan label. Menu is outside the composer + path. Hover title carries honesty (“File writes are off. Shell is not sandboxed.”).
- Plan panel no longer shows the honesty paragraph or a blank editor. Markdown headings become labels with per-section description fields.
- Switching to Plan does not open the rail. The Plan surface opens when a document first appears in that chat.

## Verification

- `bun run typecheck` — passed.
- `bun run lint` — passed with existing unrelated react-hooks warnings.
- Desktop: not verified in this slice.

## Owner feedback

2026-08-16: remove write-off verbose copy; plan appears when the agent writes markdown; chip + icon with hover description instead of a + menu.

## Handoff

Product chrome updated in [`../../archive/features/plan-agent/product.md`](../../archive/features/plan-agent/product.md). Reciprocal record: [`../../archive/features/plan-agent/logs/2026-08-16-m1-plan-agent.md`](../../archive/features/plan-agent/logs/2026-08-16-m1-plan-agent.md).
