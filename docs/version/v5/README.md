# V5 — Pho Agent Foundation

Promoted numbered product version, **awaiting owner verification**. Owner-promoted 2026-08-20, redirected 2026-08-26 toward a backend-neutral Pho Agent host, held 2026-08-28, and explicitly resumed for end-to-end M1–M4 implementation on 2026-09-01. Task intelligence is implemented and machine-verified; the owner real-model pass in [`handoff.md`](./handoff.md) remains the acceptance gate. The resume groups implementation gates because no model is currently available, as with compaction; it does not accept V5, close backend-foundation gaps, or lift V4's separate hold. See the historical [hold record](./logs/2026-08-28-blocked-pending-other-workstreams.md) and current [implementation evidence](./logs/2026-09-01-m1-m4-task-intelligence-implementation.md).

| Document | Role |
| --- | --- |
| [`product.md`](./product.md) | Owner outcome, `pho-agent` boundary, selected intelligence features, trust model, and non-goals |
| [`implementation-plan.md`](./implementation-plan.md) | Package migration, contracts, milestones, evaluation gates, and verification |
| [`handoff.md`](./handoff.md) | Owner real-model and Task-surface acceptance guide |
| [`logs/`](./logs/README.md) | Dated implementation evidence, corrections, owner feedback, and handoffs |

V5 turns the reusable part of the existing Pho Code harness into a headless, backend-neutral **`pho-agent`** foundation. Pi remains the first working adapter. Direct Codex app-server and ACP are separate adapters, and Pho Agent may also supply its own native backend. Pi now supplies the first native Task intelligence adapter: living Task Brief, bounded evidence pack, authoritative verification ledger, and evidence-backed completion. The neutral protocol/host exposes the capability without pretending external adapters implement it.

V5 is not accepted. The source has backend-neutral protocol identity, support-level capabilities, optional non-baseline host operations, a Pi-independent `@pho-agent/host`, and compatibility Pi/Codex/ACP adapters. Pho Code owns Pho Agent but treats Codex and ACP agents as separately installed and authenticated prerequisites. The Task candidate adds append-only branch-owned state, bounded/degraded evidence injection, source-validated verification, criteria-exact completion, five named owner commands, two baked tools, deterministic evaluation, and an accessible Task tile. Unit, focused Electron, build, unsigned macOS package, packaged PATH-without-Pi, and deterministic evaluation lanes pass; the full repository/desktop matrices still contain documented unrelated in-progress failures. Real-model usefulness and invocation behavior are not verified. See the [Task implementation log](./logs/2026-09-01-m1-m4-task-intelligence-implementation.md), [external-backend decision](./logs/2026-08-27-external-backend-ownership.md), and [instruction/tool bridge](./logs/2026-08-27-codex-instructions-and-tool-bridge.md).

V4 remains promoted and **Pending** under [`../v4/`](../v4/README.md). V5 does not take over V4 signing, notarization, release artifacts, public updates, public-beta diagnostics/privacy, application-data migration, or `HarnessRuntime` utility-process extraction. Context compaction and the integrated terminal remain independent add-ons under [`../../features/`](../../features/README.md).

Current behavior is summarized in [`../../current-state.md`](../../current-state.md). Architecture pages label the implemented V5 candidate as unaccepted; final accepted-boundary edits and archival wait for the owner pass and clean acceptance gate.
