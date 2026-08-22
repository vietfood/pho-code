# Image-model warning stays on screen

Kind: bug
Status: in source
Surface: shell command-error banner above the conversation
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-composer-image-above-prompt.md`](./2026-08-22-change-composer-image-above-prompt.md), [`2026-08-22-change-web-tool-site-icons.md`](./2026-08-22-change-web-tool-site-icons.md)

## Intent

Owner pasted an image onto a model that does not accept images. The red “The selected model does not accept images.” banner should go away after a short wait.

## Expected / actual (before)

Expected: the warning is transient and clears on its own after a few seconds.
Actual: `runCommand` stored the message on the shell `error` banner and left it until the next command or session switch.

## Changes and decisions

- After bootstrap, a command-error banner auto-clears after 5 seconds. Bootstrap-failed loading errors are unchanged and stay until a later command replaces them.
- Next command still clears immediately (`setError(null)` at the start of `runCommand`).

## Verification

- **unit:** not separately tested (timer lives in `apps/desktop/src/App.tsx`).
- **desktop:** not verified.
- **packaged:** not verified.

## Owner feedback

2026-08-22: the warning image/banner did not clear after a while.

## Handoff

Living contracts: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../current-state.md`](../../current-state.md).
