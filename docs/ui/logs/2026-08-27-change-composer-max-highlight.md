# Composer: no max-thinking outline ring

Kind: change
Status: in source
Surface: composer shell
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-composer-radius-border.md`](./2026-08-22-change-composer-radius-border.md), [`2026-08-22-change-thinking-shimmer-prompt-bar.md`](./2026-08-22-change-thinking-shimmer-prompt-bar.md)

## Intent

Owner asked to drop the purple prompt-bar ring around the composer field when a model's top thinking level is selected (High / Max / Extra high / Ultra). The thinking-level label can stay purple.

## Expected / actual (before)

Expected: choosing the highest thinking level for any model leaves the composer outline as the default hairline.
Actual: `isMaxThinkingLevel` painted `data-composer-highlight="max"` and a purple `::after` ring on `.chat-composer-shell`.

## Changes and decisions

- `composerHighlight` only returns `mention` / `slash` / `none`. Max thinking no longer colors the field.
- Removed `.chat-composer-shell.is-max` outline CSS. The thinking selector keeps `is-max` purple text.
- `@` and `/` token rings are unchanged.

## Verification

- **unit verified:** `bun test packages/ui/test/composer-highlight.test.ts packages/ui/test/conversation.test.ts packages/ui/test/thinking-level-chip.test.ts packages/ui/test/thinking-labels.test.ts` — 25 pass.
- **typecheck / lint:** `bun run --filter @pho-code/ui typecheck` and `bun run --filter @pho-code/ui lint` — 0 errors; two pre-existing `react-hooks/exhaustive-deps` warnings in `ask-user-card.tsx` and `context-prompt-dialog.tsx` outside this slice.
- **desktop:** not exercised as a Playwright journey. `bun run dev` was already running; Vite HMR applied `composer.tsx` and `theme.css`. Owner can confirm the default hairline on max thinking in that window.
- **packaged:** not verified.

## Owner feedback

2026-08-27: remove the composer highlight when max mode is chosen on each model.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
