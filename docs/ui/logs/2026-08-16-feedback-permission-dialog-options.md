# Permission dialog: three clean options

Kind: feedback
Status: implemented; not accepted
Surface: composer-dock permission card
Owner: ui/conversation chrome
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-16-change-ask-user-card.md`](./2026-08-16-change-ask-user-card.md), [`2026-08-16-feedback-permission-dialog-chrome.md`](./2026-08-16-feedback-permission-dialog-chrome.md)

## Intended change

Owner asked for a cleaner permission card:

- Allow once
- Allow for this session
- No, provide reason (reason can be empty)

## Expected / actual (before)

Expected: three short actions; deny can include a reason or not.

Actual: the permission package offered four verbose RPC labels (`Yes`, `Yes, allow … for this session`, `No`, `No, provide reason`), then a second input card for the reason.

## Changes and decisions

- UI remaps the four permission-system options to the three labels. Other select dialogs are unchanged.
- Choosing **No, provide reason** shows an optional reason field on the same card. Empty reason is allowed.
- Select resolution may send `value` with the reason. The extension host answers the package's follow-up `input()` without a second dialog. Resolving `No, provide reason` without `value` still shows the follow-up, so programmatic/runtime callers stay compatible.

## Verification

- Unit verified: `packages/ui/test/permission-prompt.test.ts`, `packages/ui/test/host-dialog.test.ts`.
- Integration verified: `packages/runtime/test/pi-runtime.test.ts` (follow-up input still appears without `value`; skipped when `value` is supplied).
- Desktop verified: `apps/desktop/tests/permission.spec.ts`, `host-ui.spec.ts`, `settings.spec.ts` after `electron-vite build`.
- `bun run typecheck` passed. `bun run lint` passed with existing unrelated react-hooks warnings.

## Owner feedback

2026-08-16: drop the verbose Yes/No pair; keep session allow; deny with an optional reason.

## Handoff

Product chrome is the conversation-UI permission dock. Do not fork `@gotgenes/pi-permission-system`; labels stay a presentation mapping over its RPC strings.
