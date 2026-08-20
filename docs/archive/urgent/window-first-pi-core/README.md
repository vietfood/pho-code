# Window-first Pi core

Closed urgent track for startup ordering. Not a numbered version, add-on, shell rewrite, or process-isolation claim.

| Document | Role |
| --- | --- |
| [`product.md`](./product.md) | Isolation glossary, selected decisions, honesty, non-goals |
| [`implementation-plan.md`](./implementation-plan.md) | Slices, files, acceptance, verification |
| [`logs/`](./logs/README.md) | Research, implementation, acceptance, and closure evidence |

Status: **Accepted and archived 2026-08-20.** The [implementation record](./logs/2026-08-20-m1-window-first-implementation.md) covers the dynamic-imported same-process runtime host plus selected Milestone 2 startup cuts; the [closure review](./logs/2026-08-20-m1-acceptance-and-closure.md) records the owner's package-gate waiver, unverified timing clocks, and explicit deferral of Milestone 3 to roadmap Phase F.

The complete `HarnessRuntime` remains in Electron main. This accepted ordering is not crash isolation or a sandbox. Read [`../../../architecture/desktop-shell.md`](../../../architecture/desktop-shell.md), [`../../../architecture/overview.md`](../../../architecture/overview.md), and [`../../../version/roadmap-vnext.md`](../../../version/roadmap-vnext.md) before changing startup or promoting process extraction again.
