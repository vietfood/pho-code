# Right sidebar tiling tabs

Kind: change  
Status: implemented  
Surface: right sidebar host  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-27-decision-right-sidebar-tiling-tabs.md`](./2026-08-27-decision-right-sidebar-tiling-tabs.md), [`2026-08-15-change-v3-right-sidebar.md`](./2026-08-15-change-v3-right-sidebar.md), [`2026-08-16-change-right-sidebar-surface-toggle.md`](./2026-08-16-change-right-sidebar-surface-toggle.md), [`2026-08-22-change-claude-changes-overlay.md`](./2026-08-22-change-claude-changes-overlay.md), [`../../features/terminal/logs/2026-08-16-promotion.md`](../../features/terminal/logs/2026-08-16-promotion.md)

## Intended change

Implement the tiling tab host decided in the linked decision record: each right-sidebar surface (Changes, Context prompt, Plan) is a tab, and opening a tab tiles it beside the already-open tab instead of switching the single panel.

## Expected / actual (before)

Expected: opening a second surface tiles it alongside the first; a third parks in a minimized tray; rail icons toggle tiles; closing the last tile collapses the host.

Actual: the host kept one active `RightSidebarSurface`; the icon rail switched the single panel; re-clicking the active surface collapsed the whole host.

## Changes and decisions

- New `packages/ui/src/lib/right-sidebar-tiles.ts`: pure tile-layout helpers and persistence. State is an ordered `visible` list (cap 2), a `minimized` tray (most recently parked first), a `recency` list over visible tiles (the tail is the swap victim), and a `splitRatio`. Opening a third surface from the rail parks it; explicit reveals (transcript review button, plan auto-open, rail click while collapsed) open visibly and evict the least-recently-used visible tile at the cap. Closing or minimizing a visible tile promotes the most recently parked tile into the freed slot. Persisted as `pho-code.rightSidebarTiles` beside `pho-code.reviewSidebarWidth`; unknown surfaces are dropped on read.
- `packages/ui/src/right-sidebar.tsx` reworked into the tiling host: the rail and collapsed pill keep their chrome (including the customized/document dots) but toggle tiles; each visible tile renders a slim header (icon, title, minimize, close) around the existing panel; a draggable, keyboard-operable divider (`role="separator"`, arrow keys ±5%) splits two tiles; orientation is derived from panel width (`tileOrientation`, side-by-side at ≥ 880px) and never persisted; parked tiles render in a bottom tray and their content stays mounted but hidden so the future Terminal PTY and the Changes diff cache survive minimize. `rightSidebarSurfaceAction` is deleted; rail semantics live in `toggleTile`.
- `apps/desktop/src/use-layout-chrome.ts`: owns the persisted tile set. New actions `toggleRightSurface` (rail), `revealRightSurface` (explicit reveal), `closeRightSurface`, `minimizeRightSurface`, `activateRightSurface` (tray), `setRightTileSplit`. Closing/minimizing the last visible tile collapses the host; expanding with only parked tiles restores the most recently parked one. The floating Changes overlay is unchanged: Expand collapses the host behind it, closing it restores the host, and clicking the Changes rail icon while the overlay is open dismisses the overlay.
- `apps/desktop/src/App.tsx`: the single `rightSidebarSurface` switch becomes `renderRightSurface(surface)` with the same exhaustive `never` check; the Context prompt panel's close button now closes only its tile.
- Ownership unchanged: V3 keeps Changes semantics, the terminal add-on keeps Terminal, plan-agent keeps Plan. The terminal promotion log's "re-click hides the panel" contract is superseded by "re-click closes the tile."

## Verification

- Unit verified: `bun test packages/ui/test/right-sidebar.test.ts packages/ui/test/right-sidebar-tiles.test.ts` — 30 pass (tile helpers: open/close/minimize/tray-swap with LRU eviction, split clamp, orientation threshold, persistence round-trip and corrupt-JSON fallback; component: pill, tile frame, divider, columns orientation, tray with hidden mounted content, badges).
- Full unit suite: `bun test` — 843 pass, 0 fail.
- `bun run typecheck` — pass across all packages. `bun run lint` — 0 errors (9 pre-existing warnings in untouched files).
- Desktop verified: full Playwright lane `bunx playwright test` from `apps/desktop` — 31 passed, including the new tiling journey in `tests/change-review.spec.ts` (two surfaces tile with a divider, the third parks in the tray, tray click swaps it in for the least-recently-used tile, minimize promotes the parked tile, closing the last tile collapses the host) and the pre-existing change-review, chat, settings, and host-dialog specs unchanged.
- `bun run build` — pass.
- Packaged: `bun run package:mac && bun run test:packaged` — the app packaged and 5 of 6 journeys passed, including the Plan/Agent journey that opens the Plan tile from the rail in the packaged app (it flaked once on a work-log settle wait and passed on retry). The staged-rg/sandbox spec fails on Settings copy (`skip permission asks`) that exists neither at HEAD nor in the working tree — pre-existing and unrelated to this change.

## Mistakes and corrections

- The first desktop run failed every spec with "Process failed to launch" because the agent shell sandbox blocks Electron; the lane was rerun outside the sandbox. The same sandbox artifact failed 11 Seatbelt unit tests in a sandboxed `bun test`; the unsandboxed run is clean.
- The tiling spec initially assumed closing a visible tile leaves the slot empty; the designed behavior promotes the most recently parked tile into the freed slot, and the spec now asserts that.

## Owner feedback

Owner request (2026-08-27): redesign the right sidebar inspired by Claude desktop — each feature is a separate tab and opening tabs tiles them. Owner chose auto orientation, the icon rail as launcher, a two-tile cap with a minimized tray, and keeping the floating Changes overlay.

## Handoff

- When the terminal add-on lands, Terminal becomes a fourth entry in `RIGHT_SIDEBAR_SURFACES` and `SURFACE_META`; keep exhaustive handling and the mounted-but-hidden minimize behavior (its PTY must survive minimize).
- The side-by-side threshold (880px) and split clamp (25–75%) live in `packages/ui/src/lib/right-sidebar-tiles.ts` if the owner wants them tuned.
