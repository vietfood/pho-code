# Composer picker overlap

Kind: feedback
Status: in source
Surface: composer `@` mention and `/` skill menus
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-thinking-shimmer-prompt-bar.md`](./2026-08-22-change-thinking-shimmer-prompt-bar.md)

## Intent

Owner asked to move the `/` skill menu just above the composer after seeing it sit on the field border.

## Expected / actual (before)

Expected: a gap between the picker and the composer outline.
Actual: the menu was a child of the padded host column, so `bottom: 100% + 0.5rem` cleared the prompt text, not the card border, and overlapped the top stroke.

## Changes and decisions

- `@` and `/` pickers render as children of `.chat-composer-shell`, the bordered card, matching Beautiful UI PromptBar (`bottom-full` + `mb-2`).
- The 0.5rem gap is unchanged; the containing block is what moved.

## Verification

- **unit verified:** `bun test packages/ui/test/composer-picker-menu.test.ts packages/ui/test/composer-highlight.test.ts packages/ui/test/composer-tokens.test.ts packages/ui/test/conversation.test.ts` — 24 pass.
- **desktop:** not verified here.
- **packaged:** not verified.

## Owner feedback

2026-08-22: move the skill menu just above the composer; the overlap is visible.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
