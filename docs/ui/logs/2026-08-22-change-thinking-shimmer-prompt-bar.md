# Thinking shimmer and prompt-bar picker chrome

Kind: change
Status: in source
Surface: live Working/Thinking labels; composer `@` mention and `/` skill menus
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-composer-skill-chip-glyph.md`](./2026-08-22-change-composer-skill-chip-glyph.md), [`2026-08-21-change-composer-claude-code-layout.md`](./2026-08-21-change-composer-claude-code-layout.md), [`2026-08-22-feedback-composer-picker-overlap.md`](./2026-08-22-feedback-composer-picker-overlap.md), [`2026-08-22-change-thinking-sparkle-stream-text.md`](./2026-08-22-change-thinking-sparkle-stream-text.md)

## Intent

Owner asked for Beautiful UI’s live thinking header (moving text highlight plus a sparkle) and PromptBar `@` / `/` menu chrome, following [globals.css](https://github.com/slev12397/beautiful-ui/blob/main/app/globals.css).

## Expected / actual (before)

Expected: while a run is live, Working/Thinking copy reads as in-progress; `@` and `/` pickers match PromptBar density (gliding highlight, pop-in, name + description, type-to-search footer).
Actual: waiting chrome was static “Working” text with a pulse dot on live thought rows; mention/skill menus used per-row hover backgrounds and stacked name/path lines.

## Changes and decisions

- Live Work log, waiting “Working”, and live Thinking headings use a four-point sparkle and `shimmer-text` on the label. Settled work-log summaries keep the sparkle muted, without the shimmer. `prefers-reduced-motion` keeps solid muted text.
- `@` and `/` menus share `ComposerPickerMenu`: pop-in panel, one gliding highlight, single-line name + description, and a type-to-search footer. Keyboard ↑↓ and hover move the same highlight.
- Dictation, `glimm` rainbow sweep, autoplay, and demo catalogs stay omitted.

## Verification

- **unit verified:** `bun test packages/ui/test/thinking-block.test.ts packages/ui/test/work-log.test.ts packages/ui/test/conversation.test.ts packages/ui/test/composer-picker-menu.test.ts packages/ui/test/composer-highlight.test.ts packages/ui/test/composer-tokens.test.ts` — 37 pass.
- **typecheck / lint:** not clean on this run; `packages/ui/src/settings-view.tsx` has a pre-existing unused `CHANGE_LEDGER_DISCLOSURE` import outside this slice.
- **desktop:** not verified here.
- **packaged:** not verified.

## Owner feedback

2026-08-22: add the moving highlight and star on thinking/working copy; follow Beautiful UI globals.css; use the PromptBar script for skills and mentions.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
