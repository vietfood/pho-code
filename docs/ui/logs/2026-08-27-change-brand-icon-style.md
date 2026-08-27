# Settings: brand Color/Mono and colorful Meteocons

Kind: change
Status: in source
Surface: Settings Appearance; model/backend/provider marks; transcript Meteocons glyphs
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-27-change-lobe-theme-marks.md`](./2026-08-27-change-lobe-theme-marks.md), [`2026-08-27-change-lobe-color-openrouter.md`](./2026-08-27-change-lobe-color-openrouter.md), [`2026-08-27-change-work-entry-icon-packs.md`](./2026-08-27-change-work-entry-icon-packs.md)

## Intent

Owner asked for colorful Meteocons (not monochrome) and a Settings option so provider/backend/model marks can be Color or Mono. Color marks need a border or contrast treatment so lime/white logos stay visible. A first optical scale of `2.35` with `overflow: visible` made Meteocons spill out of the Lucide slot; they must stay in that 14px box.

## Expected / actual (before)

Expected: Meteocons fill artwork reads at the same size as Lucide/Pho; brand marks can be colorful without washing out on cream Default.
Actual: Meteocons used monochrome CSS masks and looked undersized in the 128 viewBox padding; brand marks were mono-only after the OpenRouter lime washout.

## Changes and decisions

- Protocol `appearance.brandIcons`: `"mono"` (default) or `"color"`. Settings Appearance **Brand marks** → Color / Mono (`appearance-brand-icons-color` / `appearance-brand-icons-mono`).
- Color brand marks use Lobe `-color.svg` (or `-brand-color.svg` when that is the only color file) as `<img>` on a light plate with a hairline. Brands without a color file stay on the mono `currentColor` mask.
- Meteocons pack uses the colorful **fill** set. Artwork is scaled `1.7` inside `overflow: hidden` so 128-viewBox padding is cropped without overflowing the 14px Lucide slot (an earlier `2.35` / `overflow: visible` pass was too huge).

## Verification

- **unit verified:** `bun test packages/ui/test/provider-icon.test.ts packages/ui/test/backend-icon.test.ts packages/ui/test/backend-picker.test.ts packages/ui/test/work-entry-icon.test.ts packages/ui/test/appearance-theme.test.ts packages/application/test/settings.test.ts packages/ui/test/conversation.test.ts packages/protocol/test/protocol.test.ts packages/protocol/test/session-lifecycle.test.ts` — 109 pass.
- **typecheck:** `bun run --filter @pho-code/ui typecheck` and `bun run --filter @pho-code/protocol typecheck` — 0 errors. `@pho-code/application` typecheck still fails in unrelated `hosted-runtime.ts` / pho-agent typings (not this slice).
- **lint:** `@pho-code/ui lint` — 0 errors; 2 pre-existing `react-hooks/exhaustive-deps` warnings in `ask-user-card.tsx` and `context-prompt-dialog.tsx`.
- **desktop:** not exercised as a Playwright journey (`settings.spec.ts` still asserts Lucide on a fresh user-data dir).
- **packaged:** not verified.

## Owner feedback

2026-08-27: use color Meteocons, not monochrome; add Color/Mono for provider/backend marks, with a border or contrast so they stay visible.
2026-08-27: Meteocons were too small compared to Lucide and Pho.
2026-08-27: after the first scale-up, Meteocons were too huge.

## Handoff

Living contracts: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../architecture/renderer-and-ui.md`](../../architecture/renderer-and-ui.md), [`../../current-state.md`](../../current-state.md). Attribution: [`../../references-and-attribution.md`](../../references-and-attribution.md).
