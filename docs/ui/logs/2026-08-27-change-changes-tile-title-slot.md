# Changes tile header is shared chrome plus a title slot

Kind: change
Status: in source
Surface: right-sidebar host, Changes pane
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-27-change-changes-tile-window.md`](./2026-08-27-change-changes-tile-window.md)

## Intent

Keep one minimize/close pair on the tile frame. Changes fills the header title slot with `working tree → basename` instead of owning a second window chrome.

## Changes

- `TileFrame` always renders min/close. `renderTileTitle` replaces the icon+label for Changes.
- `ChangeReviewWindow` is content only. Overlay, Expand, and `RightSidebarTileChrome` stay deleted.

## Verification

Recorded with the UI unit checks for this working tree.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
