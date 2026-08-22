# Appearance reverts while a new chat is created

Kind: bug  
Status: implemented  
Surface: appearance settings / conversation cache  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-20-change-glass-settings-composer-center.md`](./2026-08-20-change-glass-settings-composer-center.md), [`2026-08-22-change-appearance-installed-fonts.md`](./2026-08-22-change-appearance-installed-fonts.md)

## Intended change

Keep the chosen palette and mode applied when a process-scoped runtime event arrives, so creating a chat cannot revert the theme.

## Expected / actual (before)

Expected: appearance changes only when the owner changes them.

Actual: creating a new chat flipped the window back to the previously saved palette and mode. Opening Settings restored the correct theme, because `openSettings` refetches `getSettings()`.

Root cause: settings had two owners. `ConversationCacheState.settings` held the process-wide copy, and every `ConversationViewState` in `byKey` also held a copy written once by `putSnapshot` when that chat was opened. `applySettings` only updated the cache copy, so an already open chat kept the appearance from the moment it was opened. The process-scoped branch of `applyRuntimeEventToCache` then rebuilt the cache copy *from the selected chat's* copy, republishing the stale appearance; the `App.tsx` appearance effect saw a changed object and re-applied the old palette to `<html>`.

Extension hosts are per session (`bindHostUi`), each starting `yoloActive = false`, so a new chat binding the permission extension with YOLO on emits `permissionStatus`. That lands while the previous chat is still selected, because selection only moves after `createSession` resolves. `providerAuthFlow` events reach the same branch. A chat first seen through a runtime event also started with `settings: null`, which wiped the cache copy entirely.

## Changes and decisions

- `ConversationViewState` no longer carries `settings` or `authFlow`. Per-session chrome is snapshot, dialog, and notification only.
- Process-scoped events (`settingsSnapshot`, `permissionStatus`, `providerAuthFlow`) are reduced against the cache in a new `applyProcessScopedEvent` and never read session state.
- `selectedConversation` and `putSnapshot` no longer merge or store a per-session settings copy; `App.tsx` reads `cache.settings` and `cache.authFlow` directly.

## Verification

- Unit verified: `bun test packages/protocol` — 65 pass, 2 fail. Both failures are the unrelated in-progress `CHANGE_REVIEW_COPY` edit in `packages/protocol/src/change-review.ts`; they pass with that file stashed. New coverage: a process-scoped event on a selected chat keeps the appearance and still applies `yoloMode`.
- `bun run typecheck` — clean. `bun run lint` — 0 errors (8 pre-existing warnings).
- Desktop verified: `bunx playwright test tests/settings.spec.ts` — 2 pass, including the new regression that delivers a `permissionStatus` envelope to an already open chat and asserts the palette stays `gruvbox`/`dark`.
- Desktop verified: full `bunx playwright test` — 24 pass, 2 fail. `credentials.spec.ts` and `oauth.spec.ts` fail only because the in-progress `provider-accounts.tsx` edit removed the "About this login" disclosure those specs click; both pass with that file stashed and this fix applied.

Before the fix, the same injected event moved the document from `{palette: gruvbox, appearance: dark}` to `{palette: default, appearance: light}`, and back to gruvbox dark once Settings was opened.

## Owner feedback

"The color scheme switches when I create a new session; only when I click to Settings does it have the right color scheme again."

## Mistakes and corrections

The per-session settings copy was redundant from the start: `selectedConversation` already preferred the cache copy, so the stored copy could only ever be a stale duplicate.

## Handoff

Unrelated finding, not fixed here: on launch the renderer paints unthemed (default light) until the first `getBootstrapState()` response applies the persisted appearance. Measured 139 ms in the deterministic lane, but it is gated on Pi boot, so it will be longer in normal use. That belongs with [`../../urgent/window-first-pi-core/`](../../urgent/window-first-pi-core/).
