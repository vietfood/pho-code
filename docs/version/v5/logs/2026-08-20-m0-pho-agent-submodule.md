# M0 Pho Agent production submodule

Date: 2026-08-20
Status: implementation complete and non-packaged verified
Owner: repository owner
Plan: V5 Milestone 0 foundation extraction
Related: [`M0 harness ownership expansion`](./2026-08-20-m0-harness-ownership-expansion.md)

## Owner direction

Move the reusable Pho Agent runtime into <https://github.com/vietfood/pho-agent.git> so a later Pho Research product can consume the same pinned foundation. Do not run `package:mac`; confirmation will happen on the owner's separate machine.

## Decision

Use one production submodule at `packages/pho-agent`, pinned by the Pho Code gitlink. Keep `@pho-agent/protocol`, `@pho-agent/runtime`, and `@pho-agent/evals` together in that repository because runtime depends on protocol and the evaluation contract versions the same reusable foundation. Pho Code remains a Bun workspace consumer through `packages/pho-agent/packages/*`.

The submodule is not a reference snapshot:

- `refs/*` remain read-only upstream references;
- `packages/pho-agent` is maintained product source with its own README, contributor rules, TypeScript/ESLint configuration, dependency lock, tests, MIT license, and third-party notices;
- Pho Code pins an exact revision and never follows the submodule's remote branch implicitly.

## Compatibility contract

- Package names and public subpath exports remain unchanged.
- Pho Code bridge values, persisted custom-entry names, tool names, data roots, and renderer behavior remain unchanged.
- Electron Vite aliases point into the pinned submodule source and continue to bundle private Pho Agent code.
- The MCP SDK remains bundled into the desktop runtime chunk rather than externalized from a location Node cannot resolve.
- Pho Code's product-specific deterministic evaluation adapter imports `@pho-agent/evals` through its package surface rather than reaching through the submodule tree.

## Published revision

- Repository: <https://github.com/vietfood/pho-agent.git>
- Branch updated: `main`
- Pinned Pho Code gitlink: `ad74a1ae719dee1da22c8941a3f6f6b18e29fde2`
- Commit: `feat: establish reusable Pho Agent workspace`

The submodule has no configured tracking branch in `.gitmodules`; the outer repository records only the exact commit.

## Verification

- Standalone `packages/pho-agent`: `bun install` generated its lockfile.
- Standalone `bun run typecheck`: **PASS** across protocol, runtime, and evals.
- Standalone `bun run lint`: **PASS**.
- Standalone `bun test`: **PASS**, 44 tests across 9 files.
- Pho Code `bun run typecheck`: **PASS** across all eight workspace packages resolved from the submodule layout.
- Focused workspace-boundary, startup-alias, non-code consumer, and package-collection checks: **PASS**, 20 tests.
- Pho Code `bun run lint`: **PASS** with zero errors and eight pre-existing React hook warnings.
- Pho Code `bun test`: **PASS**, 708 tests across 148 files.
- Pho Code `bun run build`: **PASS**; the main chunk contains no unresolved `@pho-agent/*` or MCP SDK imports.
- Pho Code `bun run test:desktop`: **PASS**, 29 Electron journeys.
- Parent and submodule `git diff --check`: **PASS**; the submodule worktree is clean and local `HEAD` matches `origin/main`.
- `package:mac` and `test:packaged`: **not run by owner direction**.

Package-unit tests recreated `apps/desktop/resources` and two exact `pho-code-stage-*` directories. Those artifacts and the temporary inspection clone were moved to macOS Trash after verification. No packaged application was created.

## Handoff

The owner will run packaged confirmation on a separate machine. M0 remains unaccepted under the current plan until that evidence is recorded or the packaged gate is explicitly waived. A future Pho Research repository can add the same remote as a pinned submodule and include `packages/pho-agent/packages/*` in its workspace without importing Pho Code.
