# V3 Changes surface in the right sidebar

Kind: change  
Status: implemented; v3 not owner-accepted  
Surface: right sidebar  
Owner: version/v3 semantics; ui/chrome host  
Owning plans: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../version/v3/implementation-plan.md`](../../version/v3/implementation-plan.md)  
Related logs: [`../../version/v3/logs/2026-08-15-m0-m2-implementation.md`](../../version/v3/logs/2026-08-15-m0-m2-implementation.md), [`../../features/terminal/logs/2026-08-16-promotion.md`](../../features/terminal/logs/2026-08-16-promotion.md)

## Intended change

Host the read-only V3 Changes workbench in the existing persistent rail without making changed files the primary application surface.

## Changes and decisions

- The rail is a compact overlay pill while collapsed and a mouse-resizable panel while expanded.
- Changes opens from a tracked write/edit tool card or the FileDiff icon.
- Context prompt remains a peer surface.
- V3 owns diff, Approve, conflict, and Undo semantics. The UI track owns pill, resize, focus, and exhaustive surface-switch behavior.
- The terminal add-on may add a peer Terminal surface; its PTY and product lifecycle stay outside this record.

## Verification

Previously recorded UI and Electron change-review checks cover opening the surface, rendering the bounded unified diff, Approve, Undo, conflict handling, and relaunch. This documentation refactor does not rerun them.

## Mistakes and corrections

Do not duplicate V3 recovery semantics in the conversation-UI plan. Link to the V3 product contract and keep only host behavior here.

## Owner feedback

Conversation must remain primary; the Changes workbench is secondary and read-only.

## Handoff

Any change to the right-sidebar surface union, resize ownership, or collapsed pill must cross-link the active terminal log before implementation.
