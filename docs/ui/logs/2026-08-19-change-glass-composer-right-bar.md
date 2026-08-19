# Layered glass: composer and right bar tint without extra blur

Kind: change  
Status: implemented  
Surface: composer / right-sidebar host chrome / appearance glass  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-16-change-sidebar-dividers.md`](./2026-08-16-change-sidebar-dividers.md), [`2026-08-15-change-v3-right-sidebar.md`](./2026-08-15-change-v3-right-sidebar.md), [`2026-08-16-change-right-sidebar-surface-toggle.md`](./2026-08-16-change-right-sidebar-surface-toggle.md), [`2026-08-20-change-glass-settings-composer-center.md`](./2026-08-20-change-glass-settings-composer-center.md)

## Intended change

Keep the current frosted window, but let the composer and expanded right bar show wallpaper like the left sidebar and main pane. Do not frost every control.

## Expected / actual (before)

Expected: with Frosted glass on, the composer and Plan/Changes/Context panel pick up the same wallpaper tint as the rest of the shell.

Actual: the left sidebar and conversation pane were translucent over macOS `under-window` vibrancy. The composer used a higher fill opacity plus CSS `backdrop-filter` on an isolated stacking context, so it read as a solid white card. The right host sat inside the main pane with solid `bg-background` (and Plan/Context panels repeated that fill), so it looked more opaque than the chat.

## Research (UI + performance)

`backdrop-filter` is not free: Chromium snapshots everything behind each filtered layer into an offscreen target. Nested filters stack that cost and, with `isolation: isolate`, often sample an empty backdrop so the fill just looks opaque. macOS Electron vibrancy already blurs the desktop once. Extra CSS blur on large or scrolling surfaces (transcript under the composer, Plan markdown) therefore costs GPU time without adding a second useful frost.

Layering that keeps both look and cost:

| Layer | Treatment |
| --- | --- |
| Window | One OS vibrancy blur (`under-window`) |
| Conversation pane | Translucent fill, no CSS blur (reading surface) |
| Left sidebar | Translucent fill + CSS blur (narrow chrome) |
| Right bar | Same fill as the left bar, **no** extra CSS blur (wide, scrolling) |
| Composer | Tint between sidebar and pane, **no** extra CSS blur (sits over a live transcript) |
| Menus, pills, Settings dialog | Stay more opaque so text and hit targets stay readable |

Chat and the expanded right host are siblings under a transparent `app-shell-main` so their fills do not stack into a muddier panel.

## Changes and decisions

- Composer fill uses `--composer-glass-opacity` between sidebar and pane (no longer more opaque than the pane). Drop CSS blur on `.chat-composer-shell::before`; keep a hairline and a lighter shadow so it still reads as a control.
- Expanded right host uses the sidebar glass fill. Inner Plan/Context/nav/footer solids become transparent in glass mode so they do not re-cover the host.
- Conversation column is `.app-shell-chat` and owns the pane fill; `app-shell-main` stays clear in glass mode.
- Overlay cards (`.glass-panel` / `.glass-field`) and the left sidebar keep their existing CSS blur. Collapsed pills and menus stay opaque.

## Verification

- Unit verified: `bun test packages/protocol/test/protocol.test.ts packages/ui/test/appearance-theme.test.ts packages/ui/test/right-sidebar.test.ts` — 38 pass. Composer fill sits between sidebar and pane; glass CSS tints `.app-shell-chat` and `.right-sidebar-host` and does not apply `backdrop-filter` to the composer.
- Desktop: not run; chrome-only CSS/class names, no IPC. Owner should toggle Frosted glass with the right bar expanded and confirm wallpaper shows through composer and Plan without the Settings dialog or menus going clear.

## Owner feedback

Make the composer and right bar transparent too, without transparent-everything, and keep performance.

## Mistakes and corrections

None yet.

## Handoff

If the right bar still looks heavier than the left, check for a new solid `bg-background` child on a rail surface and add it to the glass transparent list rather than adding CSS blur.
