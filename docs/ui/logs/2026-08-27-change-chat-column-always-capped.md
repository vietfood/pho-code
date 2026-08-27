# Chat column always capped change

Kind: change  
Status: implemented  
Surface: conversation column  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-16-change-split-pane-chat-fill.md`](./2026-08-16-change-split-pane-chat-fill.md) (partially superseded), [`2026-08-27-change-chat-tab-flat-style.md`](./2026-08-27-change-chat-tab-flat-style.md), [`2026-08-27-decision-chat-tab-host.md`](./2026-08-27-decision-chat-tab-host.md)

## Intent

Owner feedback: with the right sidebar open, the chat content stretching full-bleed feels abrupt. Like Cursor, the conversation should always keep a gap around the content column — the gap shrinks when the main chat has less space, but never disappears.

## Expected / actual (before)

Expected: the chat column always keeps comfortable side gaps; narrow regions shrink the gap to the base padding instead of removing it.

Actual: opening the right sidebar set `data-chat-fill`, which removed the 48rem column cap and cut horizontal padding, so transcript and composer jumped to edge-to-edge the moment the region opened.

## Changes and decisions

- The full-bleed fill from [`2026-08-16-change-split-pane-chat-fill.md`](./2026-08-16-change-split-pane-chat-fill.md) is retired. `.chat-column` keeps `max-width: 48rem` with `margin-inline: auto` in every state (the empty-session hero keeps 42rem); the three `[data-chat-fill="true"]` overrides are deleted from `theme.css`. Wide regions get generous symmetric gaps; regions narrower than the column fall back to the base 0.75–1rem padding, so the gap is always present.
- `Conversation`'s `paneFill` prop is renamed to `splitActive` and now only hides the empty-session overlay pills during the split (their actions live in the region topbar). The `data-chat-fill` attribute is gone.
- `ChatHeader` drops `paneFill`; the topbar hairline (`border-b border-border/50`) is always on, anchoring the tab row.
- `App.tsx` derives `splitActive = hasAnyTabs && rightRegionOpen && !rightRegionHidden` and uses it for the collapsed-sidebar header actions and the sidebar overlay pill, restoring the accepted split semantics.

## Verification

- **unit verified:** `bun run typecheck` clean; `bun run lint` 0 errors; `conversation.test.ts` split test now asserts the capped column in split mode (`chat-column` present, no fill attribute) and `appearance-theme.test.ts` no longer expects the fill CSS.
- **desktop verified:** `bun run test:desktop` — 30/31 pass with one flake (`change-review.spec.ts:159` relaunch timing); the failed spec passed on both isolated and full-file re-runs (`bunx playwright test tests/change-review.spec.ts`, 3/3).

## Mistakes and corrections

- The tab-host refactor had inverted the fill derivation (corrected in the [flat style log](./2026-08-27-change-chat-tab-flat-style.md)); owner review of the restored behavior then showed the fill itself felt wrong, retiring it here.

## Owner feedback

Owner (2026-08-27): "I think it is weird when open the right sidebar then the content is stretch immediately, how can we make it cleaner? As cursor, there is always a gap but that is smaller (and it's still there) if we have less space for the main chat."

## Blockers and handoff

- None.
