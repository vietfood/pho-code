# V5 promotion and planning

Date: 2026-08-20
Status: promoted; implementation not started by this record
Owner: repository owner
Plan: V5 — Pho Agent Foundation

## Intent

Promote V5 as the product-neutral agent foundation needed by both the existing Pho Code product and a future, separately built Pho Research product. Make foundational intelligence measurable and add only bounded task-scoped state: a living Task Brief, evidence packs, an authoritative verification ledger, and evidence-backed completion.

## Owner direction

- `pho-agent` is the shared headless foundation built on top of Pi; it is not a Pi source fork.
- Pho Code and future Pho Research have independent UI and custom features.
- Pho Research may reuse only `pho-agent`, not Pho Code packages or coding UI.
- Intelligence must be measurable from M0.
- V5 includes Task Brief, evidence packs, and evidence-backed completion in the shared foundation.
- Generic memory is deliberately deferred because its privacy, provenance, staleness, and correction contracts are not mature.
- Quiz, Socratic teaching, PDFs, citations, paper linking, research knowledge, subagents, and long-loop job behavior belong to future Pho Research or separately promoted core work, not V5.

## Selected boundary

- Introduce private `@pho-agent/*` workspace packages and enforce one-way `@pho-code/* -> @pho-agent/* -> Pi` dependency.
- Keep `pho-agent` headless. Pho Code gains one Task right-sidebar adapter surface; a future product may render the same state differently.
- Keep Pi authoritative for the loop, tools, providers, sessions, JSONL, and compaction.
- Preserve Pho Code's existing `workspaceId` desktop contract through an adapter while the core uses opaque `scopeId` identity.
- Split verification observation (M3) from completion assessment (M4), replacing the earlier memory milestone without leaving a numbering gap.
- Keep runtime in Electron main. V4 still owns `HarnessRuntime` utility-process extraction and public-beta contracts.

## Related workstreams

- [V4 hold](../../v4/logs/2026-08-20-hold-pending-apple-developer.md) already permits V5 while reserving release/process contracts.
- [Context compaction](../../../features/compaction/README.md) remains independent; V5 state must survive its branch/context semantics without taking over its UI or Pi policy.
- [Plan/Agent](../../../archive/features/plan-agent/README.md) remains accepted; Task Brief, Plan, and todo have distinct authorities.
- [V3 change review](../../../archive/v3/README.md) may provide bounded Pho Code verification observations without changing Approve/Undo semantics.
- [Task surface UI decision](../../../ui/logs/2026-08-20-decision-v5-task-surface.md) records the Pho Code adapter surface.

## Verification performed

Documentation and repository inspection only. No application source or behavior changed. No typecheck, lint, unit, integration, desktop, build, package, provider, or evaluation run was performed for this promotion record.

Evidence inspected during planning:

- current protocol/application/runtime/UI package graph and enforced dependency direction;
- current `HarnessRuntime`, feature manifest, composite session identity, Pi event projection, and packaged-resource boundaries;
- pinned Pi `0.84.1` public session, extension, compaction, custom-entry, and `before_agent_start` APIs;
- accepted V2 session/feature lifecycle, Plan/Agent, V3 recovery, sandbox, bounded Stop, and window-first behavior;
- active compaction and terminal contracts;
- V4's pending hold and reserved utility-process/public-release scope.

## Handoff

Implement from [`../implementation-plan.md`](../implementation-plan.md) in milestone order. M0 must freeze the baseline fixtures, scoring, model/config identity, repetition count, and acceptance thresholds before M1 changes agent behavior. Do not begin Pho Research features, generic memory, subagents, or V4 process/release work under this plan.
