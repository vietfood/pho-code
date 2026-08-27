# Remove the streaming caret

Kind: change
Status: in source
Surface: live thinking and assistant output
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)

## Intent

Owner clarified that the vertical `I` visible during streaming was an unwanted synthetic caret. Live thinking and assistant output should show only the content and existing Working/Thinking status chrome.

## Changes

- Removed the synthetic caret from live assistant Markdown and live thinking text.
- Removed its CSS and unused component/test.
- Kept substantive-text gating: whitespace-only runs still show Working when no work entries exist.

## Verification

- **unit:** `bun test packages/ui/test/conversation.test.ts packages/ui/test/thinking-block.test.ts` — 22 passed.
- **desktop:** `bun run --filter @pho-code/desktop test:desktop -- tests/chat.spec.ts` — 4 passed.
- **packaged:** not verified.
