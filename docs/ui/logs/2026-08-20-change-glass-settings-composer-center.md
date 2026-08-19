# Settings glass and centered hero composer

Kind: change  
Status: implemented  
Surface: empty-session composer / Settings dialog / appearance glass  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-19-change-glass-composer-right-bar.md`](./2026-08-19-change-glass-composer-right-bar.md), [`2026-08-16-change-split-pane-chat-fill.md`](./2026-08-16-change-split-pane-chat-fill.md), [`2026-08-20-change-revert-settings-glass.md`](./2026-08-20-change-revert-settings-glass.md)

## Intended change

Keep the empty-session composer in the visual middle of the remaining chat pane (not tucked under overlay pills), and let Settings pick up the same frosted tint as the composer and right bar.

## Expected / actual (before)

Expected: hero composer centered between collapsed overlay pills; Settings frosted like the rest of the glass shell.

Actual: `.empty-session-column` had no `margin-inline: auto` (unlike `.chat-column`), so a `width: 100%` flex child could sit start-aligned. Collapsed left/right pills overlay that column without reserving space, which reads as a slight left shift. Settings stayed a solid `bg-background` card over a 50% black dimmer.

## Changes and decisions

- Center the hero column with `margin-inline: auto` like the docked chat column.
- When overlay pills are visible, inset the empty-session stage (`3rem` start/end) so the composer centers in the gap between pills. Split-pane fill (`data-chat-fill`) still hides those pills and skips the inset.
- Settings dialog uses the composer glass fill and a lighter dimmer (`rgb(0 0 0 / 28%)`). No extra CSS `backdrop-filter` on the dialog (OS vibrancy already blurs; inner `.glass-panel` cards keep their existing overlay blur).

## Verification

- Unit verified: `bun test packages/ui/test/conversation.test.ts packages/ui/test/appearance-theme.test.ts` — 24 pass. Hero composer insets for overlay pills; Settings dialog glass fill has no extra CSS blur.
- Desktop: not run; chrome-only. Owner should collapse both bars on an empty chat and open Settings with Frosted glass on.

## Owner feedback

The composer was shifted left a little. Settings should have the glass effect too.

## Mistakes and corrections

The previous glass slice treated Settings as an opaque overlay on purpose. This slice changes that after owner feedback.

## Handoff

Menus and collapsed pills stay opaque. If another floating dialog should frost, give it a dedicated class rather than blurring every `bg-background` card.
