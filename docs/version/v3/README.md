# V3 — Change Control and Recovery

Current numbered core version. Direction approved; Milestones 0–2 are implemented in source but not owner-accepted.

| Document | Role |
| --- | --- |
| [`product.md`](./product.md) | Product boundary, trust model, and Approve/Undo semantics |
| [`implementation-plan.md`](./implementation-plan.md) | Milestones and acceptance gates |
| [`logs/`](./logs/README.md) | Dated implementation evidence, corrections, feedback, and handoffs |

V3 owns change-review and recovery behavior. The conversation UI owns shared right-sidebar host chrome; standalone add-ons such as Terminal remain under [`../../features/`](../../features/README.md).
