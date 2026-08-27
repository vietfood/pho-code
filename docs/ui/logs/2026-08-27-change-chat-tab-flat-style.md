# Chat tab flat style change

Kind: change  
Status: implemented  
Surface: main chat region  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md) slice 16  
Decision record: [`2026-08-27-decision-chat-tab-host.md`](./2026-08-27-decision-chat-tab-host.md)  
Related logs: [`2026-08-27-change-chat-tab-host.md`](./2026-08-27-change-chat-tab-host.md)

## Intent

Owner reviewed the first tab-strip build against Claude desktop's clean tab row and asked to match it: flat text tabs in the topbar row and no floating window card around the chat content.

## Expected / actual (before)

Expected (owner request): Claude-style tabs — plain text with a close control, sitting in the title row, over flat edge-to-edge chat content.

Actual: tabs were boxed pills (`border`, `rounded-t-lg`) on their own strip row below the topbar, and the active chat rendered inside a floating rounded card with border, shadow, and gap padding.

## Changes

- `packages/ui/src/chat-tab-host.tsx`: the separate strip row and the floating window card are gone. The tab strip now lives inside the region topbar's flexible middle slot; tabs are flat text (running tabs show the 3×3 dots), the active tab gets a whisper of `bg-foreground/8`, inactive tabs are muted with a hover lift, and the close × shows on hover (always on the active tab). A leading `+` button starts a new session in the active workspace. The content area is flat and edge-to-edge — no border, radius, shadow, or margins.
- `packages/ui/src/chat-header.tsx`: new `headerTabs` slot occupying the header's flexible middle (replacing the removed per-chat title spacer).
- `apps/desktop/src/App.tsx`: the region topbar is now `renderTopbar(tabStrip)` so the host can inject the strip; `onNewTab` wires to `startNewSession(activeWorkspaceId)`.
- No state-model changes: `chat-tabs.ts`, `use-chat-tabs.ts`, and the persistence contract are untouched.

## Verification

- **unit verified:** `bun run typecheck` clean; `bun run lint` 0 errors (9 pre-existing warnings); `conversation.test.ts` covers the `paneFill` → `data-chat-fill` component contract.
- **desktop verified:** `bun run test:desktop` — 31/31 pass on the flat tab strip (electron-vite build + Playwright, real Electron). The lane ran just before the one-line `paneFill` derivation fix; no spec asserts that derivation, and the fix is typecheck- and unit-covered. Owner visual review confirmed the width complaint and its fix on the dev build.

## Mistakes and corrections

- The first tab build kept a boxed pill style and a floating window card carried over from the tiling variant. Owner review rejected both; the flat style replaces them before acceptance.
- The tab-host refactor inverted the accepted `data-chat-fill` derivation ([split-pane fill log](./2026-08-16-change-split-pane-chat-fill.md)): `paneFill` fired when the right region was *closed*, so a solo chat lost its centered 48rem column and stretched edge-to-edge. Owner caught it ("content is too wide without the right sidebar open"). Corrected to `rightRegionOpen && !rightRegionHidden`: solo chat keeps the readable centered column, and the chat fills the remaining pane only while the right sidebar is open.

## Owner feedback

Owner (2026-08-27), comparing against a Claude desktop screenshot: "I think our tab is so ugly compare to claude clean style, I think we should implement like it, remove floating window too."

## Blockers and handoff

- None. Owner visual review on the dev build is the remaining acceptance signal.
