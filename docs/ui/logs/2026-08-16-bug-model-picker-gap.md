# Model picker search-to-list gap

Kind: bug  
Status: implemented  
Surface: composer model picker  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: none

## Intended change

Remove the empty band between “Search models” and the first visible provider group, including the clipped `$… ctx` line from the previous scrolled row.

## Expected / actual (before)

Expected: the filter sits flush above the list; scrolled rows disappear behind an opaque header, not in a hole under the search field.

Actual: list `padding-top` plus a translucent sticky group title let the previous option’s meta line show between the search field and the next provider heading.

## Changes and decisions

- Search field lives in an opaque `.composer-model-picker-toolbar` so the popover background covers that strip.
- The scrolling list has no top padding.
- Sticky provider titles use solid `--popover` instead of a 92% mix.

## Verification

- Unit verified: `bun test packages/ui/test/appearance-theme.test.ts` — 6 pass (opaque picker toolbar, list `padding-top: 0`, solid sticky group titles).
- Desktop: not run; picker CSS only.

## Owner feedback

I don't want to have this gap in model selecting.

## Mistakes and corrections

None yet.

## Handoff

None.
