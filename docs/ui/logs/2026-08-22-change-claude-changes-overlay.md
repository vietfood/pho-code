# Change — Claude-style Changes overlay

- Date: 2026-08-22
- Surface: Changes overlay (`change-review-window.tsx`), right-sidebar host, renderer wiring
- Owner: conversation UI track (host chrome); archived V3 (Approve / Undo / conflict)
- Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
- Related: [`2026-08-15-change-v3-right-sidebar.md`](./2026-08-15-change-v3-right-sidebar.md), [`2026-08-16-change-right-sidebar-surface-toggle.md`](./2026-08-16-change-right-sidebar-surface-toggle.md), [`2026-08-16-change-split-pane-chat-fill.md`](./2026-08-16-change-split-pane-chat-fill.md), [`../../features/terminal/logs/2026-08-16-promotion.md`](../../features/terminal/logs/2026-08-16-promotion.md), [`../../archive/v3/logs/2026-08-16-v3-acceptance-review.md`](../../archive/v3/logs/2026-08-16-v3-acceptance-review.md)

## Intended change

FileDiff and a write/edit tool card should open a Claude-like floating Changes pane over full-width chat. Plan, Context prompt, and the future Terminal surface stay on the docked right rail.

## Expected / actual (before)

Expected: the review reads as a right-anchored overlay with air around it, one file, a quiet `working tree → basename` header, and Approve/Undo inside the pane.

Actual: Changes docked into the right sidebar (icon rail + file list + nested diff card). The earlier `ChangeReviewWindow` was a centered stacked-file window, not that overlay.

## Changes and decisions

- Selecting Changes does not expand `RightSidebar`. The pill stays. Chat keeps its column; `paneFill` is unchanged.
- Overlay is `position: absolute` in the main pane, defaulting to the right with a 12px inset (`pho-code.changesWindowFrame.v2`).
- One file at a time. Multiple files switch from the header. Search / whitespace / context sit behind an overflow control.
- Undo, Approve, fail-closed banners, and Load more live in the overlay footer. V3 semantics are unchanged.
- Re-click FileDiff, Escape, or ⌘R / Ctrl+R closes the overlay. Context and Plan still expand the docked rail.
- Terminal remains contracted to the docked host. This pass does not add a Terminal overlay or change hide-vs-kill.

## Verification

- **unit verified:** `bun test packages/ui/test/change-review-window.test.ts packages/ui/test/right-sidebar.test.ts packages/ui/test/change-review-sheet.test.ts` — 22 pass.
- **unit verified:** `bun run typecheck` — all packages exit 0.
- **unit verified:** `bun run lint` — 0 errors (existing exhaustive-deps warnings only).
- **desktop verified:** `bun run build && bunx playwright test tests/change-review.spec.ts` from `apps/desktop` — 2 pass (open overlay, search/whitespace/context behind tools, re-click FileDiff, Approve, Undo, conflict).
- **packaged:** assertions retargeted to `change-review-window`; packaged lane not run.

## Owner feedback

The docked sheet with an inner rounded card was not Claude-style. The second reference screenshot (right overlay over chat, `master → App.tsx`, maximize/close, no file-list column) is the chrome target. Pho has no git branch; the honest header is `working tree → basename`.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md). Terminal still joins the docked rail; do not reuse this overlay host for PTY keep-alive.
