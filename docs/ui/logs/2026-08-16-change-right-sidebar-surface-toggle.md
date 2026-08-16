# Right sidebar surface toggle and Settings alignment

Kind: change  
Status: implemented  
Surface: right sidebar host; left sidebar footer  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-15-change-v3-right-sidebar.md`](./2026-08-15-change-v3-right-sidebar.md), [`2026-08-16-change-sidebar-footer-pill.md`](./2026-08-16-change-sidebar-footer-pill.md), [`2026-08-16-change-sidebar-dividers.md`](./2026-08-16-change-sidebar-dividers.md), [`2026-08-16-change-sidebar-shortcuts-scrollbar.md`](./2026-08-16-change-sidebar-shortcuts-scrollbar.md), [`../../features/terminal/logs/2026-08-16-promotion.md`](../../features/terminal/logs/2026-08-16-promotion.md)

## Intended change

Remove the dedicated right-rail Collapse control. Opening Changes or Context prompt from the pill/rail should still expand; clicking the already-open surface should hide the panel. Left-align Settings (and About) and make those icons a little larger. Hide the native scrollbar inside the expanded right panel.

## Expected / actual (before)

Expected: pill shows only Changes and Context prompt; a second click on the active tool collapses; Settings sits on the left of the project footer at a slightly larger size; the right panel does not paint a 6px scrollbar.

Actual: the pill/rail led with PanelRight collapse. Settings/About were end-aligned `size-6` glyphs. The right panel used the global scrollbar chrome.

## Changes and decisions

- No `right-sidebar-collapse` control. `rightSidebarSurfaceAction` collapses when the open surface is clicked again, otherwise selects (and App.tsx still expands on select).
- Escape still collapses when no modal owns Escape.
- Surface union is unchanged (`changes` | `context-prompt`). Terminal remains a planned peer; its product contract now says the Terminal icon follows Changes / Context prompt with no dedicated Collapse control.
- Expanded right panel uses `.right-sidebar-host` to hide scrollbars while keeping overflow scroll.
- Left footer Settings/About are `justify-start` with `size-7` / `size-4` glyphs.

## Verification

- Unit verified: `bun test packages/ui/test/right-sidebar.test.ts packages/ui/test/app-sidebar.test.ts` — 9 pass (pill without collapse control, re-click collapse helper, start-aligned larger Settings).
- `@pho-code/ui` typecheck passed.
- Desktop: `change-review.spec.ts` now collapses by re-clicking `right-sidebar-surface-diff`; Electron lane not run in this log.

## Owner feedback

Remove the right-bar collapse button. Clicking an open tool (Changes or Context) again should hide it. Settings should be left-aligned and a little bigger. Remove the scrolling bar on the right side.

## Mistakes and corrections

The previous footer pass right-aligned Settings. This log corrects that to start-aligned and slightly larger.

## Handoff

When adding a Terminal or Plan surface, do not restore a dedicated Collapse icon. Re-click of the active surface (including Terminal or Plan once it exists) should hide the panel. Keep exhaustive `RightSidebarSurface` handling. Plan product: [`../../features/plan-agent/product.md`](../../features/plan-agent/product.md). Decision: [`2026-08-16-decision-plan-sidebar-surface.md`](./2026-08-16-decision-plan-sidebar-surface.md).
