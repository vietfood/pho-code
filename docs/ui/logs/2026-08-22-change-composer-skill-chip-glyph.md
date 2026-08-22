# Composer: skill chip without type glyph

Kind: change
Status: in source
Surface: composer `/` skill chip
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-composer-image-above-prompt.md`](./2026-08-22-change-composer-image-above-prompt.md)

## Intent

Owner asked to drop the “Z” prefix on a selected skill chip such as `bug-and-test-diagnosis`.

## Expected / actual (before)

Expected: the chip shows the skill name.
Actual: `createSkillChipElement` prefixed a Lucide Type stroke that reads as a “Z”.

## Changes and decisions

- Composer skill chips render the skill name only. Source identity stays in the chip `title` / `aria-label` (`/source:name`) and in the `/` picker row icons.
- Transcript `SkillChip` still shows the source mark (Built-in / Cursor / …). That glyph is not the Type “Z”.
- `.skill-chip` uses even inline padding now that the composer chip has no leading icon.

## Verification

- **unit verified:** `bun test packages/ui/test/composer-tokens.test.ts packages/ui/test/conversation.test.ts` — 20 pass; token insert/parse unchanged.
- **desktop:** not verified here.
- **packaged:** not verified.

## Owner feedback

2026-08-22: remove the “Z” in the skill mention.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
