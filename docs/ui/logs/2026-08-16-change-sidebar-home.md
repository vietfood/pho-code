# Sidebar Home to welcome launcher

Kind: change  
Status: implemented  
Surface: shell sidebar / welcome launcher  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-16-change-sidebar-footer-pill.md`](./2026-08-16-change-sidebar-footer-pill.md)

## Intended change

Add a Home control on the left sidebar (expanded list and collapsed pill) that returns to the welcome launcher without restarting the app or disposing background sessions.

## Expected / actual (before)

Expected: from any live chat, Home shows the welcome launcher; project folders and running chats stay in the sidebar; opening a session later restores the cached transcript.

Actual: the welcome launcher only appeared when no session was selected (startup, or after removing the last project). There was no owner control to go back.

## Changes and decisions

- Home is the first sidebar action (`House` + “Home”) and the first collapsed-pill icon.
- Clicking Home clears `selectedKey` only. The conversation cache and live-run map stay intact (selection is not ownership).
- Bootstrap refresh does not yank the owner back into the runtime’s active session while Home is showing (`keepWelcomeSelection`).
- Home is marked `aria-current="page"` while the welcome launcher is visible.

## Verification

- Unit verified: `bun test packages/ui/test/app-sidebar.test.ts apps/desktop/tests/unit/session-home.test.ts` — 8 pass (Home markup/current page, welcome-selection helper).
- `@pho-code/ui` and `@pho-code/desktop` typecheck passed.
- Desktop: not run; renderer selection only, no IPC contract change.

## Owner feedback

Add a home button in the left bar so we can go back to the welcome launcher without restarting the app.

## Mistakes and corrections

None yet.

## Handoff

Home must not call `resetConversationChrome` (that wipes the cache and live runs). Background controllers stay alive.
