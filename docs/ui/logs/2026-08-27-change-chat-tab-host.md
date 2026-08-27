# Chat tab host change

Kind: change  
Status: implemented  
Surface: main chat region  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md) slice 16  
Decision record: [`2026-08-27-decision-chat-tab-host.md`](./2026-08-27-decision-chat-tab-host.md)  
Related logs: [`2026-08-27-decision-right-sidebar-tiling-tabs.md`](./2026-08-27-decision-right-sidebar-tiling-tabs.md), [`2026-08-27-change-right-sidebar-tiling-tabs.md`](./2026-08-27-change-right-sidebar-tiling-tabs.md), [`2026-08-16-change-split-pane-chat-fill.md`](./2026-08-16-change-split-pane-chat-fill.md), [`2026-08-22-bug-blank-ui-hooks-order.md`](./2026-08-22-bug-blank-ui-hooks-order.md)

## Intent

Give the main chat region multiple open chats as a browser-style tab strip over a single floating chat window, per the linked decision. Opening a session from the sidebar appends or activates a tab instead of replacing the visible conversation; the active tab is `selectedKey`, so the sidebar selection, right-sidebar surfaces, and Changes overlay follow it.

## Changes

- `packages/ui/src/lib/chat-tabs.ts` (new): pure tab-strip helpers — open-or-focus, close with right-then-left neighbor activation, `replaceChatTabKey` for pending-new tabs, localStorage persistence (`pho-code.chatTabs`) with revalidation on read and one-time migration from the short-lived `pho-code.chatTiles` tiling layout.
- `packages/ui/src/chat-tab-host.tsx` (new): the region host — tab strip (`role="tablist"`, per-tab icon or 3×3 running dots, truncated title, close control, ArrowLeft/ArrowRight activation) above one active floating window card; the region topbar slot carries the global chrome.
- `packages/ui/src/lib/live-run-store.ts`: per-key subscriptions (`subscribeLiveRunKey`, `useLiveRunForKey`) with the same `requestAnimationFrame` batching, so a transcript streams from its own session key.
- `packages/ui/src/transcript.tsx`: the live tail subscribes with `useLiveRunForKey(liveKey)`.
- `packages/ui/src/conversation.tsx`: body-only — the per-chat title and surface icons left the component (the tab strip and region topbar own them); the composer keeps the single `composer-input` id because only the active tab mounts.
- `packages/ui/src/chat-pane-loading.tsx`: body-only loading pane for a tab whose snapshot is still opening.
- `packages/ui/src/tile-divider.tsx` (new): the draggable divider extracted from `right-sidebar.tsx` unchanged (right-sidebar only; the tab host has no divider).
- `apps/desktop/src/use-chat-tabs.ts` (new, replaces `use-session-switch.ts`): owns the persisted tab strip, per-tab composer chrome (draft + images), pending-tab loading with token guards, temporary keys for new sessions, and selection sync (`selectedKey` + live-run selection follow the active tab). Closing a tab is view-only; archive/Trash closes the session's tab; closing the last tab keeps the auto-advance to the next unarchived session or a new one.
- `apps/desktop/src/App.tsx`: renders `ChatTabHost`; sidebar session click is open-or-focus; Home closes every tab and returns to the welcome launcher; relaunch restores the strip and loads the active tab (background tabs load lazily on activation).
- `packages/ui/src/index.ts`: exports the tab host and helpers.

## Verification

- **unit verified:** `bun test packages/ui/test/chat-tabs.test.ts packages/ui/test/conversation.test.ts` — 34 pass, 0 fail (open-or-focus, neighbor activation on close, key replacement, persistence round-trip, unknown-session revalidation, corrupt-JSON fallback, legacy tiling migration; conversation body-only assertions).
- **unit verified:** `bun run typecheck` — clean across all packages.
- **unit verified:** `bun run lint` — 0 errors (9 pre-existing warnings).
- **unit verified:** `bun test` — 845 pass, 13 fail; all 13 are pre-existing/environmental and unrelated to this change (2 appearance-theme assertions track the owner's uncommitted `theme.css` work; 4 skill-source and 7 sandbox-runtime tests fail only inside the nested command sandbox — `sandbox-runtime.test.ts` passes unsandboxed).
- **desktop verified:** `bun run test:desktop` (electron-vite build + Playwright, real Electron surface) — 31/31 pass, including background-run switching (`session-lifecycle`), Stop-all with a background run (`abort`), relaunch restore (`change-review`, `chat`), and window-first boot. No spec changes were needed: the tab model mounts exactly one conversation at a time, preserving the single-chat DOM contract (`composer`, `transcript`, `stop-button` uniqueness).
- **not verified:** packaged smoke (`bun run build`) — skipped per owner instruction. Next check: `bun run build` when a packaged artifact is wanted.

## Mistakes and corrections

- The first implementation of this feature built the two-tile split host (visible cap 2, divider, parked tray) from the owner's initial choices. On review the owner preferred browser-style tabs; the tiling files were removed before acceptance and replaced by the tab strip. Details in the decision record's corrections section.

## Owner feedback

Owner (2026-08-27), after using the tiled build: "I love it, but I like the tab style more instead of tiling like this. We can still keep the window style but remove tiling and make it like a tab." Owner then chose: tabs replace the per-window header (no duplicate title bar) and minimize plus the parked tray are dropped.

## Blockers and handoff

- Packaged verification remains; run `bun run build` when a packaged artifact is wanted.
- Possible follow-ups (not scheduled): drag-reorder of tabs, middle-click close, ⌘⇧[ / ⌘⇧] tab cycling.
