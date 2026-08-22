# Lucide as the default work-entry icon pack

Kind: change
Status: in source
Surface: Settings Appearance; transcript tool and thought glyphs
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-tool-display-headings.md`](./2026-08-22-change-tool-display-headings.md)

## Intent

New installs and metadata without a stored pack should use Lucide, matching the T3 work-entry chrome. Pho original SVGs stay a Settings switch.

## Expected / actual (before)

Expected: Lucide on first launch; Pho still selectable.
Actual: `DEFAULT_WORK_ENTRY_ICONS` was `pho`, and missing/invalid `data-work-icons` fell back to Pho.

## Changes and decisions

- `DEFAULT_WORK_ENTRY_ICONS` is `lucide`. Missing metadata, unknown stored packs, and document/SSR fallbacks use that constant.
- Settings Icons lists Lucide first. Stored `pho` is kept; this is not a force-migrate of an explicit Pho choice.
- Pack union order stays `["pho", "lucide"]`.

## Verification

- **unit verified:** `bun test packages/application/test/settings.test.ts packages/ui/test/appearance-theme.test.ts packages/ui/test/work-entry-icon.test.ts` — 28 pass.
- **desktop:** not verified (existing `settings.spec.ts` already expects Lucide on a fresh user-data dir).
- **packaged:** not verified.

## Owner feedback

2026-08-22: keep the switchable packs, but make Lucide the default.

## Handoff

Living contracts: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../current-state.md`](../../current-state.md).
