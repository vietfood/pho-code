# Composer context chips: empty session only

Kind: change
Status: in source
Surface: composer rail (hero vs docked)
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-21-change-composer-claude-code-layout.md`](./2026-08-21-change-composer-claude-code-layout.md), [`2026-08-22-change-composer-radius-border.md`](./2026-08-22-change-composer-radius-border.md)

## Intent

Owner asked to hide the local-machine (“This Mac”) and workspace folder chips once a chat has messages. They should remain on a new/empty session so the owner can see which folder and machine the first prompt will use.

## Expected / actual (before)

Expected: context chips on the empty-session hero only.
Actual: the shared composer rail showed machine and workspace chips in both the hero and the docked follow-up composer.

## Changes and decisions

- `ComposerRail` takes `showContextChips` (default on). Empty sessions pass it; docked chats pass false. With chips off and no attach control, the rail unmounts so it does not leave a gap.
- Image attach can still sit on the docked rail when the selected model accepts images. That control is not session-context chrome.
- No protocol change. Workspace identity is unchanged; this is presentation only.

## Verification

- **unit verified:** `bun test packages/ui` — 267 pass (composer-rail hides chips when `showContextChips` is false; docked conversation markup has no machine/workspace chips).
- **typecheck:** `bun run --filter @pho-code/ui typecheck` — pass. **lint:** eslint on the changed TS files — 0 errors.
- **desktop:** not verified here. `bun run dev` was already running for owner inspection, so this change did not rebuild Electron or run Playwright. `apps/desktop/tests/host-ui.spec.ts` now asserts chips on a new session and their absence after the first turn; next check is `bunx playwright test tests/host-ui.spec.ts` from `apps/desktop` (or `bun run test:desktop`).
- **packaged:** not verified.

## Owner feedback

2026-08-22: remove This Mac and the workspace folder chip during an active chat; keep them on new session only.

## Handoff

Living contracts: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
