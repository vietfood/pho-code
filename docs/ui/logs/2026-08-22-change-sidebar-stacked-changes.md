# Change — stacked Changes in the right sidebar

- Date: 2026-08-22
- Surface: Changes pane (`change-review-window.tsx`), right-sidebar host, renderer wiring
- Owner: conversation UI track (host chrome); archived V3 (Approve / Undo / conflict)
- Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
- Related: [`2026-08-22-change-claude-changes-overlay.md`](./2026-08-22-change-claude-changes-overlay.md), [`2026-08-15-change-v3-right-sidebar.md`](./2026-08-15-change-v3-right-sidebar.md), [`2026-08-16-change-right-sidebar-surface-toggle.md`](./2026-08-16-change-right-sidebar-surface-toggle.md), [`../../features/terminal/logs/2026-08-16-promotion.md`](../../features/terminal/logs/2026-08-16-promotion.md)

## Intended change

FileDiff and a write/edit tool card should dock a stacked-file Changes card in the right sidebar so the pane is clickable. Multiple files stay stacked until Expand opens the large overlay. Plan, Context prompt, and Terminal stay on the docked rail.

## Expected / actual (before)

Expected: Changes is a sidebar surface I can click into; several files stack in one card; Expand is opt-in.

Actual: FileDiff opened a right-anchored overlay over chat. The overlay host sat under a full-pane `pointer-events-none` pill wrapper and was clipped by `overflow: hidden`, so clicks often missed the pane.

## Changes and decisions

- FileDiff / tool card expands the right sidebar onto `changes` and renders `ChangeReviewWindow` `variant="sidebar"` (stacked files, search/whitespace/context visible, Expand control).
- Expand collapses the rail and mounts `variant="overlay"` (drag/resize/maximize; tools behind `…`).
- Overlay X or Escape restores the stacked sidebar. Re-click FileDiff or ⌘R / Ctrl+R while the overlay is open closes it and leaves the rail collapsed.
- Files stack in one card (`working tree → basename | N files`). Up to five diffs open by default; the rest stay collapsed until expanded.
- V3 Approve / Undo / conflict semantics are unchanged. Terminal is not an overlay.

## Verification

- **unit verified:** `bun test packages/ui/test/change-review-window.test.ts packages/ui/test/right-sidebar.test.ts packages/ui/test/change-review-sheet.test.ts` — 23 pass.
- **unit verified:** `bun run typecheck` — all packages exit 0.
- **unit verified:** `bun run lint` — 0 errors (existing exhaustive-deps warnings only).
- **desktop verified:** `bun run build && bunx playwright test tests/change-review.spec.ts` from `apps/desktop` — 2 pass (docked stacked pane, search visible without tools, Expand then close restores sidebar, re-click FileDiff, Approve, Undo, conflict).
- **packaged:** not run; assertions already look for `change-review-window`.

## Owner feedback

The overlay-only Changes pane could not be clicked into. Prefer the floating card in the sidebar, with files stacked until Expand.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md). Overlay remains an opt-in expand, not the default Changes host. Terminal still joins the docked rail.
