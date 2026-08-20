# Numbered product versions

This folder holds promoted numbered core product versions plus the later promotion queue. Standalone add-ons (terminal, compaction, …) live under [`features/`](../features/README.md), not here.

| Path | Role |
| --- | --- |
| [`v4/`](./v4/README.md) | **Pending** V4 — Public Beta Foundation. Held 2026-08-20 until Apple Developer Program / Developer ID authority exists. Milestone 0 source freeze remains; remaining milestones are not in implementation. |
| [`v5/`](./v5/README.md) | **In implementation** V5 — Pho Agent Foundation. M0 automated gates including packaged pass; real-provider is not owner-verified; M0 is not formally accepted and M1 has not started. |
| [`roadmap-vnext.md`](./roadmap-vnext.md) | Independently promotable later phases not already owned by V4 or V5 |
| [`research-backlog.md`](./research-backlog.md) | Unpromoted core-product research; not add-ons or promises |

Startup, Pi crash-isolation, and bounded Stop of a stuck run that should happen before more capability live under [`urgent/`](../urgent/README.md), not here. Pi crash isolation remains a V4 contract even while V4 is pending; do not implement it under an add-on or [V5](./v5/README.md).

Closed versions stay in the [`archive`](../archive/README.md). Do not reopen v1, v2, or v3 contracts here.

V4 is **Pending**, not accepted and not archived. V5 was promoted without archiving V4 and must not take over signing, notarization, public updates, public-beta diagnostics/privacy, application-data migration, or `HarnessRuntime` utility-process extraction. When either version is accepted, archive only that complete workstream with its product, plan, logs, and review; one version's acceptance does not imply the other's.
