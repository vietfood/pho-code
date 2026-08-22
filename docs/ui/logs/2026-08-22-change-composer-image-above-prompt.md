# Composer: image thumbs above the prompt

Kind: change
Status: in source
Surface: composer prepared-image row
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-21-change-composer-claude-code-layout.md`](./2026-08-21-change-composer-claude-code-layout.md)

## Intent

Owner asked to put attached-image thumbs above the prompt field and drop the helper under the thumbnails.

## Expected / actual (before)

Expected: thumbnails sit above “Send follow-up” / “Ask anything”; the composer does not explain image transmission under the thumb.
Actual: thumbs rendered below the editable field, followed by “Sending an image transmits it to the selected model provider.”

## Changes and decisions

- `composer-image-row` now renders at the top of the composer host, above `.composer-field`.
- Removed `.composer-image-disclosure` and its caption. Image admission still requires a vision-capable model; this is layout/copy only.
- Spacing moved from `margin-top` to `margin-bottom` on `.composer-image-row`.

## Verification

- **unit verified:** `bun test packages/ui/test/conversation.test.ts` — 17 pass; prepared thumbs appear before the composer textbox; the transmission caption is absent.
- **desktop:** not verified here.
- **packaged:** not verified.

## Owner feedback

2026-08-22: move the image above the send-follow-up prompt and remove the description below the image.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
