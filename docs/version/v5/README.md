# V5 — Pho Agent Foundation

Promoted numbered product version. Owner-promoted 2026-08-20 and redirected 2026-08-26 toward a backend-neutral Pho Agent host. The earlier Pi-only Milestone 0 implementation remains useful evidence, but its acceptance is reopened because `{ scopeId, sessionId }` is not sufficient for multiple backends. The new foundation starts with `{ backendId, scopeId, sessionId }`, explicit capability descriptors, and a host that can route Pi, direct Codex app-server, and ACP adapters without putting those protocols in Pho Code.

| Document | Role |
| --- | --- |
| [`product.md`](./product.md) | Owner outcome, `pho-agent` boundary, selected intelligence features, trust model, and non-goals |
| [`implementation-plan.md`](./implementation-plan.md) | Package migration, contracts, milestones, evaluation gates, and verification |
| [`logs/`](./logs/README.md) | Dated implementation evidence, corrections, owner feedback, and handoffs |

V5 turns the reusable part of the existing Pho Code harness into a headless, backend-neutral **`pho-agent`** foundation. Pi remains the first working adapter. Direct Codex app-server and ACP are separate adapters, and Pho Agent may also supply its own native backend. The previously planned Task Brief, evidence, verification, and completion work is paused behind this foundation so it is not designed around Pi-only assumptions.

V5 is not accepted. The source now has backend-neutral protocol identity, support-level capabilities, optional non-baseline host operations, a Pi-independent `@pho-agent/host`, and a compatibility Pi adapter in `@pho-agent/runtime`. Pho Code owns Pho Agent but treats Codex and ACP agents as separately installed and authenticated prerequisites. Pi, lazy Codex, and lazy Claude ACP registrations share the production session-routing seam; selecting an external backend starts its fixed reviewed command, while ordinary Pho Code startup starts neither process. Codex initialization fails closed unless app-server reports the characterized `0.149.1` version. The generic ACP v1 adapter remains exact on official SDK `1.4.0`; Claude invokes external `claude-agent-acp`, keeping its Claude Agent SDK dependencies outside Pho Code's lockfile and Electron bundle. Backend-neutral approvals and user input reuse the existing interaction dock. Command/file/MCP/web/image/review/compaction and flattened backend-owned collaboration activity reach the existing transcript rows; Pho Agent has no subagent orchestration feature. Real Claude/provider, external-command GUI `PATH`, packaged, cross-backend evaluation, and acceptance evidence remain pending. See the [external-backend decision](./logs/2026-08-27-external-backend-ownership.md).

V4 remains promoted and **Pending** under [`../v4/`](../v4/README.md). V5 does not take over V4 signing, notarization, release artifacts, public updates, public-beta diagnostics/privacy, application-data migration, or `HarnessRuntime` utility-process extraction. Context compaction and the integrated terminal remain independent add-ons under [`../../features/`](../../features/README.md).

Current accepted behavior remains in [`../../current-state.md`](../../current-state.md) and [`../../architecture/`](../../architecture/README.md). Proposed V5 boundaries belong here until their acceptance gate passes.
