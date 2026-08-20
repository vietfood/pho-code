# Architecture

Accepted current-codebase decisions, ordered from overview to depth. Proposals belong in a `version/` or `features/` plan until acceptance changes a shared boundary here.

| Document | Role |
| --- | --- |
| [`overview.md`](./overview.md) | System overview, dependency direction, layer ownership, security posture |
| [`codebase-map.md`](./codebase-map.md) | Current packages, module clusters, composition roots, and tests |
| [`protocol-and-ipc.md`](./protocol-and-ipc.md) | JSON-safe commands/events, bridge validation, ordering, errors, boundary enforcement |
| [`runtime-and-data.md`](./runtime-and-data.md) | Application/runtime ownership, session lifecycle, state, storage, credentials, recovery |
| [`renderer-and-ui.md`](./renderer-and-ui.md) | Renderer cache/event flow, conversation UI, right sidebar, accessibility, performance |
| [`desktop-shell.md`](./desktop-shell.md) | Electron for v1, CSP, native modules, migration seam |
| [`extension-model.md`](./extension-model.md) | Baked features, not a plugin platform |

`eslint.config.js` is the executable dependency-boundary enforcement. Architecture explains the invariant; lint prevents forbidden imports from silently changing it.

Accepted V3 ledger and recovery behavior is part of the architecture below; its immutable product and evidence live under [`../archive/v3/`](../archive/v3/README.md). Agent-tool sandbox is accepted; its immutable product and evidence live under [`../archive/features/sandbox/`](../archive/features/sandbox/README.md). Plan/Agent is accepted; its immutable product lives under [`../archive/features/plan-agent/`](../archive/features/plan-agent/README.md). Bounded Stop, Stop-all, and bounded teardown are accepted; their closed urgent evidence lives under [`../archive/urgent/agent-stop/`](../archive/urgent/agent-stop/README.md). Window-first startup is accepted; its closed evidence and explicit packaged/timing limitations live under [`../archive/urgent/window-first-pi-core/`](../archive/urgent/window-first-pi-core/README.md). Proposed terminal/PTY behavior remains under [`../features/terminal/`](../features/terminal/README.md). Pi process extraction remains roadmap Phase F.
