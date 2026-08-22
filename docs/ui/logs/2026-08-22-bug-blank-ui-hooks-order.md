# Blank window after bootstrap (hooks order)

Kind: bug
Status: in source
Surface: whole renderer (welcome and conversation)
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related: `feat: add new claude-style` (`5eb8d01`) floating Changes window

## Intent

Opening Pho Code after the Claude-style Changes window work should show the welcome launcher or conversation, not a blank window.

## Expected / actual (before)

Expected: Loading… then the shell.
Actual: React crashed as soon as bootstrap finished. `App` returned early while bootstrap was missing, then called an extra `useEffect` that closed the floating Changes window once bootstrap existed. That changes the hook count between renders (`Rendered more hooks than during the previous render`).

## Changes and decisions

- Moved that `useEffect` next to the other change-review effects, before the loading early-return.

## Verification

- **unit:** `bunx eslint apps/desktop/src/App.tsx` — no `react-hooks/rules-of-hooks` error (existing exhaustive-deps warnings only).
- **desktop:** HMR applied the file; a full window reload was not re-run here.
- **packaged:** not verified.

## Owner feedback

2026-08-22: the UI cannot show anymore after switching to `dev` and `bun run dev`.

## Handoff

If the Electron window is still blank, reload with ⌘⇧R / Ctrl+Shift+R (plain ⌘R toggles the right sidebar). Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
