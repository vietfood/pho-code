# Agent stop

Urgent track for cancelling a stuck agent run without waiting forever, and for keeping that control honest while Pi still lives in Electron main. Not a numbered version. Not an add-on. Not crash isolation.

| Document | Role |
| --- | --- |
| [`product.md`](./product.md) | Outcome, why Stop fails today, honesty, non-goals |
| [`implementation-plan.md`](./implementation-plan.md) | Slices, files, acceptance, verification |
| [`logs/`](./logs/README.md) | Research evidence, later implementation records |

Status: **Proposed; queued as urgent 2026-08-16.** Implementation has not started. Do not describe bounded abort or “Stop always works” as current architecture until a slice is accepted and [`current-state.md`](../../current-state.md) records it.

A hung or crashed Pi that freezes the whole window is a **different** job: [`../window-first-pi-core/`](../window-first-pi-core/README.md) Milestone 3 (`utilityProcess`). This track cannot hard-kill an in-process busy-loop. The two tracks must not wait on each other.

Read [`../../architecture/runtime-and-data.md`](../../architecture/runtime-and-data.md), [`../../architecture/protocol-and-ipc.md`](../../architecture/protocol-and-ipc.md), and [`../../ui/implementation/conversation-ui.md`](../../ui/implementation/conversation-ui.md) before changing `abortRun` or the composer Stop control.
