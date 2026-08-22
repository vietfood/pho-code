# Transcript: skill chip without source mark

Kind: change
Status: in source
Surface: user-message `/` skill chip
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-composer-skill-chip-glyph.md`](./2026-08-22-change-composer-skill-chip-glyph.md)

## Intent

Owner asked to drop the leftover source mark on a skill chip after the prompt is admitted. Composer chips were already name-only; the transcript still showed Built-in’s “Ph” (and a Cursor/Claude/Codex/Pi mark for other sources).

## Expected / actual (before)

Expected: admitted skill chips match the composer and show only the skill name.
Actual: `SkillChip` rendered `SkillSourceIcon` before the label.

## Changes and decisions

- Transcript `SkillChip` is name-only. Source stays in `title` (`Built in · skill-name`) and `aria-label` (`/source:name`).
- `/` picker rows and Settings inventory still show source icons.
- `InlineChip.icon` is optional so file/GitHub chips keep their glyphs.

## Verification

- **unit verified:** `bun test packages/ui/test/conversation.test.ts` — 18 pass; admitted skill chips include the name and omit the Built-in “Ph” mark.
- **desktop:** not verified here.
- **packaged:** not verified.

## Owner feedback

2026-08-22: after we enter chat, the skill still has that icon — remove this too.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
