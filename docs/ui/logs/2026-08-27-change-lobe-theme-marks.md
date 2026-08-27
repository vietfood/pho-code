# Composer: theme-following Lobe marks

Kind: change
Status: in source
Surface: model picker, backend picker, provider accounts, skill sources
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-27-change-lobe-brand-icons.md`](./2026-08-27-change-lobe-brand-icons.md), [`2026-08-27-change-lobe-color-openrouter.md`](./2026-08-27-change-lobe-color-openrouter.md), [`2026-08-27-change-brand-icon-style.md`](./2026-08-27-change-brand-icon-style.md)

## Intent

Owner reported OpenRouter’s neon-lime color mark is nearly invisible on the light cream picker and asked for color-agnostic brand icons.

## Expected / actual (before)

Expected: compact brand marks stay readable on light and dark palettes, including cream Default.
Actual: Lobe `-color.svg` files rendered as `<img>` with hardcoded fills (`openrouter-color.svg` is `#C8FF00`), so lime/white marks washed out on cream chrome.

## Changes and decisions

- Use Lobe’s mono SVGs only (`openrouter.svg`, `claude.svg`, …) and paint them with `currentColor` via CSS mask. Marks inherit `--muted-foreground` / `--foreground` instead of brand hues.
- Keep OpenRouter catalog ids on the OpenRouter mark; that mark is now the mono glyph, not the lime color file.
- Map Lobe `kimi` and `opencode` (and `moonshotai` → Moonshot). Kimi model ids resolve to Kimi rather than Moonshot.

## Verification

- **unit verified:** `bun test packages/ui/test/provider-icon.test.ts packages/ui/test/backend-icon.test.ts packages/ui/test/backend-picker.test.ts packages/ui/test/conversation.test.ts packages/ui/test/work-entry-icon.test.ts packages/ui/test/skills-settings.test.ts` — 36 pass (theme-following slice). Later catalog/pack checks: 66 pass, recorded in [`2026-08-27-change-lobe-catalog-marks.md`](./2026-08-27-change-lobe-catalog-marks.md).
- **typecheck:** `bun run --filter @pho-code/ui typecheck` — 0 errors.
- **desktop:** not exercised as a Playwright journey.
- **packaged:** not verified.

## Owner feedback

2026-08-27: some icons are hard to see; make them color-agnostic.
2026-08-27: Color/Mono option with a contrast plate. Follow-up: [`2026-08-27-change-brand-icon-style.md`](./2026-08-27-change-brand-icon-style.md).

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md). Color-variant experiment: [`2026-08-27-change-lobe-color-openrouter.md`](./2026-08-27-change-lobe-color-openrouter.md). Catalog coverage: [`2026-08-27-change-lobe-catalog-marks.md`](./2026-08-27-change-lobe-catalog-marks.md).
