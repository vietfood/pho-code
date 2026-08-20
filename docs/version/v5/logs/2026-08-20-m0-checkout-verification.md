# M0 checkout re-verification after Pho Agent submodule init

Date: 2026-08-20
Status: permitted non-packaged gates re-verified; `eval:v5` resolver defect fixed; packaged gate still unavailable
Owner: repository owner
Plan: V5 Milestone 0
Related: [`Pho Agent production submodule`](./2026-08-20-m0-pho-agent-submodule.md), [`M0 harness ownership`](./2026-08-20-m0-harness-ownership-expansion.md), [`live baseline correction`](./2026-08-20-m0-evaluation-baseline-correction.md)

## Intent

Re-run Milestone 0's permitted non-packaged checks on a machine that had just materialized `packages/pho-agent` with `git submodule update --init --recursive` and a fresh `bun install`. Confirm the pinned gitlink still satisfies the M0 contract without starting M1.

## Environment

- Parent `HEAD`: `b339c024788f5fdf28e4ebbeec421ee7ce4827d7`
- Pinned Pho Agent gitlink: `ad74a1ae719dee1da22c8941a3f6f6b18e29fde2`
- bun `1.3.14`; macOS `26.5.2`
- Isolated evaluation and desktop fixtures only; no owner sessions, credentials, or workspaces
- Nested `refs/t3code` submodule recursion failed (`No url found for submodule path 'refs/t3code/.repos/alchemy-effect/.vendor/alchemy'`). That is a read-only reference issue and did not block Pho Agent checkout.

## Defect found during this run

After `bun install`, `bun run eval:v5` failed with `Cannot find module '@pho-agent/evals'`. The root `scripts/run-v5-baseline.ts` imports that package surface, but the root manifest did not declare it, so Bun's isolated linker did not place `node_modules/@pho-agent/evals`.

This is not a new comparison cohort. Fixtures, scoring, fingerprint `5cabf4d18c40fac9761acada4554a6bd5e66bbcfe982625a122e460a36b0baa5`, and M4 thresholds remain those in the [live baseline correction](./2026-08-20-m0-evaluation-baseline-correction.md).

Fix applied in this checkout:

- root `devDependencies["@pho-agent/evals"] = "workspace:*"` plus the matching `bun.lock` entry
- package-boundary test that the root eval command keeps that workspace dependency

## Verification

- Standalone `packages/pho-agent` `bun run typecheck && bun run lint && bun test`: **PASS**, 44 tests across 9 files. Unit/integration verified.
- Pho Code `bun run typecheck`: **PASS** across all eight workspace packages.
- Pho Code `bun run lint`: **PASS**, 0 errors, 8 pre-existing React hook warnings.
- Pho Code `bun test`: **PASS**, 708 tests across 148 files, including real Pi lifecycle, non-code consumer, and package-boundary checks.
- Pho Code `bun run build`: **PASS**. Built main has no unresolved `@pho-agent/*` or `@modelcontextprotocol/sdk` imports; the MCP SDK remains bundled.
- Pho Code `bun run test:desktop`: **PASS**, 29 Electron journeys.
- `git diff --check`: **PASS**.
- First `bun run eval:v5` after clean install: **FAIL** (`Cannot find module '@pho-agent/evals'`).
- Focused `bun test apps/desktop/tests/unit/package-boundaries.test.ts` after the resolver fix: **PASS**, 13 tests.
- Second `bun run eval:v5`: **PASS**. Configuration fingerprint and fixture checksums match the frozen live cohort. Correctness metrics match the correction record (development task success `1/7`, holdout `1/5`; zero forbidden evidence, unsupported claims, and verification false passes; no structured evidence/verification/recovery). Observed aggregate latency `774–958 ms`. Owned raw results: `/var/folders/gv/mds1jknj2z39v2tbx0szcx5c0000gn/T/pho-agent-evals-gcdviP`.
- Real-provider/owner baseline: **not verified**.
- `package:mac` and `test:packaged`: **not run by owner direction**.

`bun run dev` failed before `bun install` with an unresolved `@modelcontextprotocol/sdk` import from the Pho Agent GitHub MCP runtime. After install, the production build and desktop lane resolved that module. Interactive owner inspection of `bun run dev` was not repeated in this record.

## Handoff

Permitted M0 checks still pass on a fresh submodule checkout. The owner later lifted the `package:mac` hold on this machine; packaged evidence is in [`2026-08-20-m0-packaged-verification.md`](./2026-08-20-m0-packaged-verification.md). The root `@pho-agent/evals` workspace dependency is required for `bun run eval:v5` after a clean install; leave it uncommitted only if a later change supersedes this resolver fix.
