# Agent stop

Urgent track for cancelling a stuck agent run without waiting forever, and for keeping that control honest while Pi still lives in Electron main. Not a numbered version. Not an add-on. Not crash isolation.

| Document | Role |
| --- | --- |
| [`product.md`](./product.md) | Outcome, why Stop fails today, honesty, non-goals |
| [`implementation-plan.md`](./implementation-plan.md) | Slices, files, acceptance, verification |
| [`logs/`](./logs/README.md) | Research evidence, later implementation records |

Status: **Milestone 1 accepted 2026-08-19** ([review](./logs/2026-08-19-m1-acceptance-review.md)); bounded Stop is current architecture. **Milestone 2 (Stop-all and test teardown) is in implementation** with the automated gate green per [`logs/2026-08-19-m2-stop-all-and-teardown.md`](./logs/2026-08-19-m2-stop-all-and-teardown.md); owner manual acceptance is the remaining step. A dead or busy-looping main-process Pi still freezes Stop; that case stays with [`../window-first-pi-core/`](../window-first-pi-core/README.md) Milestone 3.

A hung or crashed Pi that freezes the whole window is a **different** job: [`../window-first-pi-core/`](../window-first-pi-core/README.md) Milestone 3 (`utilityProcess`). This track cannot hard-kill an in-process busy-loop. The two tracks must not wait on each other.

Read [`../../architecture/runtime-and-data.md`](../../architecture/runtime-and-data.md), [`../../architecture/protocol-and-ipc.md`](../../architecture/protocol-and-ipc.md), and [`../../ui/implementation/conversation-ui.md`](../../ui/implementation/conversation-ui.md) before changing `abortRun` or the composer Stop control.
