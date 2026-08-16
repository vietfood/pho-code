# Permission dialog: quieter chrome

Kind: feedback
Status: implemented; not accepted
Surface: composer-dock permission card
Owner: ui/conversation chrome
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-16-feedback-permission-dialog-options.md`](./2026-08-16-feedback-permission-dialog-options.md)

## Intended change

After the three-option labels landed, the owner still found the card verbose. Drop stacked chrome and keep the action, the command, and the choices.

## Expected / actual (before)

Expected: one short title, the command, three options.

Actual: “Pending approval” + “Permission Required” + “The agent wants to run a shell command.” + COMMAND label + shortcut chips.

## Changes and decisions

- Permission asks use the action as the title (`Run a shell command`), not the generic package title.
- The command/path/URL sits in the target box without an uppercase label.
- Digit shortcuts still work; the `2` / `3` keycaps are hidden on this card.
- Confirm/input dialogs that are not permission asks keep the previous eyebrow/title.

## Verification

- Unit verified: `packages/ui/test/permission-prompt.test.ts`, `packages/ui/test/host-dialog.test.ts`.
- Desktop verified: `ask-user.spec.ts`, `host-ui.spec.ts`, `permission.spec.ts`, `settings.spec.ts` after `electron-vite build`.

## Owner feedback

2026-08-16: make the style less verbose and more clean.

## Handoff

Follow-on to the three-option mapping. Do not restore “The agent wants to…” copy on this card.
