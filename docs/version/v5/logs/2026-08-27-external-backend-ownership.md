# External backend ownership and Claude ACP composition

Date: 2026-08-27
Status: source, integration, and focused desktop verified; real external agents not verified
Owner: V5 Pho Agent Foundation
Slices: B2–B4 correction

## Owner decisions

- Pho Code owns and embeds Pho Agent, including the pinned Pi adapter.
- Codex and ACP agents are required external installations. They own their configuration, authentication, updates, and provider usage.
- Apply the existing process isolation for Claude instead of adding its bridge package to Pho Code.
- The owner will run the real provider-backed Codex journey.
- Pho Agent does not have a subagent feature. Backend-native collaboration may be displayed as ordinary bounded activity, but it is not Pho Agent orchestration and is not an acceptance prerequisite.
- Deliberate Codex manual compaction is not owner-testable yet. Pho Code projects compaction items but has no host/UI command for `thread/compact/start`, so the unsupported manual-compaction capability claim was removed.
- Codex collaboration items remain visible as generic transcript activity, but the unsupported `subagents` capability claim was also removed because Pho Agent has no corresponding operation.

## Changes

- Added lazy production registration for backend `claude-acp`, invoking only the fixed `claude-agent-acp` command after the owner selects Claude.
- Added `@pho-agent/backend-acp` as a Pho Code runtime workspace dependency and Electron-main bundle alias. The external Claude bridge and its Claude Agent SDK are not dependencies of Pho Code or Pho Agent.
- Kept installation and executable selection outside Settings. A missing command is a bounded backend session-creation failure; startup and Pi sessions do not spawn it.
- Corrected V5 product, plan, current-state, and development records. The 2026-08-26 verification log remains unchanged historical evidence; its dependency-conflict blocker is superseded by this owner decision.

## Verification

- `bun test ././packages/pho-agent/packages/backend-acp/test/adapter.test.ts` — 4 passed, including a real missing-executable spawn that returns a bounded initialization error without terminating the process.
- `bun test ././packages/pho-agent/packages/backend-codex/test/adapter.test.ts` — 4 passed after removing the unsupported manual-compaction capability claim; focused Codex typecheck also passed.
- `bun test ././packages/runtime/test/pi-runtime.test.ts` — 27 passed; production backend descriptors are Pi, Codex, and Claude ACP while Pi behavior remains intact.
- `bun test ././apps/desktop/tests/unit/package-boundaries.test.ts` — 13 passed; the ACP package remains one-way and no Claude bridge dependency enters Pho Code.
- `bun run typecheck` — all 11 workspace packages passed.
- `bun run lint` — 0 errors and the same 9 pre-existing React hook warnings.
- `bun run build` — passed; Electron main bundled the ACP adapter/client, not the external Claude bridge.
- `bunx playwright test tests/chat.spec.ts` — 4 passed in the real Electron surface after correcting an initially wrong Playwright role selector for the disclosure summary. The failed attempt reached all three backend rows but timed out locating the info control; changing the test to its label matched the existing accessible element.
- Root and Pho Agent `git diff --check` — passed. Neither lockfile contains `claude-agent-acp` or `@anthropic-ai/claude-agent-sdk`.
- Real Claude ACP and provider execution remain not verified because `claude-agent-acp` is not installed in the current environment. No provider-backed Codex prompt was sent in this slice.

## Remaining work

- Confirm a compatible `claude-agent-acp` executable is visible to the Electron process and run create/prompt/permission/resume in the real desktop.
- Run the owner Codex checklist for prompt, tool approval, reopen/resume, and native compaction activity.
- Then run the packaged external-backend path check and cross-backend acceptance fixtures. Packaging verifies discovery and integration; it does not bundle either external backend.

## Related UI record

See [`../../../ui/logs/2026-08-27-change-claude-acp-session-option.md`](../../../ui/logs/2026-08-27-change-claude-acp-session-option.md).
