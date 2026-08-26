# Codex owner interactions

Date: 2026-08-26
Status: in source and focused integration verified; not accepted
Owner: V5 Pho Agent Foundation
Slices: B2b, B4 compatibility
Related UI record: [`../../../ui/logs/2026-08-26-change-codex-interaction-dock.md`](../../../ui/logs/2026-08-26-change-codex-interaction-dock.md)
Prior slice: [`2026-08-26-codex-desktop-vertical-slice.md`](./2026-08-26-codex-desktop-vertical-slice.md)

## Intent

Let an interactive Codex tool turn ask the owner for approval or bounded input without adding Codex-specific renderer state and without leaving app-server requests unresolved.

## Implementation

- `@pho-agent/protocol` adds bounded backend-neutral approval/questionnaire request and resolution shapes plus request/settlement events.
- `@pho-agent/host` routes optional interaction resolution by backend-pinned scope and rejects adapters that omit it.
- The Codex connection accepts one server-request handler and returns JSON-RPC results or bounded errors.
- The Codex adapter opts into the characterized experimental API, uses `workspace-write` plus `on-request`, and translates command, file-change, additional-permission, and `request_user_input` requests. Dismiss/abort/dispose paths return cancellation-shaped responses.
- Initialization requires the characterized app-server version `0.149.1`; an absent or different user-agent version disposes the connection before `initialized` and reports a bounded compatibility error.
- Pho Code retains pending request ownership in `hosted-runtime`, maps the normalized request to its existing select/questionnaire dock, and maps the chosen display label back to the backend decision value.
- `backendId` now returns with host-dialog resolutions so equal workspace/session IDs on different backends cannot collide. Missing identity remains Pi compatibility.

Secret questions and unsupported app-server requests are not displayed. The non-interactive current-time callback returns bounded Unix seconds. MCP elicitation, dynamic tool calls, auth-token refresh, and attestation remain unsupported rather than silently approved.

## Verification

- Focused final protocol, host, Codex/ACP adapter, Pho Code runtime/application, sidebar, tool-row, and existing host-dialog UI tests: 186 passed, 0 failed.
- Typecheck passed for the affected protocol, host, Codex, runtime, application, and desktop packages.
- Real Electron chooser, chat, approval, and questionnaire verification passed 6 tests, 0 failed.
- A real installed Codex CLI `0.149.1` initialized and disposed without starting a thread or sending a provider prompt. A real provider-backed approval was not invoked, so app-server interaction behavior remains adapter/integration verified rather than owner verified.
- Full combined evidence is in [`2026-08-26-backend-foundation-verification.md`](./2026-08-26-backend-foundation-verification.md).

## Remaining work

- Add compatible MCP elicitation and auth/account flows only through named bounded contracts.
- Add a source-owned Codex binary/config policy before packaged acceptance; the exact app-server protocol version is now checked at initialization.
- Project native plan/compaction/review state into compatible dedicated surfaces without assigning Pi or V3 semantics.
- Add cross-backend contract/evaluation fixtures and acceptance review. Backend-native subagent grouping remains B5.
