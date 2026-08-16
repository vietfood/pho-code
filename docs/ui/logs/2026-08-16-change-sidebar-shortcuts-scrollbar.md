# Right-sidebar shortcut and hidden chat scrollbar

Kind: change  
Status: implemented  
Surface: shell shortcuts; transcript scroller; Electron application menu  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-16-change-right-sidebar-surface-toggle.md`](./2026-08-16-change-right-sidebar-surface-toggle.md), [`2026-08-16-change-sidebar-dividers.md`](./2026-08-16-change-sidebar-dividers.md), [`2026-08-15-change-v3-right-sidebar.md`](./2026-08-15-change-v3-right-sidebar.md), [`../../features/terminal/logs/2026-08-16-promotion.md`](../../features/terminal/logs/2026-08-16-promotion.md)

## Intended change

⌘R / Ctrl+R should hide or show the right bar the same way ⌘B / Ctrl+B toggles the left bar. Window reload/reset moves to ⌘⇧R / Ctrl+Shift+R. The chat transcript should not paint a native scrollbar.

## Expected / actual (before)

Expected: ⌘R collapses the expanded right panel (and expands it again from the pill). The conversation scroller has no visible 6px thumb against the right divider.

Actual: Electron’s default View menu bound Reload to ⌘R, so the chord reset the window. The transcript used `scrollbar-gutter-both` plus the global 6px scrollbar.

## Changes and decisions

- `AppShell` handles ⌘B / Ctrl+B (left) and ⌘R / Ctrl+R (right) through `isPrimaryModShortcut`. Shift+R is left for reload.
- Custom application menu: Reload is a labeled item with `CommandOrControl+Shift+R` and a click handler (not `role: reload`, which would keep the default ⌘R accelerator).
- Transcript uses `.transcript-scroller` with the same hidden-scrollbar rules as `.right-sidebar-host`. Overflow scroll remains.

## Verification

- Unit verified: `bun test packages/ui/test/shell-shortcut.test.ts packages/ui/test/conversation.test.ts packages/ui/test/appearance-theme.test.ts apps/desktop/tests/unit/application-menu.test.ts` — 24 pass (⌘B/⌘R matcher, transcript hidden-scrollbar class, Reload accelerator is Shift+R).
- `@pho-code/ui` and `@pho-code/desktop` typecheck passed.
- Desktop: not run; menu + renderer shortcut need a real Electron window to prove ⌘R no longer reloads.

## Owner feedback

Wow ctrl + B can hide left bar then ctrl + R should hide right bar, ctrl + shift + R is reset. I also still see scrolling bar in chat.

## Mistakes and corrections

None yet.

## Handoff

When Terminal ships, Linux Ctrl+R reverse-search in a focused PTY conflicts with this host chord. macOS Cmd+R does not. Keep Escape PTY-owned when focused; decide Ctrl+R then.
