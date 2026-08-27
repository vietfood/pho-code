# Skill chip: visible orange pill

Kind: change
Status: in source
Surface: composer and transcript `/` skill chip
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-composer-skill-chip-glyph.md`](./2026-08-22-change-composer-skill-chip-glyph.md), [`2026-08-22-change-transcript-skill-chip-icon.md`](./2026-08-22-change-transcript-skill-chip-icon.md)

## Intent

Owner said the skill mention next to an `@` file chip looked a little off. Name-only chips stay; the pill should read as clearly as the teal file chip.

## Expected / actual (before)

Expected: a `/` skill chip is a readable orange pill on the user bubble, sitting on the same line as `@` chips.
Actual: amber-700 at 16% mix on `--message-surface` collapsed to muddy brown text on a near-invisible peach wash, shorter than the icon-backed file chip.

## Changes and decisions

- Skill chips keep the skill name only (no Type glyph, no source mark).
- Light pill uses orange-700 (`#c2410c`) for both mix and text at 20%; dark uses orange-400 mix at 26% with orange-300 text.
- `min-height: 1em` matches the Lucide icon slot on `@` / GitHub chips.
- Composer `/` prompt-bar ring uses the same orange.

## Verification

- **unit verified:** `bun test packages/ui/test/skill-chip.test.ts packages/ui/test/conversation.test.ts packages/ui/test/mention-chip.test.ts packages/ui/test/github-chip.test.ts` — 23 pass.
- **desktop:** not verified here.
- **packaged:** not verified.

## Owner feedback

2026-08-27: the skill mentioned is a little bit off (screenshot of a user bubble with an orange skill chip beside a teal `docs` file chip).

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
