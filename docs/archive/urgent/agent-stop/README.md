# Agent stop

Urgent track for cancelling a stuck agent run without waiting forever, and for keeping that control honest while Pi still lives in Electron main. Not a numbered version. Not an add-on. Not crash isolation.

| Document | Role |
| --- | --- |
| [`product.md`](./product.md) | Accepted outcome, original defect, honesty, non-goals |
| [`implementation-plan.md`](./implementation-plan.md) | Slices, files, acceptance, verification |
| [`logs/`](./logs/README.md) | Research evidence, later implementation records |

Status: **Accepted and archived 2026-08-20**. Milestone 1 bounded Stop was accepted 2026-08-19 ([review](./logs/2026-08-19-m1-acceptance-review.md)); Milestone 2 Stop-all and bounded teardown are accepted in the [closure review](./logs/2026-08-20-m2-acceptance-and-closure.md). A dead or busy-looping main-process Pi still freezes Stop; archived [`window-first-pi-core`](../window-first-pi-core/README.md) deferred that process-extraction case to roadmap Phase F.

A hung or crashed Pi that freezes the whole window is a **different** job: process extraction deferred from archived [`window-first-pi-core`](../window-first-pi-core/README.md) to roadmap Phase F. This track cannot hard-kill an in-process busy-loop.

Read [`runtime-and-data.md`](../../../architecture/runtime-and-data.md), [`protocol-and-ipc.md`](../../../architecture/protocol-and-ipc.md), and [`conversation-ui.md`](../../../ui/implementation/conversation-ui.md), plus this archived contract, before changing `abortRun` or the composer Stop control.
