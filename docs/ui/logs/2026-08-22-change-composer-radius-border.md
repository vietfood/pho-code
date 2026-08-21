# Composer: less round, stronger border

Kind: change
Status: in source
Surface: composer shell
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-21-change-composer-claude-code-layout.md`](./2026-08-21-change-composer-claude-code-layout.md), [`2026-08-22-change-composer-context-chips-empty-only.md`](./2026-08-22-change-composer-context-chips-empty-only.md), [`2026-08-22-change-composer-glass-frost.md`](./2026-08-22-change-composer-glass-frost.md)

## Intent

Owner asked for a less rounded composer with a stronger outline. The 1rem radius plus a 6% hairline read as a faint pill rather than a field.

## Expected / actual (before)

Expected: a rounded rectangle with a clearly visible 1px border.
Actual: `--composer-radius: 1rem` and `rgb(0 0 0 / 6%)` / `rgb(255 255 255 / 6%)` borders, so the box looked soft and nearly borderless.

## Changes and decisions

- `--composer-radius` 1rem → 0.5rem (still rounded, not square).
- New `--composer-outline` mixes 28% foreground so the hairline tracks the palette instead of a near-invisible 6% black/white. Dark appearance uses 34% foreground so the same 1px stroke stays readable.
- Token highlight rings (max thinking, `@`, `/`) still override `border-color` on `.chat-composer-host::after`.

## Verification

- **unit verified:** `bun test packages/ui/test/appearance-theme.test.ts` — 7 pass.
- **desktop:** not verified here. `bun run dev` was already running for owner inspection.
- **packaged:** not verified.

## Owner feedback

2026-08-22: make the composer less round and its border stronger.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
