# Unified surface color across sidebars and chat

Kind: change  
Status: implemented  
Surface: shell sidebar / right-sidebar host / composer chrome / appearance glass  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-16-change-sidebar-dividers.md`](./2026-08-16-change-sidebar-dividers.md), [`2026-08-19-change-glass-composer-right-bar.md`](./2026-08-19-change-glass-composer-right-bar.md), [`2026-08-20-change-glass-settings-composer-center.md`](./2026-08-20-change-glass-settings-composer-center.md), [`2026-08-22-change-composer-radius-border.md`](./2026-08-22-change-composer-radius-border.md)

## Intended change

Owner asked for a cleaner, Claude Desktop-like look: the left sidebar, chat pane, and right sidebar should share one surface color instead of reading as different shades, with the palette otherwise unchanged.

## Expected / actual (before)

Expected: one continuous surface color across the shell; panes separate through the hairline shell divider.

Actual: every palette mapped `--sidebar` to its own shade (default dark: sidebar `#0f0f0f` vs background `#0a0a0a`), and glass mode filled sidebars 12 opacity points below the pane (`glassCssTokens`: "sidebars are the most open"), so the bars and the chatbox read as different colors — most visible with Frosted glass on, where the wallpaper tinted each surface differently.

## Changes and decisions

- `packages/ui/src/theme-palettes.css`: `--sidebar: var(--background)` in every palette block (default, Gruvbox, Catppuccin, Flexoki, GitHub, One Dark). Row hover/selected alphas, foregrounds, and all other tokens are unchanged, so each palette keeps its hues; only the second surface shade is gone. This also unifies the collapsed overlay pills and the right-rail icon strip, which both use `bg-sidebar`.
- `packages/protocol/src/settings.ts`: `glassCssTokens` now returns `sidebarOpacityPercent = opacityPercent` (and the composer midpoint simplifies to the same value), so glass fills are identical on every surface. The sidebar keeps its stronger CSS blur (`sidebarBlurPx`) for depth without a hue shift.
- `packages/ui/src/theme.css`: composer drop shadows softened toward the flatter Claude look — light `0 16px 36px -22px / 35%` → `0 8px 24px -14px / 16%`, dark `0 18px 40px -24px / 70%` → `0 12px 28px -18px / 50%`. The owner-requested stronger composer outline (28% foreground) and the 18% `--shell-divider` hairline are unchanged; with unified fills the divider is now the only pane separation.
- Tests updated for the new glass contract: `packages/protocol/test/protocol.test.ts` (shared fill, renamed test) and `apps/desktop/tests/settings.spec.ts` (sidebar glass opacity now equals pane opacity).

## Verification

- **unit verified:** `bun test packages/protocol/test/protocol.test.ts packages/ui/test/appearance-theme.test.ts packages/ui/test/right-sidebar.test.ts` — 41 pass. Full `bun test` — 809 pass, 11 fail; all 11 are sandbox/skill-source tests failing with `EPERM` on home-directory `mkdtemp` inside the agent sandbox, unrelated to this change.
- **typecheck/lint:** `bun run typecheck` clean; `bun run lint` 0 errors (9 pre-existing warnings in untouched files).
- **desktop verified:** `bun run test:desktop -- tests/settings.spec.ts` — 2 pass, including the updated sidebar-opacity assertion. Visual check in the real Electron surface (deterministic test model, temporary spec, since removed): dark and light screenshots show one continuous surface across left sidebar, chat, and the expanded Context prompt panel.
- **packaged:** not verified; chrome-only CSS and a settings token, no packaged resources touched.

## Owner feedback

2026-08-27: "make the color more consistent (sidebar left and right, etc.)… can we make it the same color as chatbox" — clean like Claude Desktop.

## Mistakes and corrections

- A direct `window.phoCode.updateAppearanceSettings` call from a scratch spec did not re-apply appearance (the attribute stayed `light`); driving the real Settings UI (Appearance tab → mode button) worked. Not a product defect found — the UI path is the supported one — but the bridge-only path was not investigated further.

## Handoff

- The Terminal panel surface is owned by the terminal add-on; when it lands, its theme should follow the palette `--background` so it does not reintroduce a mismatched pane.
- If a future palette wants a distinct sidebar shade again, revert that palette's `--sidebar` line only; the glass opacity equality is now the contract tested in `protocol.test.ts`.
