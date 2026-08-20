# V5 — Pho Agent Foundation

Promoted numbered product version. Owner-promoted 2026-08-20; Milestone 0 implementation and permitted non-packaged verification are complete, but its packaged gate is unavailable by owner direction and M0 is not accepted.

| Document | Role |
| --- | --- |
| [`product.md`](./product.md) | Owner outcome, `pho-agent` boundary, selected intelligence features, trust model, and non-goals |
| [`implementation-plan.md`](./implementation-plan.md) | Package migration, contracts, milestones, evaluation gates, and verification |
| [`logs/`](./logs/README.md) | Dated implementation evidence, corrections, owner feedback, and handoffs |

V5 turns the reusable part of the existing Pho Code harness into a headless, Pi-powered **`pho-agent`** foundation and proves four task-scoped intelligence capabilities: a living Task Brief, bounded evidence packs, an authoritative verification ledger, and evidence-backed completion. Intelligence is measured from a frozen M0 baseline rather than inferred from UI polish or one favorable model run.

V5 is not accepted. Milestone 0 now contains private `@pho-agent/*` packages in the pinned [`vietfood/pho-agent`](https://github.com/vietfood/pho-agent) production submodule, a frozen deterministic baseline, a non-code lifecycle consumer, and reusable ownership of feature composition, session registry, Plan/ask-user/todo, skills, context-prompt hook, and the reviewed fixed GitHub MCP lifecycle. Its standalone and Pho Code typecheck, lint, unit/integration, desktop, and build gates pass; `package:mac` and packaged verification were not run by owner direction, so M1 remains blocked pending an explicit gate decision. Later Task Brief, evidence, verification, and completion behavior does not exist yet. The current application remains Pho Code throughout V5, and V5 does not create or ship Pho Research.

V4 remains promoted and **Pending** under [`../v4/`](../v4/README.md). V5 does not take over V4 signing, notarization, release artifacts, public updates, public-beta diagnostics/privacy, application-data migration, or `HarnessRuntime` utility-process extraction. Context compaction and the integrated terminal remain independent add-ons under [`../../features/`](../../features/README.md).

Current accepted behavior remains in [`../../current-state.md`](../../current-state.md) and [`../../architecture/`](../../architecture/README.md). Proposed V5 boundaries belong here until their acceptance gate passes.
