# ACP permission interactions

Date: 2026-08-26
Status: adapter source and injected-client integration verified; no production agent selected
Owner: V5 Pho Agent Foundation
Slice: B3a
Related common interaction record: [`2026-08-26-codex-owner-interactions.md`](./2026-08-26-codex-owner-interactions.md)

## Intent

Use the backend-neutral owner-interaction seam for stable ACP permission requests instead of cancelling every request merely because the original adapter had no UI bridge.

## Implementation

- The SDK client delegates `session/request_permission` to one adapter-owned async handler and still cancels when no handler is registered.
- The ACP adapter advertises native approvals, projects the agent's opaque option IDs and display names into a bounded approval interaction, and returns the selected option ID unchanged.
- Abort resolves every pending permission for that session as `cancelled` before sending `session/cancel`. Prompt settlement/failure and adapter disposal also cancel pending requests so the agent cannot remain blocked.
- Lazy ACP adapters forward interaction resolution after negotiated initialization.

The generic adapter remains source-command-only and is not registered in Pho Code production. This change does not select, download, or execute a Claude bridge.

## Verification

- ACP package typecheck passed.
- Injected-client adapter tests cover selected option routing and cancellation on abort; the combined backend interaction rerun passed 21 tests, 0 failed.

## Blocker

The official Claude ACP bridge still cannot be added to the current flat production package graph without isolating its newer Anthropic SDK peer from Pi's pinned older exact version. See the [desktop vertical slice](./2026-08-26-codex-desktop-vertical-slice.md).
