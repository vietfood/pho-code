# Sidebar footer icons and collapsed pill

Kind: change  
Status: implemented  
Surface: shell sidebar  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-16-change-sidebar-projects-heading.md`](./2026-08-16-change-sidebar-projects-heading.md) (same sidebar chrome thread); later [`2026-08-16-change-right-sidebar-surface-toggle.md`](./2026-08-16-change-right-sidebar-surface-toggle.md) left-aligns and enlarges Settings after this first footer pass; later [`2026-08-16-change-sidebar-home.md`](./2026-08-16-change-sidebar-home.md) adds Home to the expanded list and collapsed pill.

## Intended change

Make expanded-footer Settings and About compact icon-only controls, end-aligned. When the left sidebar collapses, show a compact overlay pill matching the right-rail pill, with Open folder, New session, and Settings.

## Expected / actual (before)

Expected: Settings/About as small glyphs on the right of the footer; collapse leaves a left overlay pill so Open folder / New session / Settings stay reachable.

Actual: Settings and About were full-width labeled rows. Collapse hid the whole left sidebar (`hidden` / `inert`) with only the header toggle remaining.

## Changes and decisions

- Expanded footer is a right-aligned pair of `size-6` ghost icon buttons (Settings, About). About’s accessible name stays `About · {version}`.
- Collapse still keeps `AppSidebar` mounted (folder expansion and width survive) but swaps the panel for an overlay pill at `start-2 top-14` using the same rounded-2xl / border / sidebar fill chrome as the right pill.
- Pill actions, in order: Open folder, New session, Settings. Expand remains the traffic-light-adjacent header toggle (and ⌘B / Ctrl+B). About stays on the expanded footer only.
- `app-shell-root` is `relative` so the collapsed overlay can sit over the main pane.

## Verification

- Unit verified: `bun test packages/ui/test/app-sidebar.test.ts` — pending in this log until the command runs.
- Desktop: `apps/desktop/tests/smoke.spec.ts` collapse assertions updated for `data-collapsed` plus pill actions; run pending.

## Owner feedback

Love the larger Projects heading. Settings and About should be icon-only and right-aligned. Collapsed left bar should show a small pill like the right bar, with open folder, new session, and settings.

## Mistakes and corrections

None yet.

## Handoff

This is left-sidebar chrome only. Do not treat it as a right-sidebar host or Terminal surface change.
