# Right sidebar floating tiles and chat-embedded icons

Kind: change  
Status: implemented  
Surface: right sidebar host, conversation header  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-27-decision-right-sidebar-tiling-tabs.md`](./2026-08-27-decision-right-sidebar-tiling-tabs.md), [`2026-08-27-change-right-sidebar-tiling-tabs.md`](./2026-08-27-change-right-sidebar-tiling-tabs.md), [`2026-08-27-change-right-sidebar-tile-no-shadow.md`](./2026-08-27-change-right-sidebar-tile-no-shadow.md), [`2026-08-22-change-claude-changes-overlay.md`](./2026-08-22-change-claude-changes-overlay.md)

## Intended change

Owner feedback on the tiling tab host: tile like i3 — each tab is a floating rounded window with gaps, as in Claude desktop — and retire the collapsed pill; embed the surface icons directly at the top-right edge of the chat.

## Expected / actual (before)

Expected: tiles float as rounded cards with gaps; surface icons live in the chat; no pill; no right region when nothing is open.

Actual: tiles filled a solid edge-to-edge sidebar panel split by a 1px divider; a collapsed state showed a floating pill; an icon rail ran down the region's leading edge.

## Changes and decisions

- `packages/ui/src/right-sidebar.tsx`: the pill and the in-region icon rail are gone. Tiles render as floating rounded cards (`rounded-xl border bg-background shadow-sm`) inside a padded region (`py-2 pe-2 ps-1`), so the app background shows through the gaps. The divider lives in the gap between cards: an 8px transparent hit area with a handle line on hover/focus, still `role="separator"` with arrow-key resizing. Parked tiles are tray chips (rounded-full) at the region's bottom edge. The region keeps its mouse-resizable width and the 880px stack/columns threshold.
- New exported `RightSurfaceIcons` cluster renders the three surface launchers (with the customized/document dots and pressed states) and is embedded through a new `headerTrailing` slot on `ChatHeader` (also threaded through `Conversation` and `ChatPaneLoading`), pinning the icons to the top-right edge of the chat.
- The collapsed-host concept and its `pho-code.rightSidebarCollapsed` persistence key are retired (`lib/right-sidebar-collapsed.ts` trashed). The region renders only while at least one tile is open (visible or parked); closing the last tile removes the region and the chat fills the full width.
- `use-layout-chrome.ts`: `rightSidebarCollapsed` becomes session-only `rightRegionHidden`. ⌘R / Ctrl+R and Escape hide the whole region (tiles stay mounted, so a future Terminal PTY and the Changes diff cache survive); any tile open reveals it again. Expand on a docked Changes tile now parks the tile in the tray while the overlay floats, and closing the overlay restores the tile; clicking the Changes icon while the overlay is open dismisses the overlay and restores the docked tile.
- `App.tsx`: `paneFill` follows region visibility (`!rightRegionOpen || rightRegionHidden`); new session hides the region instead of collapsing a host.

## Verification

- Unit verified: `bun test packages/ui/test/right-sidebar.test.ts packages/ui/test/right-sidebar-tiles.test.ts` — 30 pass (icon cluster pressed/badge states; floating tile card, gap divider, columns orientation, tray chips with mounted-but-hidden content, session-hidden region keeps tiles mounted). Full UI suite: 321 pass, 0 fail.
- `bun run typecheck` — pass across all packages. `bun run lint` — 0 errors (9 pre-existing warnings in untouched files).
- Desktop verified: `bunx playwright test tests/change-review.spec.ts tests/chat.spec.ts tests/host-ui.spec.ts` — 8 passed after updating the pill/collapse assertions to region presence and icon-cluster checks; the tiling journey now also asserts Expand parks the Changes tile in the tray and the overlay close restores it. Full desktop lane: full Playwright lane passed, 31 of 31.
- Packaged: not rerun for this revision (renderer-only chrome change on top of the verified tiling implementation); the packaged Plan/Agent journey exercises the same icon testids, which are unchanged.

## Mistakes and corrections

- The tiling spec asserted `data-orientation` on the tiles container; the attribute moved to the region element when the rail was removed. The spec now asserts it on `right-sidebar`.

## Owner feedback

Owner direction (2026-08-27): "we can tiling like i3 (as you see in claude desktop, each tab is a floating window and open them we create round window with gap). Also besides that, we won't use pill anymore, we embed it directly in the chatbox" — with icons clarified to the top-right edge of the whole chat, the empty region disappearing entirely, and the two-tile cap with tray kept. Follow-up the same day: remove the visible divider line in the tile gap (handle appears only on hover/focus/drag) and the vertical shell-divider line between the chat and the region; the region stays transparent under glass so tiles float on the app background. Same thread: tiles and tray chips use the shared `glass-panel` treatment so they frost like the composer instead of reading as flat opaque cards (verified with a dark+glass screenshot from a throwaway Playwright spec, since removed), and the region regained the chat pane's translucent glass background so gaps mute desktop bleed-through instead of showing the raw wallpaper); tiles and tray chips then went fully transparent with full-opacity borders (border-border, shadow-md) so each window is defined by its outline rather than a filled card); owner then picked the frosted-surface direction: chat and region share the composer backdrop blur so transparent tiles stay readable, and tile/chip borders moved to border-foreground/20 with border-foreground/10 header dividers for clearer window outlines).

## Handoff

- The icon cluster testids (`right-sidebar-surface-*`) and tray/tile testids are unchanged; the pill testid and `data-collapsed` attribute no longer exist.
- When Terminal lands it joins `RIGHT_SIDEBAR_SURFACES`/`SURFACE_META` as before; its PTY survives minimize (mounted-but-hidden) and region hide (session-only `hidden` class), but not closing the last tile, which unmounts the region.
