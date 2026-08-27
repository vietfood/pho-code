# Split-pane chat fill and denser chrome

Kind: change  
Status: implemented; the full-bleed `data-chat-fill` column is superseded by [`2026-08-27-change-chat-column-always-capped.md`](./2026-08-27-change-chat-column-always-capped.md) (the column keeps its cap in every state; split overlay-pill/header-action behavior here still stands)  
Surface: conversation column / left overlay pill / right-sidebar host width  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-15-change-v3-right-sidebar.md`](./2026-08-15-change-v3-right-sidebar.md), [`2026-08-16-change-right-sidebar-surface-toggle.md`](./2026-08-16-change-right-sidebar-surface-toggle.md), [`2026-08-16-change-sidebar-home.md`](./2026-08-16-change-sidebar-home.md), [`../../features/terminal/logs/2026-08-16-promotion.md`](../../features/terminal/logs/2026-08-16-promotion.md)

## Intended change

When the left project sidebar is collapsed and the right sidebar is expanded, the conversation should occupy the whole remaining left pane (Cursor agent + canvas split). Transcript, composer, and chrome should feel denser, and the right panel should be able to grow to a canvas-like share of the window.

## Expected / actual (before)

Expected: collapsed left + expanded right yields a full-bleed chat column on the left and a wide secondary pane on the right, with little unused gutter.

Actual: the chat column was already flex-1, but content stayed in a centered `48rem` (`max-w-3xl`) column with generous padding, so the left half looked empty. The left overlay pill sat on that gutter. The right host capped at 720px (about 448px default).

## Changes and decisions

- Expanded right sidebar sets `data-chat-fill` on the conversation. `.chat-column` keeps the 48rem cap for a solo chat pane and drops it while the right host is open.
- Left overlay pill hides in that split; Home / Open folder / New session / Settings move into the chat header next to the sidebar toggle. The welcome launcher (no right host) still uses the overlay pill.
- Chat header shows the session title. Transcript, composer, and markdown spacing are tighter.
- Right host width: default 520px, max 1100px or 62% of the window (`pho-code.reviewSidebarWidth`). Surface union is unchanged.

## Verification

- Unit verified: `bun test packages/ui/test/conversation.test.ts packages/ui/test/app-sidebar.test.ts packages/ui/test/appearance-theme.test.ts packages/ui/test/review-sidebar-width.test.ts packages/ui/test/chat-pane-loading.test.ts packages/ui/test/right-sidebar.test.ts` — 36 pass (pane-fill `data-chat-fill` / `.chat-column`, collapsed header actions, overlay hidden without pill, shell CSS, width clamp).
- `@pho-code/ui` and `@pho-code/desktop` typecheck passed.
- Desktop: not run; renderer chrome and persisted width only, no IPC contract change.

## Owner feedback

Collapse the left sidebar and expand the right sidebar: the chat should occupy the whole left side. The UI should feel more occupied, like Cursor.

## Mistakes and corrections

None yet.

## Handoff

The right-sidebar surface union is unchanged. Terminal still joins the same host; update its product clamp if the host width contract changes again. Persisted widths above the old 720px cap become reachable after this change; existing stored values below that remain valid.
