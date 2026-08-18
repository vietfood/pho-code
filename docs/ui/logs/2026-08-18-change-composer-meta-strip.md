# UI change: concise composer footer and meta strip

**Date:** 2026-08-18  
**Status:** implemented  
**Owner:** conversation UI track  
**Related:** prior thinking-chip adaptive-width work; plan-agent todos; follow-up [`2026-08-18-feedback-composer-usage-meter-button.md`](./2026-08-18-feedback-composer-usage-meter-button.md)

## Intent

Reduce composer footer clutter to match Cursor-style density:

- Footer controls: `[+] model thinking [send]`
- `+` menu: Agent/Plan mode + image attach
- Meta strip below composer: workspace folder, plan todo progress, slim context usage + info popover

## Changes

- Added `ComposerContextButton` with mode-colored `+` (agent red, plan blue).
- Moved attach from paperclip chip into the context menu.
- Removed Agent/Plan chip and todo chip from composer footer.
- Added `ComposerMetaStrip` for folder path, clickable todo summary, and usage.
- Refactored `ComposerUsage` to always show context bar + percent; token/cost detail behind `(i)`.
- Wired todo click to open Plan right-sidebar surface via `onOpenPlan`.

## Verification

- `bun test packages/ui/test/composer-context-button.test.ts`
- `bun test packages/ui/test/composer-meta-strip.test.ts`
- `bun test packages/ui/test/conversation.test.ts`
- `bun test packages/ui/test/thinking-level-chip.test.ts`
