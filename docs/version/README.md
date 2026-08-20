# Numbered product versions

This folder holds promoted numbered core product versions plus the later promotion queue. Standalone add-ons (terminal, compaction, …) live under [`features/`](../features/README.md), not here.

| Path | Role |
| --- | --- |
| [`v4/`](./v4/README.md) | **Pending** V4 — Public Beta Foundation. Held 2026-08-20 until Apple Developer Program / Developer ID authority exists. Milestone 0 source freeze remains; remaining milestones are not in implementation. |
| [`roadmap-vnext.md`](./roadmap-vnext.md) | Independently promotable later phases, including a future V5 |
| [`research-backlog.md`](./research-backlog.md) | Unpromoted core-product research; not add-ons or promises |

Startup, Pi crash-isolation, and bounded Stop of a stuck run that should happen before more capability live under [`urgent/`](../urgent/README.md), not here. Pi crash isolation remains a V4 contract even while V4 is pending; do not implement it under an add-on or a future V5.

Closed versions stay in the [`archive`](../archive/README.md). Do not reopen v1, v2, or v3 contracts here.

V4 is **Pending**, not accepted and not archived. A later numbered version may be promoted under `docs/version/v5/` **without** archiving V4. That version must not take over signing, notarization, public updates, public-beta diagnostics/privacy, or `HarnessRuntime` utility-process extraction. When V4 is later accepted, archive it under `docs/archive/v4/` with its complete product, plan, logs, and review.
