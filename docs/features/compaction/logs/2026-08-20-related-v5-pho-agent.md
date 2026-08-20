# Related: V5 Pho Agent task state and evidence

Date: 2026-08-20
Status: documentation relationship; no compaction contract change
Owner: features/compaction
Related: [`V5 product`](../../../version/v5/product.md), [`V5 plan`](../../../version/v5/implementation-plan.md)

## Intent

Record the boundary between the active context-compaction add-on and promoted V5 Task Brief/evidence/verification state.

## Decision

- Compaction remains Pi-owned and independently implemented/accepted under this add-on.
- V5 does not change automatic policy, manual compact/cancel behavior, transcript boundaries, summaries, or provider-native compaction.
- V5 Task Brief, evidence-pack, verification, and completion entries follow Pi active-branch semantics.
- The current Task Brief and other required task state may be deliberately re-injected after compaction; a lossy Pi compaction summary is not verification evidence and does not replace the authoritative Task Brief or ledger source.
- Evidence packs remain bounded per-run context. V5 must not retain every earlier pack in active context to defeat compaction.
- The compaction display projector must tolerate new V5 custom entries without rendering hidden evidence payloads as ordinary transcript turns.

## Verification

Documentation routing only. No Pi, runtime, protocol, transcript, Electron, or packaged check ran.

## Handoff

When either workstream changes shared transcript projection or Pi custom-entry handling, link the implementation logs reciprocally and run the union of focused integration/desktop checks. Neither workstream accepts the other by incidentally packaging it.
