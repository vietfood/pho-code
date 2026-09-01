# Subagent orchestration

Standalone add-on. Not a numbered version. Owner-promoted 2026-09-01.

| Document | Role |
| --- | --- |
| [`product.md`](./product.md) | Product boundary, delegation model, transparency, authority, lifecycle, data, and UX |
| [`implementation-plan.md`](./implementation-plan.md) | Architecture, protocol, runtime, milestones, verification, and acceptance |
| [`logs/`](./logs/README.md) | Dated research, implementation evidence, corrections, feedback, and handoffs |

Status: **In implementation**. Research and the implementation contract exist,
but Pho Code does not yet create or manage Pho-backend subagents. The Pho
backend is the app-owned Pi wrapper and currently uses backend id `pi` in
source. Codex/Claude native collaboration remains backend-owned; Pho renders or
explains only what their adapters truthfully expose.

The first product boundary is intentionally narrow: a Pho/Pi parent may
delegate a self-contained task to a fresh, visible Pho/Pi child session using a
configured Pho model. The child has an immutable identity, a fun name, an exact
delegation prompt, separate permissions, a full transcript, rediscoverable
Stop, and explicit guidance/Continue controls. Parent-mediated relay is
supported; direct peer messages, nested delegation, worktrees, workflows,
scheduling, profiles, CLI adapters, and ambient discovery are deferred.
