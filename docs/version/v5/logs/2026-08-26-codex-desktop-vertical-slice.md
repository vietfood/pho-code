# Codex desktop vertical slice

Date: 2026-08-26
Status: in source; focused integration and desktop verified; not accepted
Owner: V5 Pho Agent Foundation
Slices: B2a, partial B2b, partial B4

## Intent

Make the backend-neutral work reachable from Pho Code without reinterpreting Pi sessions, dumping backend disclosures into the main interface, or claiming unsupported ACP/Claude packaging.

## Implementation

- Added optional `backendId` to the compatible Pho Code session key and normalized missing values to `pi`. Composite keys, runtime events, renderer caches, application metadata, archive state, activity, and session catalog joins now distinguish identical native session ids from different backends.
- Migrated application metadata from version 6 to 7. Existing records remain Pi-owned without a data rewrite. Non-Pi lifecycle records retain enough identity to offer resume after restart without copying native transcripts into application metadata.
- Registered Codex lazily beside Pi. Startup and ordinary Pi sessions do not launch `codex`; choosing Codex creates or resumes through `codex app-server` and the backend-neutral host.
- Added a split new-session affordance: the existing action remains one-click Pi, and a small adjacent control opens Pi/Codex choices plus a collapsed information disclosure. Codex rows carry a compact backend label.
- Added a Pho Code conversation projector for common backend snapshots. Settled native items use the existing transcript tool row; the in-flight assistant message becomes the existing streaming text and live-work tail. Known backend kinds select existing command, file, MCP, web, image, review, and subagent presentation hints.
- Kept Pi-only product operations explicit. Non-Pi images, queued follow-up, Plan/Agent state, context-prompt editing, assistant rewrite, model/thinking selection, and session removal fail with bounded unsupported errors instead of accidentally targeting a Pi session with the same id.
- Bundled the Codex adapter and host source into Electron main. This does not bundle the Codex CLI or make a packaged availability claim.

## ACP/Claude correction

The official ACP registry listed `@agentclientprotocol/claude-agent-acp@0.70.0`. A trial exact dependency revealed that its Claude Agent SDK requires `@anthropic-ai/sdk >=0.93.0`, while Pi `0.84.1` depends on exact `0.91.1`. The current Pho Code packager flattens ordinary dependencies, so keeping both would silently risk one backend. The trial dependency was removed from source and lockfile, and its temporary composition file was moved to macOS Trash. The generic ACP adapter, lazy construction, negotiated descriptor refresh, and fail-fast permission behavior remain.

Sources: [official registry entry](https://raw.githubusercontent.com/agentclientprotocol/registry/main/claude-acp/agent.json), [official bridge manifest](https://raw.githubusercontent.com/agentclientprotocol/claude-agent-acp/main/package.json).

## Verification

- Pi runtime plus backend projection/host/session identity/application lifecycle — 54 passed, 0 failed.
- Root build — passed; Electron main bundled the host and Codex adapter.
- `bunx playwright test tests/chat.spec.ts` — 4 passed, 0 failed outside the GUI-restricted sandbox, including backend chooser → Pi and the existing chat/reopen cases.
- No real Codex prompt was sent. The direct adapter had already initialized/disposed against installed Codex CLI `0.149.1`; owner credentials/provider capacity were not used for this UI slice.
- Combined final checks are recorded in the handoff after they run.

## Remaining work

- Implement backend-neutral approvals and request-user-input before relaxing Codex's `never` approval policy.
- Add auth/version/config diagnostics and choose a source-owned Codex binary policy before packaged acceptance.
- Add dedicated plan, compaction, review, and auth projections where existing Pho Code surfaces are semantically compatible.
- Resolve nested dependency packaging before composing the official Claude ACP bridge; then validate negotiated capabilities and authentication against an isolated agent fixture.
- Add cross-backend contract/evaluation fixtures and an acceptance review. Backend-native subagent grouping remains B5.

## Follow-up

The first remaining item above was completed later the same day: Codex now uses `on-request`, and command/file/permission approvals plus `request_user_input` use the backend-neutral interaction seam. Exact version checking also landed. See [`2026-08-26-codex-owner-interactions.md`](./2026-08-26-codex-owner-interactions.md) and the [`combined verification record`](./2026-08-26-backend-foundation-verification.md). The other limitations remain.
