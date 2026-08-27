# Chat tab host decision

Kind: decision  
Status: accepted, implemented  
Surface: main chat region  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-27-decision-right-sidebar-tiling-tabs.md`](./2026-08-27-decision-right-sidebar-tiling-tabs.md), [`2026-08-27-change-right-sidebar-tiling-tabs.md`](./2026-08-27-change-right-sidebar-tiling-tabs.md), [`2026-08-27-change-right-sidebar-floating-tiles.md`](./2026-08-27-change-right-sidebar-floating-tiles.md), [`2026-08-16-change-split-pane-chat-fill.md`](./2026-08-16-change-split-pane-chat-fill.md)

## Intent

Give the main chat region multiple open chats. Today the region shows exactly one selected conversation; opening another session replaces it. The owner wants browser-style tabs over a single floating chat window: every open chat is a tab, exactly one is active, and the active chat renders as one rounded window card.

## Expected / actual (before)

Expected (owner request): the main chat has tabs and window chrome as in the right sidebar — open chats accumulate instead of replacing each other.

Actual: `ConversationCacheState.selectedKey` names the single visible conversation; `App.tsx` renders one `Conversation`; session switching saves/restores per-chat composer chrome and remounts the pane.

## Decisions

1. **A tab is an open session.** Chat tabs are keyed by the existing session key (`backendId:workspaceId:sessionId`). Host state is a plain ordered `tabs` list plus an `active` key — no visible cap, no split ratio, no parked tray. New pure helpers live in `packages/ui/src/lib/chat-tabs.ts`; persisted state is revalidated on read so removed or archived sessions drop silently.
2. **Browser-style tab strip, flat content.** Claude-desktop-style flat text tabs live in the region topbar's middle slot: running tabs show the 3×3 dots, the active tab gets a subtle background lift, the close × shows on hover (always on the active tab), and a leading `+` starts a new session in the active workspace. The active chat fills the region flat and edge-to-edge — no floating card, no duplicate title bar. ArrowLeft/ArrowRight on the strip move activation.
3. **Open-or-focus sidebar semantics.** Clicking a session in the left sidebar activates its existing tab or appends a new active tab. Tabs accumulate until closed. New session opens a new active tab.
4. **Active tab is selection.** Clicking a tab activates it; `active` is `selectedKey`: the sidebar's selected row, the right-sidebar surfaces (Changes, Context prompt, Plan), and the Changes overlay all follow the active tab. Activating an already-open session costs no runtime work — V2's independent session controllers keep every chat live.
5. **Per-tab titles, global icons.** The session title leaves `ChatHeader` and moves into the tab. A slim region topbar keeps the global chrome: sidebar toggle (when collapsed), collapsed-sidebar actions, the active chat's yolo badge and model error, and the right-surface launcher icons scoped to the active tab.
6. **Close affects the view only.** The session keeps running in the background and stays in the sidebar; archiving or Trashing a session from the sidebar closes its tab. Closing the active tab activates its right neighbor (else the left one); closing the last tab returns to the welcome launcher. Inactive tabs unmount — snapshot and live run survive in the keyed cache and live-run store, and composer drafts persist in the per-tab composer map; scroll position is not restored, matching the pre-tabs session-switch behavior.
7. **Persistence.** The tab list and active key persist to localStorage as `pho-code.chatTabs`; relaunch restores the strip and loads the active tab, with background tabs loading lazily on first activation. The short-lived `pho-code.chatTiles` tiling layout (visible/parked/focused/splitRatio) migrates into the tab strip on first read.
8. **Ownership unchanged.** This is a host-only change in the conversation-UI track. Session lifecycle (archive, Trash, background runs) stays with accepted V2 Milestone 3; Changes/Context prompt/Plan semantics stay with their owning tracks; the right-sidebar host keeps its own tiling model untouched.

## Non-goals

- No tiling in the main region: exactly one chat window is visible (the owner reviewed a two-tile split with divider and parked tray and chose tabs instead).
- No merging the two regions into one free tiling space: chats tab in the center, surfaces stay in the right region.
- No drag-reorder of tabs, no middle-click close, no tab-close keyboard shortcuts in v1 (the strip's arrow-key cycling covers keyboard switching).

## Affected contracts and files (at implementation)

- `packages/ui/src/lib/chat-tabs.ts` — tab-strip helpers (open-or-focus, close with neighbor activation, key replacement for pending-new tabs, persistence round-trip with legacy tiling migration) with unit tests.
- `packages/ui/src/lib/live-run-store.ts` — per-key subscription (`useLiveRunForKey(key)`) so a transcript streams from its own session key; today only the selected key notifies.
- `packages/ui/src/chat-tab-host.tsx` — the host component: tab strip plus the single active window card and region topbar slot.
- `packages/ui/src/conversation.tsx`, `chat-header.tsx` — the per-chat title moves into the tab; `Conversation` is body-only and the composer keeps the single `composer-input` id because only the active tab mounts.
- `apps/desktop/src/use-chat-tabs.ts` — owns the tab strip, per-tab composer chrome, and pending-tab loading; replaces `use-session-switch.ts`.
- `apps/desktop/src/App.tsx` — renders the tab host; `selectedKey` becomes the active tab.
- `packages/ui/test/chat-tabs.test.ts`, `packages/ui/test/conversation.test.ts` — tab open/close/activate/persistence assertions; conversation tests drop header chrome assertions.
- `docs/ui/implementation/conversation-ui.md` — new slice 16 records this decision.

## Verification

Not verified: this is a documentation-only decision record. No code changed; unit, desktop, and packaged checks run at implementation time and land in the change log.

## Owner feedback

Owner request (2026-08-27): make the main chat tile like the right sidebar, with tabs and window tiles. Owner first chose pure tiles (no tab strip), open-or-focus sidebar clicks, a two-tile visible cap with tray, and per-tile titles with global surface icons scoped to the focused tile. After reviewing the tiled build the same day, the owner pivoted: keep the floating window style, remove tiling, and make the main chat a browser-style tab strip — tabs replace the per-window header, and minimize plus the parked tray are dropped (every open chat is a tab; closing a tab is view-only). After reviewing the first tab build against Claude desktop, the owner asked for the clean flat style: plain text tabs in the topbar row and no floating window card ([flat style change](./2026-08-27-change-chat-tab-flat-style.md)).

## Mistakes and corrections

- The first implementation built the two-tile split host (`chat-tiles.ts`, `chat-tile-host.tsx`, divider, tray). Owner review preferred tabs; the tiling files were removed before acceptance and the tab host replaced them. The right sidebar's tiling model was never affected.

## Blockers and handoff

- Implementation evidence lands in the change log; desktop-lane verification runs with `bun run test:desktop`.
