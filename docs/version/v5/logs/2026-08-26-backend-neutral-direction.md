# Backend-neutral direction and first host seam

Date: 2026-08-26
Status: in source; focused verification complete; not accepted
Owner: V5 Pho Agent Foundation
Slice: B0
Related UI correction: [`../../../ui/logs/2026-08-26-change-settings-disclosure-info.md`](../../../ui/logs/2026-08-26-change-settings-disclosure-info.md)
Related compaction boundary: [`../../../features/compaction/logs/2026-08-20-related-v5-pho-agent.md`](../../../features/compaction/logs/2026-08-20-related-v5-pho-agent.md)

## Owner direction

Pho Code should support multiple agent backends: direct Codex, Claude and other agents through ACP, and Pho Agent's own backend. Reusable core behavior belongs in Pho Agent. Code should remain clean and simple, and verification should be proportional rather than exhaustive.

## Decision

- Pho Agent becomes a backend-neutral host. It does not translate every engine through ACP.
- Codex will use its direct app-server protocol because that is the native rich-client surface for authentication, threads, streaming, approvals, and related lifecycle events.
- Claude and other ACP-compatible agents use a separate ACP adapter.
- Backend identity is part of session ownership: `{ backendId, scopeId, sessionId }`.
- A session is pinned to one backend. Switching backends selects or creates a different session.
- Each adapter publishes explicit capabilities. Unsupported operations must be disabled or omitted by consumers.
- The earlier Task Brief, evidence, verification, and completion milestones are paused until their persistence contracts are backend-neutral.

## First source slice

- Added backend identity, descriptor, and capability contracts to `@pho-agent/protocol`.
- Added Pi-independent `@pho-agent/host`, which registers adapters, rejects duplicate or unknown backends, routes commands, tags snapshots/admissions/events with `backendId`, and owns aggregate disposal.
- Added a compatibility Pi adapter in `@pho-agent/runtime`; its descriptor advertises only steering and follow-up because those are the optional capabilities currently exposed through the new host.
- Routed the existing deterministic non-code Pi lifecycle fixture through the host while retaining `createAgentRuntime` compatibility.
- Extended package-boundary assertions so the host may depend only on the protocol and cannot import Node, Pi, Pho Code, Electron, or React.
- Refreshed both workspace locks. The standalone Pho Agent lock now honors the manifest's direct `@earendil-works/pi-agent-core` `0.84.1` pin; Pi's own nested caret dependency remains independently resolved.

Pho Code has not migrated its production session routing to the host. Codex and ACP packages do not exist yet. No backend selector or backend disclosure was added to the UI.

## Verification

- `bun run --filter @pho-agent/protocol typecheck` — passed.
- `bun run --filter @pho-agent/host typecheck` — passed.
- `bun run --filter @pho-agent/runtime typecheck` — passed.
- Focused protocol, host, Pi non-code lifecycle, and package-boundary tests — 19 passed, 0 failed.
- Standalone Pho Agent typecheck — all four packages passed.
- Standalone Pho Agent suite — 52 passed, 0 failed.
- Root typecheck — all nine packages passed.
- Desktop and packaged checks were not run for B0 because production Pho Code routing did not change.

## Handoff

B1 should place the existing Pho Code Pi session path behind `AgentHost` without moving V4's in-process composition or changing public `workspaceId` behavior. Before B2 and B3 implementation, freeze adapter conformance fixtures for lifecycle, streaming, errors, cancellation, approvals, persistence, and capability reporting against each native protocol.
