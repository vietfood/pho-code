# Right sidebar tiling tabs decision

Kind: decision  
Status: implemented in [`2026-08-27-change-right-sidebar-tiling-tabs.md`](./2026-08-27-change-right-sidebar-tiling-tabs.md)  
Surface: right sidebar host  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-15-change-v3-right-sidebar.md`](./2026-08-15-change-v3-right-sidebar.md), [`2026-08-16-change-right-sidebar-surface-toggle.md`](./2026-08-16-change-right-sidebar-surface-toggle.md), [`2026-08-16-decision-plan-sidebar-surface.md`](./2026-08-16-decision-plan-sidebar-surface.md), [`2026-08-16-change-split-pane-chat-fill.md`](./2026-08-16-change-split-pane-chat-fill.md), [`2026-08-22-change-sidebar-stacked-changes.md`](./2026-08-22-change-sidebar-stacked-changes.md), [`2026-08-22-change-claude-changes-overlay.md`](./2026-08-22-change-claude-changes-overlay.md), [`../../features/terminal/logs/2026-08-16-promotion.md`](../../features/terminal/logs/2026-08-16-promotion.md)

## Intent

Redesign the right sidebar from a single-surface switcher into a tiling tab host, inspired by Claude desktop. Each feature (Changes, Context prompt, Plan, and the planned Terminal) is a tab; opening a tab tiles it alongside the already-open tab instead of replacing it, so two surfaces can be visible at once while the conversation stays primary.

## Expected / actual (before)

Expected (owner request): features open as separate tabs that tile, not as an expandable static sidebar that shows one surface at a time.

Actual: the host keeps one `RightSidebarSurface` active; the icon rail switches the single panel; re-clicking the active surface collapses the whole host. Only the Changes overlay (a floating window) escapes the single-panel model.

## Decisions

1. **Tabs that tile.** Each surface is a tab. Opening a tab claims a tile in the right region; it does not replace the current tile. The host state changes from one active `RightSidebarSurface` to an ordered open-tile set plus per-tile split ratios.
2. **Auto orientation.** One tile fills the region. A second tile splits it as a vertical stack by default, flipping to side-by-side columns once the region is wide enough (threshold fixed at implementation, target ~860–900px so each column keeps ≥ ~420px). Orientation is derived from the current width, never persisted, so the existing resize handle can flip the layout live.
3. **Rail stays as launcher.** The icon rail (and collapsed pill) keep their current chrome, including the Context-prompt customized dot and Plan document dot. Semantics flip from switch to toggle: clicking a closed surface's icon opens its tile; clicking an open surface's icon closes that tile; closing the last tile collapses the host to the pill. `⌘R` / Ctrl+R and Escape still toggle/collapse the host, and collapse remembers the open set for restore.
4. **Cap of two visible tiles, with a minimized tray.** Opening a third surface parks it as a compact header strip (icon + title) docked at the bottom of the region. Clicking a minimized header swaps it in for the least-recently-used visible tile. No modal chooser.
5. **Tile frame.** Each visible tile gets a slim header: surface icon and title on the left; on the right, Expand (Changes only — pops out to the existing floating overlay), minimize, and close. Existing panels (`ChangeReviewWindow`, context-prompt panel, Plan document, Terminal when it lands) render inside the frame unchanged.
6. **Changes overlay stays.** Expand continues to open the floating, draggable Changes window exactly as accepted in [`2026-08-22-change-claude-changes-overlay.md`](./2026-08-22-change-claude-changes-overlay.md).
7. **Persistence.** Open set, minimized set, tile order, and split ratios persist to localStorage beside `pho-code.reviewSidebarWidth`; a relaunch restores the layout. The region width clamp (360–1100px or 62% of the window, default 520px) is unchanged.
8. **Ownership unchanged.** This is a host-only change in the conversation-UI track. V3 keeps Changes/Approve/Undo semantics ([`../../archive/v3`](../../archive/v3/README.md)); the terminal add-on keeps PTY and Terminal product behavior ([`../../features/terminal`](../../features/terminal/README.md)); plan-agent keeps Plan/Agent and the Plan document ([`../../archive/features/plan-agent`](../../archive/features/plan-agent/README.md)). Tiles must not tear down hidden-but-open surfaces: Terminal's PTY and the Changes diff cache survive minimize and orientation flips.

## Affected contracts and files (at implementation)

- `packages/ui/src/right-sidebar.tsx` — host rework: tile layout, tile headers, minimized tray, inter-tile draggable divider (reuse the `SidebarResizeHandle` pattern); `rightSidebarSurfaceAction` collapse/select logic is replaced by open/close.
- `packages/ui/src/lib/` — new tile-layout helpers (open set, LRU order, split ratios, orientation threshold) with unit tests.
- `apps/desktop/src/App.tsx` — single-surface state becomes the open-tile set; exhaustive `RightSidebarSurface` handling is preserved.
- `packages/ui/test/right-sidebar.test.ts`, `packages/ui/test/conversation.test.ts`, `apps/desktop/tests/change-review.spec.ts`, `apps/desktop/tests/settings.spec.ts` — surface-switch assertions become tile open/close/swap assertions.
- `docs/ui/implementation/conversation-ui.md` — slice 15 records this decision; slices 4/13/14 host language is updated when the code lands.
- The terminal promotion log's "re-clicking the active surface hides the panel" contract becomes "re-clicking an open surface's icon closes its tile" once implemented.

## Verification

Not verified: this is a documentation-only decision record. No code changed; unit, desktop, and packaged checks run at implementation time.

## Owner feedback

Owner request (2026-08-27): redesign the right sidebar inspired by Claude desktop — instead of an expandable static sidebar, each feature is a separate tab and opening tabs tiles them. Owner chose: auto orientation, icon rail as launcher, cap of two visible tiles with a minimized tray, and keeping the floating Changes overlay.

## Mistakes and corrections

None yet.

## Blockers and handoff

- Implemented in [`2026-08-27-change-right-sidebar-tiling-tabs.md`](./2026-08-27-change-right-sidebar-tiling-tabs.md); slice 15 of the owning plan now describes current behavior.
- Revised 2026-08-27 in [`2026-08-27-change-right-sidebar-floating-tiles.md`](./2026-08-27-change-right-sidebar-floating-tiles.md): the collapsed pill and in-region icon rail are replaced by launcher icons at the chat's top-right edge, and tiles float as rounded cards with i3-style gaps. The two-tile cap, minimized tray, least-recently-used swap, and persistence decisions still hold.
- When the code lands, update the host language in conversation-ui.md slices 4/13/14, add a reciprocal note to [`../../features/terminal/logs/2026-08-16-promotion.md`](../../features/terminal/logs/2026-08-16-promotion.md) if its handoff text has drifted, and keep the exhaustive `RightSidebarSurface` switch.
