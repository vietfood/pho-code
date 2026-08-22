# Unify Appearance size and family rows

Kind: change
Status: in source
Surface: Settings Appearance / typography
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-appearance-installed-fonts.md`](./2026-08-22-change-appearance-installed-fonts.md)

## Intent

Owner liked installed UI/code fonts but asked to unify font-size and font-family chrome so the panel reads as one typography list, not two control styles.

## Expected / actual (before)

Expected: every typography setting uses the same row — title + short description on the left, compact control on the right.
Actual: size rows were label + stepper with no description; family pickers were stacked title, description, and a full-width dropdown. Smoothing already matched the compact-right pattern.

## Changes and decisions

- Shared `AppearanceSettingRow`: label + description left, a `w-44` control column right.
- Size steppers and family pickers are control-only. Size rows now have the same description treatment as family/smoothing.
- Code preview stays full-width under the code-family row. Testids are unchanged.

## Owner feedback

2026-08-22: love the installed-font pickers; make size + family design the same.

## Verification

- **unit verified:** `bun run typecheck` pass. `bun run lint` 0 errors (9 pre-existing hook warnings).
- **desktop verified:** `bunx electron-vite build && bunx playwright test tests/settings.spec.ts` from `apps/desktop` — 2 pass (Lucida Grande / Menlo persist; smoothing off persists; size testids still wrap `18px` / `16px`).
- **packaged:** not verified.

## Handoff

Chrome only. Do not add a second code size, a font-file picker, or a separate terminal family without an explicit scope change.
