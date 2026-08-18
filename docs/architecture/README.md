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

Accepted V3 ledger and recovery behavior is part of the architecture below; its immutable product and evidence live under [`../archive/v3/`](../archive/v3/README.md). Agent-tool sandbox is accepted; its immutable product and evidence live under [`../archive/features/sandbox/`](../archive/features/sandbox/README.md). Proposed terminal/PTY behavior remains under [`../features/terminal/`](../features/terminal/README.md). Proposed bounded Stop remains under [`../urgent/agent-stop/`](../urgent/agent-stop/README.md) until accepted. Proposed window-first boot and Pi `utilityProcess` remain under [`../urgent/window-first-pi-core/`](../urgent/window-first-pi-core/README.md) until accepted. Plan/Agent remains under [`../features/plan-agent/`](../features/plan-agent/README.md); Milestones 0–2 are in source and not accepted.
