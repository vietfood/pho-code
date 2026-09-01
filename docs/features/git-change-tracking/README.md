# Git change tracking

Standalone add-on. Not a numbered version. Owner-promoted 2026-09-01.

| Document | Role |
| --- | --- |
| [`product.md`](./product.md) | Product boundary, tracking model, trust, data, and UX contract |
| [`implementation-plan.md`](./implementation-plan.md) | Architecture, protocol, runtime, milestones, verification, and acceptance |
| [`logs/`](./logs/README.md) | Dated research, implementation evidence, corrections, feedback, and handoffs |

Status: **In implementation**. Research and the product/implementation contract
exist. No git evidence row, shadow repository, run checkpoint, or ledger
cutover exists in source yet. Accepted V3 change review (tool-call-attributed
`write`/`edit` capture, bounded diff workbench, Approve, conflict-safe Undo)
remains the shipped truth until each milestone lands.

The first product boundary is deliberately narrow: read-only git working-tree
evidence in the Changes surface, then an app-owned per-workspace **shadow git
repository** that checkpoints every run of every backend, so bash, MCP,
external-backend, and other on-disk mutations become visible next to the
existing exactly-attributed `write`/`edit` records. The owner's real
repository is never written, staged, committed, reset, or worktreed by this
feature.
