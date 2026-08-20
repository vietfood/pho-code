# M0 reusable harness ownership expansion

Date: 2026-08-20
Status: implementation complete and non-packaged verified; M0 acceptance blocked by owner-deferred packaged gate
Owner: repository owner
Plan: V5 Milestone 0, Slice 0D
Related: [`M0 baseline correction`](./2026-08-20-m0-evaluation-baseline-correction.md), [`Pho Agent production submodule`](./2026-08-20-m0-pho-agent-submodule.md), accepted [`Plan/Agent`](../../../archive/features/plan-agent/README.md), accepted [`V2 GitHub MCP and skills`](../../../archive/v2/README.md)

## Owner decision

The owner confirmed that reusable harness engineering should live in Pho Agent rather than remain branded and implemented inside Pho Code. Named examples were skills, the fixed GitHub MCP integration, ask-user, and Plan mode. The boundary is capability-based rather than a literal percentage: a headless non-code consumer should be able to use shared mechanics without importing Electron, React, workspace/Git/change-review, terminal, or Pho Code packages.

The owner also directed that `package:mac` must not run. Packaged verification therefore remains unavailable and cannot be implied by the M0 result.

## Implemented ownership

- `@pho-agent/protocol` now owns generic errors/JSON safety and the accepted Plan/ask-user/todo, skills, and fixed GitHub MCP contracts. `@pho-code/protocol` keeps compatibility re-exports so existing bridge values and renderer imports do not change.
- `@pho-agent/runtime` now owns feature-manifest flattening, the bounded opaque-scope session registry, Plan/ask-user/todo implementation, skill discovery/invocation, the context-prompt Pi hook, and the fixed read-only GitHub MCP allowlist/client/feature/artifact/secret-store seam.
- Pho Code retains adapters for `{ workspaceId, sessionId }` to `{ scopeId, sessionId }`, context-prompt setting resolution, curated coding-skill paths/content, app metadata and Settings enablement, resource-root composition, Electron host UI, and coding-only services.
- The MCP SDK dependency moved from `@pho-code/runtime` to `@pho-agent/runtime`. Vite aliases and externalization cover every private agent subpath before the package-root aliases, and package collection walks the new owner without copying workspace TypeScript.
- Existing persisted custom-entry names, tool names, GitHub credential service/account keys, bridge shapes, data roots, and visible copy remain compatible.

## Deliberate limits

- Electron main remains the composition root and Pi remains in the same process; this does not implement held V4 utility-process work.
- Pho Code's full `HarnessRuntime` still coordinates coding-product methods. Shared lifecycle algorithms and Pi construction are agent-owned, while workspace/Git/change review/Undo, retrieval, sandbox product policy, terminal, UI, and packaging paths remain product responsibilities.
- No Task Brief, evidence pack, verification ledger, completion command, memory, research behavior, subagent, or long-job behavior was added.
- The fixed GitHub integration is an optional source-controlled Pho Agent feature, not ambient MCP discovery, arbitrary server configuration, or a generic MCP manager.

## Verification

- Focused Plan/ask-user/todo plus Pho Code runtime parity: **PASS**, 44 tests.
- Focused skill registry/invocation plus Pho Code runtime parity: **PASS**, 39 tests.
- Focused GitHub MCP and secret-store ownership: **PASS**, 18 tests.
- Focused session-registry/non-code/Pho Code lifecycle: **PASS**, 36 tests.
- Focused context-prompt/Pho Code runtime parity: **PASS**, 34 tests.
- Package-boundary, startup-alias, and package-collection unit checks: **PASS**, 17 tests.
- `bun run typecheck`: **PASS** across all eight workspace packages after the ownership moves.
- `bun run lint`: **PASS** with zero errors and eight pre-existing React hook warnings.
- `bun test`: **PASS**, 708 tests across 148 files, including real Pi lifecycle, non-code consumer, boundary, package-collection unit, and macOS Seatbelt coverage. Seatbelt suites were run outside the outer Codex sandbox because they intentionally create isolated home-directory fixtures and invoke `sandbox-exec`.
- `bun run test:desktop`: **PASS**, 29 Electron journeys.
- `bun run build`: **PASS**; Electron main, preload, and renderer built with the new agent subpaths.
- `git diff --check`: **PASS**.
- `package:mac` and `test:packaged`: **not run by owner direction**.

The first Electron run exposed that `@modelcontextprotocol/sdk` had been externalized from the private runtime chunk even though Node could not resolve it from the desktop output. The configuration now bundles the MCP SDK with that chunk. A focused smoke then passed, the rebuilt main output contained no unresolved `@pho-agent/*` or MCP imports, and the full desktop lane passed 29/29.

Package/staging unit tests created `apps/desktop/resources` and four exact `pho-code-stage-*` temporary directories. They were moved to macOS Trash after verification; no `.package-stage`, `resources`, `release`, or matching temporary package-stage directory remains. No application package was built.

## Handoff

The implementation and all permitted M0 checks are complete. M0 remains implemented-but-unaccepted because its contract requires `package:mac` and `test:packaged`, while the owner directed that `package:mac` not run. The next decision is either an explicit acceptance-gate waiver or keeping M1 blocked. Do not begin M1 while that status is unresolved.
