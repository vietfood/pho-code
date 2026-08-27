# Changes tile is the review window

Kind: change  
Status: implemented  
Surface: Changes pane (`change-review-window.tsx`), right-sidebar host, renderer wiring  
Owner: conversation UI track (host chrome); archived V3 (Approve / Undo / conflict)  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-27-change-right-sidebar-floating-tiles.md`](./2026-08-27-change-right-sidebar-floating-tiles.md), [`2026-08-27-change-right-sidebar-tiling-tabs.md`](./2026-08-27-change-right-sidebar-tiling-tabs.md), [`2026-08-22-change-claude-changes-overlay.md`](./2026-08-22-change-claude-changes-overlay.md), [`2026-08-22-change-sidebar-stacked-changes.md`](./2026-08-22-change-sidebar-stacked-changes.md), [`2026-08-19-change-glass-composer-right-bar.md`](./2026-08-19-change-glass-composer-right-bar.md)

## Intended change

Owner feedback: the docked Changes tile already is a floating window, so nesting the review pane inside a generic “Changes” title bar read as a window inside a window. Use the clean review chrome as the tile, drop Expand, and match Plan / Context prompt border and color.

## Expected / actual (before)

Expected: one Changes window in the right region — `working tree → file`, tools, minimize, close — with the same `rounded-xl border-foreground/20` outline and shared right-bar glass fill as Plan and Context prompt.

Actual: a generic tile header wrapped the review pane (nested chrome). Expand parked the tile and opened a second overlay over chat. The review pane used `--code-background` and a mixed `--border` outline, so it did not match the other tiles.

## Changes and decisions

- `packages/ui/src/right-sidebar.tsx`: Changes skips the generic tile title bar. Every tile wrapper uses the shared `rounded-xl border border-foreground/20 bg-transparent` card so the host glass fill shows through. Plan and Context prompt keep icon/title/minimize/close.
- `packages/ui/src/change-review-window.tsx`: the review pane fills that tile (`working tree → basename`, search/whitespace/context, minimize, close). Overlay, Expand, drag/resize, and maximize are removed. V3 Approve / Undo / conflict chrome is unchanged.
- `packages/ui/src/theme.css`: `.change-window` uses `--background` when glass is off (same as Plan/Context inner panels). Frosted glass clears `.change-window` and `.change-window-footer` so they do not re-cover the host fill. The sticky `.change-window-file-head` keeps opaque `--background` so scrolled hunks do not show through Approve / Undo.
- `apps/desktop/src/use-layout-chrome.ts` and `App.tsx`: overlay state (`changesWindowOpen`, Expand, overlay host) is gone. FileDiff still docks the Changes tile; re-click or ⌘R / Ctrl+R hides the region.
- Diff gutters and chrome use `--foreground` mixes instead of `--code-background`. Added/removed line tints stay.

## Verification

Recorded after the checks in this slice.

## Owner feedback

Owner (2026-08-27): merge the change view into the floating sidebar tile; use the clean review window as the base. Follow-up: remove Expand, and use the same border and color scheme as Plan and Context prompt. Same thread: keep the shared glass CSS on the tile; only the sticky file row (README / PENDING / Undo / Approve) should not be glass — scrolled red/green hunks were showing through. Blur was considered; an opaque `--background` bar is used instead so add/remove tints do not smear across the actions.

## Mistakes and corrections

Opting Changes out of glass with a solid `bg-background` tile made the review pane a paper card on a frosted host. Clearing `.change-window-file-head` with the rest of the glass list then made the sticky file row see-through over the diff. The host glass stays; only that sticky row keeps an opaque fill.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md) slice 15. Terminal still joins the docked rail with the generic tile frame.
