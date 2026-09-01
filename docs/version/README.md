# Numbered product versions

This folder holds promoted numbered core product versions plus the later promotion queue. Standalone add-ons (terminal, compaction, …) live under [`features/`](../features/README.md), not here.

| Path | Role |
| --- | --- |
| [`v4/`](./v4/README.md) | **Pending** V4 — Public Beta Foundation. Held 2026-08-20 until Apple Developer Program / Developer ID authority exists. The fail-closed proof packager remains; Milestone 0's frozen identity/origin constants were removed 2026-08-27 and must be re-established on resume. Remaining milestones are not in implementation. |
| [`v5/`](./v5/README.md) | **Awaiting owner verification** V5 — Pho Agent Foundation. The owner resumed grouped M1–M4 Task implementation on 2026-09-01; the candidate is implemented and machine-verified with an isolated packaged journey and deterministic evaluation. The real-model [handoff](./v5/handoff.md) and earlier external-backend gaps remain acceptance gates. No V5 slice is accepted. |
| [`roadmap-vnext.md`](./roadmap-vnext.md) | Independently promotable later phases not already owned by V4 or V5 |
| [`research-backlog.md`](./research-backlog.md) | Unpromoted core-product research; not add-ons or promises |

Startup, Pi crash-isolation, and bounded Stop of a stuck run that should happen before more capability live under [`urgent/`](../urgent/README.md), not here. Pi crash isolation remains a V4 contract even while V4 is pending; do not implement it under an add-on or [V5](./v5/README.md).

Closed versions stay in the [`archive`](../archive/README.md). Do not reopen v1, v2, or v3 contracts here.

V4 is **Pending** and V5 is **Awaiting owner verification**; neither is accepted and neither is archived. Their gates are independent. V5 was promoted without archiving V4 and must not take over signing, notarization, public updates, public-beta diagnostics/privacy, application-data migration, or `HarnessRuntime` utility-process extraction. When either version is accepted, archive only that complete workstream with its product, plan, logs, and review; one version's acceptance does not imply the other's.
