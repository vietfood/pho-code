# Composer: model/thinking menus stay in the chat column

Kind: change
Status: in source
Surface: composer toolbar (model picker, thinking menu, usage)
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-27-change-composer-max-highlight.md`](./2026-08-27-change-composer-max-highlight.md), [`2026-08-21-change-composer-claude-code-layout.md`](./2026-08-21-change-composer-claude-code-layout.md), [`2026-08-16-bug-model-picker-gap.md`](./2026-08-16-bug-model-picker-gap.md)

## Intent

Owner asked to stop the model picker and thinking-level menu overlapping when the right sidebar is open.

## Expected / actual (before)

Expected: with Changes (or another tile) open, the composer toolbar still fits, and opening model or thinking lists stays inside the chat column.
Actual: the trailing group could not shrink (`flex-shrink: 0`), so a long model name collided with thinking/usage. Model and thinking popovers were `left: 0` with `84vw` max width, so they grew into the sidebar and sat on the toolbar row.

## Changes and decisions

- Trailing toolbar group shrinks; the model trigger truncates. Thinking and usage stay content-sized.
- Model, thinking, and usage menus open from the right edge of their trigger, capped to the chat/empty-session column (`100cqi`) instead of the window.
- Toolbar stacks above the composer field so the lists are not painted under the prompt card.
- Thinking list scrolls if it is taller than half the viewport.

## Verification

- **unit verified:** `bun test packages/ui/test/appearance-theme.test.ts packages/ui/test/conversation.test.ts packages/ui/test/composer-toolbar.test.ts packages/ui/test/thinking-level-chip.test.ts packages/ui/test/model-picker-groups.test.ts` — 35 pass.
- **typecheck / lint:** `bun run --filter @pho-code/ui typecheck` and `bun run --filter @pho-code/ui lint` — 0 errors; two pre-existing `react-hooks/exhaustive-deps` warnings outside this slice.
- **desktop:** not exercised as a Playwright journey. `bun run dev` was already running; Vite HMR applied `theme.css`, `model-picker.tsx`, and `thinking-level-chip.tsx`. Owner can confirm with Changes open: truncated model name and menus that stay in the chat column.
- **packaged:** not verified.

## Owner feedback

2026-08-27: when the sidebar is open, thinking mode and model choosing overlap; make that better.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
