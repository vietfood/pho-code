# Clearer left and right bar dividers

Kind: change  
Status: implemented  
Surface: shell sidebar / right-sidebar host chrome  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-16-change-codeblock-chrome.md`](./2026-08-16-change-codeblock-chrome.md), [`2026-08-16-change-right-sidebar-surface-toggle.md`](./2026-08-16-change-right-sidebar-surface-toggle.md), [`2026-08-15-change-v3-right-sidebar.md`](./2026-08-15-change-v3-right-sidebar.md), [`2026-08-16-change-sidebar-shortcuts-scrollbar.md`](./2026-08-16-change-sidebar-shortcuts-scrollbar.md)

## Intended change

Make the hairline between the expanded left bar and the main pane, and between the expanded right bar and the main pane, clearly visible on both light and dark palettes.

## Expected / actual (before)

Expected: a readable 1px split so the conversation pane is distinct from each sidebar.

Actual: the left split was a `box-shadow` using `--border`, and the right host used `border-s border-border`. Default dark `--border` is 5% white; `--sidebar-border` is transparent. The line almost disappeared.

## Changes and decisions

- Shared `--shell-divider` mixes 18% `--foreground` (same approach as fenced-code hairlines, slightly stronger).
- Expanded left panel (`.app-sidebar-panel`) and expanded right host (`.right-sidebar-host`) draw that 1px edge. Glass mode uses the same token.
- Removed the main-pane `--border` box-shadow so the divider lives on the bar, not as a stray line when the left bar is collapsed to a pill.
- Surface union, collapse, and resize behavior are unchanged.

## Verification

- Unit verified: `bun test packages/ui/test/appearance-theme.test.ts packages/ui/test/right-sidebar.test.ts` — 11 pass (foreground-mix `--shell-divider` on left panel and right host; expanded host no longer uses `border-s`).
- Desktop: not run; chrome-only CSS, no IPC.

## Owner feedback

Make the divider between the right bar or left bar clearer.

## Mistakes and corrections

None yet.

## Handoff

Collapsed overlay pills still use `border-border`. Further contrast there is a separate chrome pass.
