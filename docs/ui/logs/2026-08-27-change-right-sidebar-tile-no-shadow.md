# Right sidebar tile drop shadow

Kind: change  
Status: implemented  
Surface: right sidebar host  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-27-change-right-sidebar-floating-tiles.md`](./2026-08-27-change-right-sidebar-floating-tiles.md), [`2026-08-22-change-changes-pane-no-shadow.md`](./2026-08-22-change-changes-pane-no-shadow.md)

## Intended change

Right-sidebar tiling windows should sit flush with a border only, no drop shadow.

## Expected / actual (before)

Expected: each floating tile is outlined by its border.

Actual: `TileFrame` used `shadow-md`.

## Owner feedback

Remove the shadow of the tiling window in the right sidebar.

## Changes

Dropped `shadow-md` from `packages/ui/src/right-sidebar.tsx` `TileFrame`. Border, radius, and tray-chip `shadow-sm` are unchanged.

## Verification

- Unit verified: `bun test packages/ui/test/right-sidebar.test.ts` — 8 pass, 0 fail. The floating-tile assertion requires no `shadow-md`.
- Desktop: not rerun (class-only chrome; no Playwright spec asserts tile shadow).
