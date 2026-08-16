# Session row archive button

Kind: change  
Status: implemented  
Surface: shell sidebar session rows  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-16-change-sidebar-home.md`](./2026-08-16-change-sidebar-home.md)

## Intended change

Replace the hovered three-dot control on a chat row with an archive icon button. Right-click (and Shift+F10 / ContextMenu) still opens Archive chat and Move chat to Trash.

## Expected / actual (before)

Expected: hover shows a one-click archive control; the full session menu stays on right-click.

Actual: hover showed a vertical ellipsis that opened the same menu as right-click.

## Changes and decisions

- Session rows use `ArchiveIcon` with `data-testid="session-archive"` and archive on click.
- Context menu wiring is unchanged (`onContextMenu`, keyboard ContextMenu).
- Desktop `openSessionActions` now right-clicks the row instead of clicking the old three-dot control.

## Verification

- Unit verified: `bun test packages/ui/test/app-sidebar.test.ts packages/ui/test/session-context-menu.test.ts` — 10 pass (archive button markup; right-click menu still Archive + Trash).
- `@pho-code/ui` typecheck passed.
- Desktop: not run; helper now uses context click so existing session-lifecycle / packaged menu journeys stay valid.

## Owner feedback

Instead of three dots, can you make it archive icon and button (keep the right click menu the same).

## Mistakes and corrections

None yet.

## Handoff

Trash still requires the right-click menu. Do not put a trash glyph on the row.
