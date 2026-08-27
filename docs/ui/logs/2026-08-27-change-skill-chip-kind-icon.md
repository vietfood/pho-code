# Skill chip: book kind glyph

Kind: change
Status: in source
Surface: composer and transcript `/` skill chip
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-composer-skill-chip-glyph.md`](./2026-08-22-change-composer-skill-chip-glyph.md), [`2026-08-22-change-transcript-skill-chip-icon.md`](./2026-08-22-change-transcript-skill-chip-icon.md), [`2026-08-27-change-skill-chip-contrast.md`](./2026-08-27-change-skill-chip-contrast.md)

## Intent

Owner still saw the skill mention as off after the orange-pill contrast pass. Next to a teal `@docs` file chip, the skill chip had no kind glyph, so it read as a muddy highlight instead of a matching mention.

## Expected / actual (before)

Expected: `/` skill chips sit in the same visual family as `@` file chips (kind glyph + name).
Actual: name-only orange wash; Type “Z” and source “Ph” were already removed; contrast-only restyle did not close the gap.

## Changes and decisions

- Transcript `SkillChip` and composer `createSkillChipElement` use Lucide BookOpen — the same kind glyph as Settings Skills.
- That is not the Type stroke and not a source mark. Source stays in `title` / `aria-label`.
- Orange pill selectors are `.mention-chip.skill-chip` so dark-mode orange is not overridden by teal `.mention-chip` color.
- Even `padding-inline` for nameless chips is gone; icon chips reuse the shared mention padding.

## Verification

- **unit verified:** `bun test packages/ui/test/skill-chip.test.ts packages/ui/test/conversation.test.ts` — 20 pass.
- **desktop:** not verified here.
- **packaged:** not verified.

## Owner feedback

2026-08-27: I still see this off (dark-theme user bubble: orange `tldraw-offline` without an icon beside teal `docs` with a file icon).

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
