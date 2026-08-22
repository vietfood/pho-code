# Change — remove Changes pane drop shadow

- Date: 2026-08-22
- Surface: Changes pane (`.change-window`)
- Owner: conversation UI track
- Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
- Related: [`2026-08-22-change-sidebar-stacked-changes.md`](./2026-08-22-change-sidebar-stacked-changes.md)

## Intended change

The stacked Changes card (sidebar and Expand overlay) should sit flush with a border only, no drop shadow.

## Owner feedback

Remove shadow.

## Changes

Dropped `box-shadow` from `.change-window`. Border and radius are unchanged.

## Verification

- **not verified:** CSS-only; no unit or desktop lane for shadow presence.
