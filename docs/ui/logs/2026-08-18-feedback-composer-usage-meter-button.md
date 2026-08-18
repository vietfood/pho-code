# UI feedback: context meter is the usage button

**Date:** 2026-08-18  
**Status:** implemented  
**Kind:** feedback  
**Surface:** composer meta strip usage control  
**Owner:** conversation UI track  
**Owning plan:** [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
**Related:** [`2026-08-18-change-composer-meta-strip.md`](./2026-08-18-change-composer-meta-strip.md)

## Intended change

Owner asked to drop the separate `(i)` button and use the context circle plus usage percent as the control that opens the session-usage popover. Follow-up: bold the percent while keeping its quiet muted color.

## Expected / actual (before)

Expected: one compact control (percent + ring) that opens usage detail.

Actual: a non-interactive meter sat beside a separate Info icon.

## Changes and decisions

- `ComposerUsage` wraps `ContextUsageMeter` in the existing usage trigger button; the Info icon is gone.
- The meter is decorative inside the button; the button keeps the session-usage accessible name.
- Percent uses `font-weight: 700` with the same muted mix; hover/open does not recolor the label.

## Verification

- `bun test packages/ui/test/composer-meta-strip.test.ts packages/ui/test/conversation.test.ts packages/ui/test/context-usage-meter.test.ts` — unit verified, 19 pass.
- Desktop: not verified in this slice.

## Owner feedback

2026-08-18: use the context circle + usage text as the button; bold the usage text, keep the quiet color.

## Handoff

Usage chrome contract updated in [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md) section 10.
