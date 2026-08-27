# Settings: CodeX and Meteocons work-entry packs

Kind: change
Status: in source
Surface: Settings Appearance; transcript tool and thought glyphs
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-lucide-default-work-icons.md`](./2026-08-22-change-lucide-default-work-icons.md), [`2026-08-27-change-lobe-theme-marks.md`](./2026-08-27-change-lobe-theme-marks.md), [`2026-08-27-change-lobe-catalog-marks.md`](./2026-08-27-change-lobe-catalog-marks.md), [`2026-08-27-change-brand-icon-style.md`](./2026-08-27-change-brand-icon-style.md)

## Intent

Owner asked to add [CodeX Icons](https://github.com/codex-team/icons) for tool/thinking glyphs and [Meteocons](https://github.com/basmilius/meteocons) as a cute work-entry pack, without colliding with the Codex backend id.

## Expected / actual (before)

Expected: Settings Appearance can switch work-entry icons among Lucide (default), Pho, CodeX, and Meteocons; all packs follow `currentColor`.
Actual: only Lucide and Pho existed.

## Changes and decisions

- Protocol pack union is `pho | lucide | codex-team | meteocons`. Settings labels: Lucide, Pho, CodeX, Meteocons. Id `codex-team` avoids the Codex backend.
- Pin `@codexteam/icons` `0.3.3` and `@meteocons/svg-static` `0.1.0` on `@pho-code/ui`.
- CodeX SVGs are stroke/`currentColor` strings. Meteocons uses the **monochrome** set (not colorful `line` fills) via the same CSS-mask path as Lobe brand marks.
- GitHub work-entry rows still use the Lobe GitHub mark in every pack.
- Default remains Lucide. Unknown stored packs still coerce to Lucide.

## Verification

- **unit verified:** `bun test packages/ui/test/provider-icon.test.ts packages/ui/test/backend-icon.test.ts packages/ui/test/backend-picker.test.ts packages/ui/test/conversation.test.ts packages/ui/test/work-entry-icon.test.ts packages/ui/test/skills-settings.test.ts packages/ui/test/appearance-theme.test.ts packages/application/test/settings.test.ts` — 66 pass.
- **typecheck:** `bun run --filter @pho-code/ui typecheck` and `bun run --filter @pho-code/protocol typecheck` — 0 errors.
- **desktop:** not exercised as a Playwright journey (`settings.spec.ts` still asserts Lucide on a fresh user-data dir).
- **packaged:** not verified.

## Owner feedback

2026-08-27: add CodeX Icons for tools/thinking and Meteocons as another cute pack.
2026-08-27: use color Meteocons and a Color/Mono brand-mark option. Follow-up: [`2026-08-27-change-brand-icon-style.md`](./2026-08-27-change-brand-icon-style.md).

## Handoff

Living contracts: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../architecture/renderer-and-ui.md`](../../architecture/renderer-and-ui.md), [`../../current-state.md`](../../current-state.md). Attribution: [`../../references-and-attribution.md`](../../references-and-attribution.md).
