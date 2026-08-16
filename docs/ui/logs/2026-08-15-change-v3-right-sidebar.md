# V3 Changes surface in the right sidebar

Kind: change  
Status: implemented; V3 accepted 2026-08-16
Surface: right sidebar  
Owner: archived V3 semantics; ui/chrome host
Owning plans: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../archive/v3/implementation-plan.md`](../../archive/v3/implementation-plan.md)
Related logs: [`../../archive/v3/logs/2026-08-15-m0-m2-implementation.md`](../../archive/v3/logs/2026-08-15-m0-m2-implementation.md), [`../../archive/v3/logs/2026-08-16-m3-review-handoff.md`](../../archive/v3/logs/2026-08-16-m3-review-handoff.md), [`../../archive/v3/logs/2026-08-16-m3-hardening.md`](../../archive/v3/logs/2026-08-16-m3-hardening.md), [`../../archive/v3/logs/2026-08-16-m3-ledger-fail-closed.md`](../../archive/v3/logs/2026-08-16-m3-ledger-fail-closed.md), [`../../archive/v3/logs/2026-08-16-v3-acceptance-review.md`](../../archive/v3/logs/2026-08-16-v3-acceptance-review.md), [`../../features/terminal/logs/2026-08-16-promotion.md`](../../features/terminal/logs/2026-08-16-promotion.md), [`2026-08-16-change-sidebar-dividers.md`](./2026-08-16-change-sidebar-dividers.md), [`2026-08-16-change-sidebar-shortcuts-scrollbar.md`](./2026-08-16-change-sidebar-shortcuts-scrollbar.md)

## Intended change

Host the read-only V3 Changes workbench in the existing persistent rail without making changed files the primary application surface.

## Changes and decisions

- The rail is a compact overlay pill while collapsed and a mouse-resizable panel while expanded.
- Changes opens from a tracked write/edit tool card or the FileDiff icon.
- Context prompt remains a peer surface.
- V3 owns diff, Approve, conflict, and Undo semantics. The UI track owns pill, resize, focus, and exhaustive surface-switch behavior.
- The terminal add-on may add a peer Terminal surface; its PTY and product lifecycle stay outside this record.

## Verification

Previously recorded UI and Electron change-review checks cover opening the surface, rendering the bounded unified diff, Approve, Undo, conflict handling, and relaunch. Milestone 3 re-ran `bun run test:desktop` (search, whitespace, context controls) and `bun run test:packaged` (created-file Undo through OS Trash). Details: [`../../archive/v3/logs/2026-08-16-m3-hardening.md`](../../archive/v3/logs/2026-08-16-m3-hardening.md).

## Mistakes and corrections

Do not duplicate V3 recovery semantics in the conversation-UI plan. Link to the V3 product contract and keep only host behavior here.

## Owner feedback

Conversation must remain primary; the Changes workbench is secondary and read-only.

## Handoff

Any change to the right-sidebar surface union, resize ownership, or collapsed pill must cross-link the active terminal log before implementation.

Later host chrome (surface union unchanged): [`2026-08-16-change-right-sidebar-surface-toggle.md`](./2026-08-16-change-right-sidebar-surface-toggle.md) removes the dedicated Collapse control; re-clicking the active Changes or Context prompt icon hides the panel.

V3 Milestone 3 completed highlighting, search, whitespace, context expansion, and capture-cap/undo-metadata copy inside the existing Changes surface. It did not add a new right-sidebar surface or change the host contract. Evidence: [`../../archive/v3/logs/2026-08-16-m3-hardening.md`](../../archive/v3/logs/2026-08-16-m3-hardening.md). An unreadable-ledger banner was added in the same surface: [`../../archive/v3/logs/2026-08-16-m3-ledger-fail-closed.md`](../../archive/v3/logs/2026-08-16-m3-ledger-fail-closed.md).
