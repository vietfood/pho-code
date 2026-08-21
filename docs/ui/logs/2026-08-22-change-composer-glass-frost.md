# Composer glass: solid paper off, real frost on

Kind: change
Status: in source
Surface: composer shell / appearance glass
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-19-change-glass-composer-right-bar.md`](./2026-08-19-change-glass-composer-right-bar.md), [`2026-08-22-change-composer-radius-border.md`](./2026-08-22-change-composer-radius-border.md)

## Intent

Owner compared Flexoki screenshots: glass on looked like a clean milky field; glass off looked like a muddy tan slab. They want that clean field as the **off** state, and glass **on** to look more actually frosted.

## Expected / actual (before)

Expected: glass off is a clean paper field; glass on is a blurred, translucent frost.
Actual: glass off filled with 100% `--card`. On Flexoki light that token (`#f2f0e5`) is darker than the pane (`#fffcf0`), so the composer looked dingy. Glass on mixed the same `--card` at ~67% over wallpaper with **no** CSS blur (`isolation: isolate` plus the 2026-08-19 “no composer blur” decision), so it only looked nicer because wallpaper showed through.

## Changes and decisions

- Glass off: composer fill is pane `--background` in light (paper, not the Flexoki tan card) and `--card` in dark (raised).
- Glass on: same fill mixed at `--composer-glass-opacity`, plus `backdrop-filter` using `--glass-blur` (same token as overlay cards). Strength slider still drives blur and opacity.
- Dropped `isolation: isolate` on `.chat-composer-shell` so the `::before` frost samples wallpaper/transcript instead of an empty stacking context.
- Transcript and right bar still do not get extra CSS blur. Reduced motion still clears the composer filter.

This corrects the 2026-08-19 choice to skip composer blur. The composer is a small control, like `.glass-panel`, not a large scrolling pane.

## Verification

- **unit verified:** `bun test packages/ui/test/appearance-theme.test.ts packages/protocol/test/protocol.test.ts` — 34 pass.
- **desktop:** not verified here. `bun run dev` was already running for owner inspection. Toggle Frosted glass on Flexoki light: off should match the pane paper; on should blur wallpaper through the field.
- **packaged:** not verified.

## Owner feedback

2026-08-22: first screenshot (glass on) should be the disabled look; enabled should be more frosted. Second screenshot (glass off) looked uglier.

## Handoff

Living contracts: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../architecture/renderer-and-ui.md`](../../architecture/renderer-and-ui.md).
