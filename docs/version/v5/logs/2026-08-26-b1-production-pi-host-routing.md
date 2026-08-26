# B1 production Pi host routing

Date: 2026-08-26
Status: in source; integration and focused desktop verified; not accepted
Owner: V5 Pho Agent Foundation
Slice: B1
Related prototype: [`2026-08-26-codex-native-activity-prototype.md`](./2026-08-26-codex-native-activity-prototype.md)

## Intent

Route Pho Code's existing production Pi session and run operations through the backend-neutral Pho Agent host without replacing the feature-rich `HarnessRuntime`, changing public `workspaceId`, rewriting Pi sessions, or moving V4 process ownership.

## Implementation

- Added a generic normalized backend registry under `@pho-agent/host`; `createAgentHost` now uses the same registry for duplicate detection, lookup, descriptors, and disposal.
- Added a narrow Pho Code host adapter that registers the existing production Pi session methods: snapshot, create, open, prompt, steer, queued follow-up, and abort.
- Preserved every other `HarnessRuntime` method and the existing Pi implementation bodies. Images, workspace-reference expansion, model/thinking, Plan/Agent, settings, credentials, sandbox, host UI, GitHub MCP, change review, archive/Trash, events, and disposal remain owned by the current product runtime.
- Exposed backend descriptors on the privileged runtime only. The renderer/IPC contract remains unchanged in B1.
- Preserved post-disposal error precedence: later prompt calls still receive the accepted `shuttingDown` harness error rather than an internal registry error.

## Verification

- `bun run --filter @pho-agent/host typecheck` — passed.
- `bun run --filter @pho-code/runtime typecheck` — passed.
- Focused host, stub-runtime, and package-boundary tests — 18 passed, 0 failed.
- Full `packages/runtime/test/pi-runtime.test.ts` — 27 passed, 0 failed after correcting post-disposal error precedence.
- Root `bun run typecheck` — all 11 package tasks passed.
- Focused ESLint for the changed host/runtime source and boundary test — passed.
- `bun run build` in `apps/desktop` — passed.
- `bunx playwright test tests/chat.spec.ts` — 3 passed, 0 failed outside the GUI-restricted sandbox. The first sandboxed attempt could not launch Electron; it did not reach a product assertion.
- Final diff checks remain part of the combined backend-projection handoff.

## Handoff

B2b/B4 can now add a product bridge for Codex and ACP without making their adapters pretend to implement Pi-only settings or review semantics. Backend identity must enter application/session metadata before non-Pi sessions become selectable; B1 intentionally does not infer that persisted-data/UI decision.

Later combined typecheck, build, Electron, test, lockfile, and diff evidence is recorded in [`2026-08-26-backend-foundation-verification.md`](./2026-08-26-backend-foundation-verification.md).
