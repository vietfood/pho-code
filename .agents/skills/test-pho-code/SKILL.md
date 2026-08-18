---
name: test-pho-code
description: Run focused unit, integration, Electron, and packaged verification for Pho Code with isolated user, agent, and workspace data. Use when implementing or verifying runtime, protocol, application, UI, IPC, packaging, credentials, permissions, session lifecycle, change review, or other desktop behavior.
---

# Test Pho Code

## Choose the smallest proof

Run from the repository root. Start with tests closest to the changed boundary:

```bash
bun test <test-files>
bun run typecheck
bun run lint
```

Use root scripts for acceptance:

```bash
bun run typecheck
bun run lint
bun test
bun run test:desktop
bun run build
```

Add `bun run package:mac && bun run test:packaged` when packaged resources, native dependencies, Electron ABI, credentials, data roots, CSP, or the owning plan requires packaged evidence.

Never claim a check passed unless it ran. Classify evidence as unit, integration, desktop, packaged, owner-verified, or not verified.

## Keep test data isolated

Never point tests at the owner's normal workspace or Pi data.

- `PHO_CODE_USER_DATA_DIR` owns the complete Electron test-data root.
- `PHO_CODE_AGENT_DIR` is needed only when deliberately testing an external/shared Pi root; give it a separate owned temporary directory.
- `PHO_CODE_TEST_WORKSPACE` must be an owned temporary workspace.
- Test removal must use the repository's owned-temp helpers and recoverable Trash rules.

Do not clean or rewrite real sessions, credentials, package caches, skills, MCP state, screenshots, or workspaces.

## Deterministic desktop lanes

`bun run test:desktop` builds Electron and runs Playwright. During iteration, run the focused spec from `apps/desktop`:

```bash
bunx playwright test tests/change-review.spec.ts
```

Use the shared launcher in `apps/desktop/tests/helpers/electron-app.ts`. Relevant seams:

- `PHO_CODE_TEST_MODEL=1` registers the deterministic model and harness tool.
- `PHO_CODE_TEST_FEATURES=1` loads the baked test feature manifest.
- `PHO_CODE_TEST_AUTH=1` registers the deterministic OAuth provider; do not combine it with the deterministic model when checking model-picker behavior.
- `PHO_CODE_TEST_HOST_UI=1` enables the host-interaction test seam.

Prefer extending the existing focused spec for the affected journey:

- `smoke.spec.ts` — bootstrap and embedded runtime compatibility;
- `security.spec.ts` — sandbox, CSP, navigation, permissions, IPC;
- `chat.spec.ts` — prompt, stream, settle, reopen;
- `session-lifecycle.spec.ts` — background sessions, archive, restore, Trash;
- `host-ui.spec.ts` / `permission.spec.ts` / `project-trust.spec.ts`;
- `ask-user.spec.ts` — Plan/Agent Milestone 0 questionnaire card vs permission dock;
- `settings.spec.ts` / `credentials.spec.ts` / `oauth.spec.ts`;
- `sandbox.spec.ts` — agent-tool sandbox default-on Healthy, wrapped bash, skipped bash asks, denied curl;
- `change-review.spec.ts` — tracked changes, Approve, Undo, conflict, relaunch;
- `shutdown.spec.ts` — bounded disposal;
- `packaged.spec.ts` — app-owned resources and no-Pi-CLI journeys, including Plan/Agent honesty;

Do not replace Electron evidence with component tests when renderer/IPC behavior changed.

## Interactive UI verification

Start development with:

```bash
bun run stage:github-mcp
bun run stage:ripgrep
env -u ELECTRON_RUN_AS_NODE bun run dev
```

If `bun run dev` fails with `The requested module 'electron' does not provide an export named 'BrowserWindow'`, the shell has `ELECTRON_RUN_AS_NODE` set; unset it as above. Playwright already deletes that variable in `desktopLaunchEnv`.

Before starting another server, reuse a healthy existing process. Keep the app alive while the owner may inspect it or request follow-up changes. Stop only the process you started, using its captured PID or terminal session.

Use isolated `PHO_CODE_USER_DATA_DIR` and workspace paths for destructive, credential, permission, archive, Trash, or recovery workflows. Real-provider testing is optional owner evidence and never substitutes for deterministic coverage.

For a UI change, verify:

1. keyboard operation and visible focus;
2. light/dark behavior and reduced motion where applicable;
3. transcript/composer remain primary;
4. loading, empty, error, streaming, settled, and relaunch states that apply;
5. background-chat and composite identity behavior;
6. the real Electron surface, not only a browser-like component harness.

Record owner feedback, regressions, screenshots, and corrections in `docs/ui/logs/` using the owning workstream links.

## Packaged verification

```bash
bun run package:mac
bun run test:packaged
```

The packaged lane must use isolated data and a `PATH` without Pi. Verify app-owned features/resources and fail-closed behavior. Native modules must load against Electron's ABI and must never compile on first user launch.

## Record the result

Write results in the owning dated log under:

- `docs/version/<version>/logs/`;
- `docs/features/<feature>/logs/`;
- `docs/ui/logs/`.

Include exact commands, pass/fail, verification class, environment, failures unrelated to the change, and the next required check. Do not append session evidence to a shared implementation plan.
