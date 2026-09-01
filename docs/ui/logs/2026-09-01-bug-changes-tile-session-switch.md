# Changes tile loses its diff after switching chats

Kind: bug
Status: fixed in source
Surface: Changes tile, right-sidebar host, chat tab switching
Owner: conversation UI track (host chrome); archived V3 owns Changes/Approve/Undo semantics
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md) slices 15–16
Related logs: [`2026-08-27-change-changes-tile-window.md`](./2026-08-27-change-changes-tile-window.md), [`2026-08-27-decision-right-sidebar-tiling-tabs.md`](./2026-08-27-decision-right-sidebar-tiling-tabs.md), [`2026-08-27-change-chat-tab-host.md`](./2026-08-27-change-chat-tab-host.md), [`../../archive/v3/README.md`](../../archive/v3/README.md), [`2026-09-01-fix-desktop-build-approval-aliases.md`](./2026-09-01-fix-desktop-build-approval-aliases.md)

## Intent

The accepted chat-tab contract says the active tab is `selectedKey`, "so the
sidebar selection, right-sidebar surfaces, and the Changes tile follow it." An
open Changes tile should therefore show the selected chat's tracked changes
after any session switch, without being closed and reopened.

## Expected / actual (before)

Expected: switch from chat A (review open, diff rendered) to chat B and back —
the tile shows A's diff again.

Actual (owner report, 2026-09-01): "when I switch between each session, the UI
cannot render diff anymore (I need to close it and open it again)." After
switching back, the tile stayed visible but rendered the empty state ("No
tracked write/edit files to review yet.") until the owner closed the tile
(⌘R / icon) and reopened it.

Root cause was UI state ownership, not data loss — the V3 ledger on disk was
always intact:

1. `App.tsx` had an effect that called `changeReview.close()` whenever the
   selected conversation's snapshot stopped matching the open review scope —
   including the transient `undefined` snapshot while an uncached tab loads.
2. Tile visibility is independent persisted layout state
   (`use-layout-chrome.ts`), so the tile stayed open while its review state was
   torn down.
3. The only re-open path (`openLatestReviewIfNeeded`) ran exclusively from
   layout-chrome reveal actions (tile closed→open, region unhide). Session
   switching never triggered it, so the torn-down state was never restored.

## Changes and decisions

- `apps/desktop/src/App.tsx`: the close-only effect became a follow-selection
  sync. When the selected chat changes: an open Changes tile (visible or
  parked) opens the newly selected session's latest review, shows the empty
  state when that session has none, and a closed tile holds no review state.
  While a freshly selected tab has no cached snapshot yet, the previous review
  stays until the snapshot arrives, then re-syncs — no empty flash during tab
  loads.
- `openLatestReviewIfNeeded` now returns early only when the open scope already
  belongs to the selected session (previously any open scope suppressed a
  reload, which could pin a stale session's review on reveal).
- Deliberate behavior changes, both consequences of "the tile follows the
  active chat":
  - switching chats with the tile open now loads that chat's latest review
    automatically (previously the tile kept the old chat's review until
    closed);
  - an open-but-empty tile populates when the selected session's first tracked
    change lands (previously it stayed empty until re-opened).
- Explicit per-run scopes opened from a transcript FileDiff card are preserved:
  the sync only acts when the open scope belongs to a different session.
- `apps/desktop/tests/change-review.spec.ts`: new desktop test — edit in one
  chat, open the review, switch to an empty chat (tile shows the empty state),
  switch back (diff renders again with no close/reopen).

## Verification

- **unit:** `bun test packages/protocol/test packages/ui/test --timeout 20000`
  — 487 pass, 1 pre-existing fail (`appearance theme helpers > shell dividers
  mix from foreground`, an untouched area; unrelated to this change).
- **typecheck:** `bun run typecheck` — pass (an earlier run showed stale
  incremental `tsbuildinfo` errors in the in-progress approval-modes work; a
  clean rerun passes).
- **lint:** root `bun run lint` fails only on a pre-existing
  `consistent-type-imports` error in
  `packages/pho-agent/packages/runtime/src/runtime.ts` (in-progress
  approval-modes work, not touched here). Changed files lint with 0 errors
  (existing `exhaustive-deps` warning pattern unchanged).
- **desktop:** `bunx electron-vite build && bunx playwright test
  tests/change-review.spec.ts` (run from `apps/desktop`) — 4/4 pass, including
  the new session-switch test. The build first required
  [`2026-09-01-fix-desktop-build-approval-aliases.md`](./2026-09-01-fix-desktop-build-approval-aliases.md).
- **packaged:** not verified; no packaged-resource, credential, or data-root
  behavior changed.

## Owner feedback

2026-09-01: owner reported the diff loss on session switch and asked for
hardening plus research into git-based change tracking. The tracking research
is promoted as the [`git-change-tracking`](../../features/git-change-tracking/README.md)
add-on; this log covers only the defect fix.

## Mistakes and corrections

None in this slice. The earlier close-on-switch effect predates the tiling tab
host; the defect became visible once the Changes tile could outlive the review
state inside it.

## Handoff

- The tile still shows the previous chat's review while a freshly selected,
  uncached tab loads (bounded by snapshot load time). If that reads as
  misleading, close-on-select plus a loading state is the fallback.
- Per-run scopes from FileDiff cards do not survive a session switch (the tile
  re-opens the session's *latest* review). Remembering the exact scope per
  session is a possible refinement, not a correctness gap.
- V3's "Selection is not ownership" invariant now holds for the UI state as
  well as the ledger. The `git-change-tracking` add-on builds on this surface;
  keep both records linked when its milestones land.
