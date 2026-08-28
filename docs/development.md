# Development and runbook

For a change-specific verification workflow, use [`.agents/skills/test-pho-code`](../.agents/skills/test-pho-code/SKILL.md). This page remains the detailed command, environment, isolation, and debugging reference.

## Current workspace

The repository is a Bun TypeScript workspace with one Electron desktop app, three private Pho Agent packages from the pinned `packages/pho-agent` production submodule, and four Pho Code packages. See the accepted [`codebase map`](./architecture/codebase-map.md), the in-progress [`V5 M0 ownership record`](./version/v5/logs/2026-08-20-m0-harness-ownership-expansion.md), and [`current-state.md`](./current-state.md). The four `refs/*` reference submodules remain read-only; `packages/pho-agent` changes only when a task explicitly advances the reusable runtime.

After a fresh clone, materialize the references with:

```bash
git submodule update --init --recursive
```

This checks out the revisions recorded by the outer repository, including the production Pho Agent runtime. Do not replace it with `git submodule update --remote`; every submodule upgrade must be a deliberate pinned-gitlink change.

Inspect the current state with:

```bash
git status --short --branch
git submodule status
git -C refs/pi-gui status --short --branch
git -C refs/pi-web status --short --branch
git -C refs/t3code status --short --branch
git -C packages/pho-agent status --short --branch
```

Browse files with:

```bash
rg --files -g '!node_modules' -g '!dist' -g '!build'
```

Do not run install/build commands inside a `refs/*` reference submodule as if that built this product. Do not modify, clean, reset, or advance reference submodules unless a task explicitly changes them. `packages/pho-agent` has its own development commands and changes only when a task explicitly advances the reusable runtime.

### Implemented package map

| Path | Current responsibility |
| --- | --- |
| `packages/pho-agent/packages/protocol` | Product-neutral opaque scope/session/run contracts, JSON safety/errors, and reusable Plan/ask-user/todo, skills, and fixed GitHub MCP contracts; no Node, Pi, Electron, React, or Pho Code imports |
| `packages/pho-agent/packages/runtime` | Pinned Pi construction/services, headless `AgentRuntime`, generic feature composition, bounded session registry, Plan/ask-user/todo, skill discovery/invocation, context-prompt Pi hook, and optional fixed read-only GitHub MCP lifecycle; no Pho Code, Electron, or React imports |
| `packages/pho-agent/packages/evals` | Frozen V5 development/holdout fixtures, typed result schema, deterministic runner/scoring, fingerprints, and append-only result output |
| `packages/protocol` | Pho Code bridge/event/settings/workspace/change-review contracts plus compatibility re-exports of shared agent protocol values |
| `packages/runtime` | Pho Code's `HarnessRuntime` product adapter, canonical-workspace authority, packaged/development resource location, extension host UI, permission and sandbox product policy, provider accounts, local coding retrieval/web, prepared images, recoverable Trash, context-prompt settings, coding skill/resource selection, V3 change ledger/recovery, and compatibility adapters for shared agent capabilities |
| `packages/application` | Workspace/session/prompt/settings/credential use cases, session catalog, archive/restore/remove metadata, recent-workspace, appearance, enabled skill-source, GitHub MCP enabled metadata, idle-only sandbox apply, change-review command validation, shutdown |
| `packages/ui` | T3-derived desktop chat shell: multi-project sidebar, transcript, composer (mode icon menu for Plan/Agent + Images…, model, thinking; meta strip folder + usage meter), tool rows, persistent right-sidebar pill (docked Changes + Context prompt + Plan document; Changes can Expand into an overlay), host dialogs including ask-user questionnaire, floating Settings dialog (Appearance, Accounts, GitHub, Skills, Archived, Permissions, Sandbox) with deferred API-key import, GitHub PAT, and provider OAuth, sanitized markdown with KaTeX/Shiki/Mermaid/SVG, Tailwind theme |
| `apps/desktop/electron` | Composition root, native picker, typed IPC results/events, `nativeTheme` appearance, packaged resource/NODE_PATH wiring, staged `rg` PATH prepend for GUI and packaged launches, agent-dir override, test seams |
| `apps/desktop/src` | Shell state and conversation React composition |
| `apps/desktop/tests` | Playwright smoke/security/shutdown/chat/abort/session-lifecycle/host-ui/ask-user/permission/settings/credentials/change-review/sandbox specs, packaged artifact lane, unit tests, fail-closed trash helper |

The production build writes `apps/desktop/out/main`, `out/preload`, and `out/renderer`. These are ignored build artifacts, not distributable installers.

## Prerequisites

- macOS development machine for the first desktop verification;
- Git with submodule support;
- bun `1.3.14` or newer, matching `packageManager` in the root `package.json`;
- Node `>=22.19.0` for Playwright and other Node-hosted tooling;
- native build tools required by future native Electron dependencies.

Bun is the package manager and the runner for protocol/application/runtime unit tests. It is not the desktop runtime. The Electron-embedded Node version, not only the developer's Node or bun, must satisfy the pinned Pi SDK's engine requirement.

Linux contributors should have the libraries required by the selected Electron version. Exact packages belong here after a Linux build is verified; do not copy a speculative distro package list.

## Current root commands

Run commands from the repository root:

| Command | Contract |
| --- | --- |
| `bun install --frozen-lockfile` | Install the exact lockfile dependency graph without updating it. |
| `bun run dev` | Start Electron Vite and launch the conversation window with renderer hot reload. |
| `bun run build` | Produce Electron main, preload, and renderer production bundles; does not imply an installer. |
| `bun run typecheck` | Type-check protocol, runtime, application, renderer, preload, and main. |
| `bun run lint` | Run repository lint rules without modifying files. |
| `bun run test` | Run non-GUI unit and integration tests. Carries `--timeout 20000`; a narrow `bun test <paths>` must pass that flag itself, because `bunfig.toml` does not honour a test timeout and cold module loading can stall the lane past the 5 s default. |
| `bun run eval:v5` | Run the frozen V5 M0 live deterministic development and holdout cohorts through Pho Code's isolated `harness-test/slice` runtime. `eval:v5:development` and `eval:v5:holdout` run one cohort. Results are append-only files in an owned temporary directory. |
| `bun run test:desktop` | Build the Electron test target and run smoke, security, shutdown, chat, bounded Stop/Stop-all, session-lifecycle, host-UI, ask-user, permission, settings, credentials, OAuth, developer-mode, project-trust, change-review, and sandbox specs. |
| `bun run package:mac` | Stage baked features, pinned sandbox-runtime, bundled `rg`, notices, `LICENSE`, and `EULA.md`, flatten production `node_modules`, and create an unsigned local macOS `.app` under `apps/desktop/release`. |
| `bun run package:mac:proof` | Same staging, then a fail-closed Developer ID / hardened-runtime / notarized DMG+ZIP proof under `apps/desktop/release-proof`. Missing signing or notarization credentials write no proof artifact. The output is labeled `m0-proof`, not a V4 beta. |
| `bun run stage:github-mcp` | Fetch the pinned GitHub MCP binary into gitignored `apps/desktop/resources` for `bun run dev`. `package:mac` stages the same artifact. The running app never downloads it. |
| `bun run stage:ripgrep` | Fetch the pinned ripgrep binary into gitignored `apps/desktop/resources` for sandbox init. `package:mac` stages the same artifact. The running app never downloads it. |
| `bun run test:packaged` | Smoke the packaged `.app` with isolated user data, baked-feature loading, and a PATH that does not contain `pi`. |

Package-local scripts exist for focused work, but documentation and CI should call the root commands for milestone acceptance.

`bun run package:linux` remains later until a real Linux artifact is in scope. Local `package:mac` stays unsigned. Signed proof packaging is `package:mac:proof` and requires owner-held Developer ID and notarization credentials documented in [`version/v4/release-preflight.md`](./version/v4/release-preflight.md). Public `package:mac:release` remains a Milestone 4 contract until implemented.

## First setup

```bash
bun install --frozen-lockfile
bun run stage:github-mcp
bun run stage:ripgrep
bun run dev
```

Expected development behavior:

- one Electron window opens;
- the first screen is a native workspace picker unless a workspace is already selected;
- renderer changes hot reload while the Electron main process retains the current application/runtime instance;
- main/preload/runtime changes restart the development process cleanly;
- application metadata goes to `userData/app-metadata.json` unless `PHO_CODE_USER_DATA_DIR` changes the entire application-data root;
- personal runs use the app-owned `userData/pi-agent` directory for Pi-compatible auth, models, sessions, permission config, and logs;
- `PHO_CODE_AGENT_DIR` explicitly replaces only the Pi data root and is treated as external/shared;
- desktop tests isolate `userData`, so a separate agent-directory override is needed only when a test intentionally exercises shared-scope disclosure;
- GitHub MCP in Settings needs the pinned binary under gitignored `apps/desktop/resources`; run `bun run stage:github-mcp` once (or `bun run package:mac`). The running app never downloads it. After staging, restart development or turn the GitHub row off and on.
- Settings → Sandbox defaults on and needs the pinned `rg` binary under the same resources tree; run `bun run stage:ripgrep` once (or `bun run package:mac`). Missing `rg` fails closed and refuses agent bash. GUI `PATH` does not need Homebrew `rg`. The running app never downloads it. Deterministic tests (`PHO_CODE_TEST_MODEL=1`) keep sandbox off unless `userData/sandbox-settings.json` opts in, so permission journeys stay unsandboxed.
- Plan/Agent is in the default feature manifest. Isolated `PHO_CODE_TEST_MODEL=1` tests need `PHO_CODE_TEST_FEATURES=1` to load the factory. Exercise ask-back with `USE_ASK_USER` (`apps/desktop/tests/ask-user.spec.ts`). Plan vs Agent is the composer mode button (`composer-context-button`: Bot in Agent, ListTree in Plan; menu Mode + Images…). Plan option title states writes are off and shell is not sandboxed. `USE_WRITE` in Plan should not create files. `USE_PLAN_DOC` fills the Plan rail; Execute writes are V3-tracked. `USE_TODO` updates the same list in the transcript tool row and Plan rail (not the composer meta strip). Packaged evidence is the Plan/Agent journey in `apps/desktop/tests/packaged.spec.ts`.
- Pho Code owns Pho Agent and embedded Pi. Codex and Claude ACP are optional external prerequisites. The fixed `codex` and `claude-agent-acp` commands must be compatible and visible on the Electron process `PATH`; Pho Code does not install, download, configure, authenticate, or update them. Both registrations are lazy, so normal Pi startup does not spawn either process. Codex `0.149.1` is the currently characterized build, but Pho Code does not require that exact version: a successful app-server initialization and the operations actually used are the compatibility boundary. Codex model choices come from App Server `model/list`; ACP model choices appear only when the session supplies a stable select configuration option categorized as `model`. Claude ACP has not yet received owner/provider verification.

### Isolation and test environment variables

| Variable | Role |
| --- | --- |
| `PHO_CODE_USER_DATA_DIR` | Electron `userData`; its default Pi root is `<userData>/pi-agent` |
| `PHO_CODE_AGENT_DIR` | Explicit external/shared Pi data root; also sets `PI_CODING_AGENT_DIR` |
| `PHO_CODE_TEST_MODE=background` | Headless Electron test launch |
| `PHO_CODE_TEST_WORKSPACE` | Inject a directory as if it was chosen with the native picker (test-only) |
| `PHO_CODE_TEST_MODEL=1` | Register the deterministic faux model and `harness_mark` tool |
| `PHO_CODE_TEST_AUTH=1` | Register the deterministic `pho-test-oauth` provider used by the Milestone 2 OAuth journey; do not combine with `PHO_CODE_TEST_MODEL=1` when checking the model picker |
| `PHO_CODE_TEST_FEATURES=1` | Load the default baked-feature manifest in tests (permission package, Cursor SDK provider, recoverable Trash, pho-web, curated-skills identity, and the inline plan-agent factory); otherwise tests use an empty manifest |
| `PHO_CODE_RESOURCES_DIR` | Override the staged resource root in source development/tests; packaged production ignores it and uses Electron `process.resourcesPath` |
| `PHO_CODE_SHUTDOWN_PROBE` | Write a JSON dispose probe on quit |

Desktop tests must set `PHO_CODE_USER_DATA_DIR` through the shared launcher. With no agent override, Pi state stays inside that isolated directory. Tests that set `PHO_CODE_AGENT_DIR` must provide a separate owned temporary directory.

## Current verification status

This runbook does not treat historical PASS counts as current evidence. Accepted evidence is immutable under [`archive/v1`](./archive/v1/README.md) and [`archive/v2`](./archive/v2/README.md); active execution evidence belongs in the owning dated version, feature, or UI work log.

For current work, run the narrowest relevant checks, record actual results with their verification class, then run the owning plan's exit gate before acceptance. Never carry a stale PASS result forward as evidence for a later change.

Personal-v1 evidence lives in its archived implementation and milestone reviews. `docs/third-party-notices.md` is regenerated by `bun run package:mac` alongside the artifact copy. Keep TypeScript and `typescript-eslint` inside their declared peer-version ranges.

Personal-v2 evidence lives in its archived implementation plan and closure review.


## Recorded runtime compatibility

The desktop pins Electron `43.4.0` and `@earendil-works/pi-coding-agent` `0.84.1` (with matching `@earendil-works/pi-ai` `0.84.1`). The Electron runtime reports embedded Node `24.18.1`, which satisfies Pi's `engines.node` of `>=22.19.0`.

Installed 0.84.1 typings are the API source of truth. The public SDK guide is [packages/coding-agent/docs/sdk.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md); `main` may describe a newer SDK than this pin. Notable 0.84.1 details used by this slice:

- construct sessions with `createAgentSessionRuntime` / `createAgentSessionServices` / `createAgentSessionFromServices`
- `session.prompt(..., { source: "interactive", preflightResult })` for admission; `prompt()` resolves after the full run
- do not treat the first `agent_end` as completion when retries remain; this host settles from `prompt()` plus abort/error
- `getDefaultSessionDir` is not a public export; isolated runs set `PI_CODING_AGENT_DIR` so Pi's default session layout stays in the injected agent directory
- native-picker approval is process-lifetime; the explicit Settings action remembers permission-rule trust in Pho Code metadata and still never writes Pi's shared `trust.json` or enables project extensions
- the deterministic test path uses `fauxProvider` from `@earendil-works/pi-ai` and `defineTool` `harness_mark`

Never upgrade Pi and Electron opportunistically in an unrelated feature change.

## Local data isolation

Tests and demos must use temporary locations:

```text
<temp>/pho-code-test-*/
├── agent/
├── app-data/
└── workspace/
```

Inject these paths through runtime configuration. A test must fail before operating on the user's default Pi directory when isolation was expected.

Test cleanup follows the repository deletion policy. Never permanently delete a path, including a temporary fixture. Cleanup must use a recoverable platform Trash operation and must first prove that the canonical target is an owned direct child of the canonical temp root. Fail closed when the Trash facility or ownership proof is unavailable.

## Development workflow

1. Read the current implementation milestone and architecture.
2. Define the observable acceptance criteria.
3. Add or update protocol types first when crossing the desktop boundary.
4. Implement pure runtime/application behavior independently of Electron when possible.
5. Add the Electron adapter and renderer behavior.
6. Run focused tests during iteration.
7. Run the milestone exit checks.
8. Inspect the app on the real Electron surface.
9. Review the diff, resource paths, attribution log, and repository status.

## Debugging startup

Check in this order:

1. Does the root command exist and use the pinned package manager?
2. Did shared packages build before main/preload imported them?
3. Does Electron's embedded Node satisfy Pi's engine?
4. Does the eager Electron main entry avoid broad `@pho-code/runtime` value imports, with Pi present only in the dynamic runtime chunk?
5. Is the preload path absolute and present in the built output?
6. Are `contextIsolation`, `sandbox`, and `nodeIntegration` configured correctly?
7. Is the renderer loading the expected local dev URL or packaged file?
8. Are the agent directory, application data directory, and workspace absolute and accessible?
9. Did resource loading produce diagnostics?
10. Did a native dependency require an Electron ABI rebuild?
11. If main fails with `The requested module 'electron' does not provide an export named 'BrowserWindow'`, is `ELECTRON_RUN_AS_NODE` set? Unset it (`env -u ELECTRON_RUN_AS_NODE bun run dev`). Playwright already deletes it in `desktopLaunchEnv`.

Window-first bootstrap is authoritative through `BootstrapState.piRuntime`: `starting`, `ready`, or `failed`. The separate status subscription is only a wakeup; diagnose a missed transition by querying bootstrap, not by replaying it through the sequenced runtime event reducer. A fixed `runtime_unavailable` response while starting/failed is expected, not an IPC outage.

Desktop tests reserve `PHO_CODE_TEST_RUNTIME_GATE` for an absolute file gate and `PHO_CODE_TEST_RUNTIME_FAILURE=1` for the redacted failure path. These seams are accepted only with `PHO_CODE_TEST_MODE=background`; do not use sleeps or the owner's Pi directory for startup-order tests.

Log paths and versions, but do not log API keys, auth files, MCP tokens, complete environment dumps, or sensitive tool payloads.

## Debugging a missing model

Verify:

- the runtime uses Pi's model runtime rather than a handwritten catalog;
- expected Pi credentials exist through a supported auth source;
- custom model configuration is valid for the pinned SDK;
- cached catalogs are available when startup network refresh is disabled;
- model/provider errors are reported through a redacted diagnostic;
- session-restored models fall back visibly when no longer available.

Settings opens as a floating dialog over the conversation, with compact **Appearance**, **Accounts**, and **Permissions** sections so later panels can be added without a full-page overlay. The **Accounts** tab lists Pi providers as compact status rows, imports API keys only after an explicit Add key action, and runs one OAuth flow at a time through Pi `ModelRuntime`. Cursor stays in that list so a key can be added; Cursor models stay out of the composer picker until a stored key or `CURSOR_API_KEY` exists. The renderer receives redacted status, device codes, and opaque link handles; it never receives stored secrets or authorization URLs, and unconfigured providers do not render empty key fields. Reopening Settings during an active login opens the Accounts tab. Escape or the backdrop dismisses the dialog without cancelling an in-flight login. `PHO_CODE_TEST_AUTH=1` registers a fake OAuth provider for desktop and packaged checks. Do not read and expose raw `auth.json` contents to the renderer. The explicit `PHO_CODE_AGENT_DIR` override remains available for development interoperability.

## Debugging sessions and streaming

- Subscribe before prompting so early events are not missed.
- Correlate UI runs with application run IDs.
- Reject or ignore stale sequence/run events.
- Treat deltas as display updates and final messages as authority.
- Distinguish prompt rejection from failure after admission.
- Confirm abort settles the UI and allows a later prompt.
- Stop-all loops the existing `abortRun` over every working/attention activity row; use `stopRunsAndClose` in a desktop spec that deliberately leaves live work before teardown.
- On resume, compare the projected transcript with Pi's current session messages.
- On session replacement, re-subscribe and re-bind extensions.
- Flush durable settings/catalog writes before asserting them in tests.

## Debugging baked features

- Confirm the feature ID/version exists in the source-controlled manifest.
- Confirm `DefaultResourceLoader` has ordinary extensions/skills/prompts disabled and receives only manifest factories/paths.
- Resolve packaged paths through `ResourceLocator`; do not depend on cwd, source-tree layout, global npm, or the owner's Pi package settings.
- Inspect Pi loader diagnostics rather than independently guessing load success.
- For the permission feature, distinguish package load failure, host-dialog transport failure, policy denial, and unsupported terminal-only configuration UI.
- Treat `[object Object]` as an error-normalization defect: unsupported host UI must throw a useful `Error` and separately record structured diagnostics.
- Restart the development app after changing the manifest. The normal product has no feature reload/install/enable controls.

## Debugging feature settings

- Keep composition and behavior separate: settings never mutate `HarnessFeatureManifest` or Pi package lists.
- Appearance belongs to versioned application metadata; permission behavior belongs to the pinned feature's global config under the active Pi agent directory.
- The default permission file is private to Pho Code under `userData/pi-agent`. An explicit `PHO_CODE_AGENT_DIR` is disclosed as shared because another Pi process may use it.
- Preserve valid fields the simple UI does not own. Treat an unmatched policy as Custom and never replace it merely because another toggle changed.
- A trusted workspace may contribute `.pi/extensions/pi-permission-system/config.json`. Detect/disclose that override before describing the global preset as effective.
- Disable permission updates during an active run. After a successful idle write, reload/rebind through the runtime lifecycle instead of exposing a general feature Reload button.
- `doublePressToConfirm` is TUI-only in permission-system `24.0.0`; do not debug the desktop single-select flow by changing it.

## Desktop verification

### Current bootstrap smoke lane

Covered by `apps/desktop/tests/{smoke,security,shutdown}.spec.ts` plus unit tests under `apps/desktop/tests/unit`. The launcher always isolates `PHO_CODE_USER_DATA_DIR`; individual tests set `PHO_CODE_AGENT_DIR` only when they need a distinct or explicitly shared Pi root. The preload exposes the typed command set plus `subscribe`.

### Milestone 1 chat lane

Covered by `apps/desktop/tests/chat.spec.ts` and `packages/runtime/test/pi-runtime.test.ts`:

1. launch with isolated app/agent/workspace directories;
2. inject the workspace through `PHO_CODE_TEST_WORKSPACE` (native-picker equivalent);
3. start a session with `PHO_CODE_TEST_MODEL=1`;
4. submit `USE_TOOL`;
5. observe the `harness_mark` tool card and final assistant text;
6. close and reopen the same userData/agent/workspace dirs;
7. restore the transcript from Pi JSONL.

Abort, pre-admission vs post-admission failure, dispose, and process-lifetime trust are covered in the runtime integration tests. Real-provider tests are not part of ordinary CI.

The protocol reducer example in `packages/protocol/test/protocol.test.ts` proves that `applyRuntimeEvent` accepts a new run after a terminal snapshot and ignores a late first-run delta. `apps/desktop/tests/chat.spec.ts` submits a second prompt (`hello`) after the tool run and expects the deterministic reply.

### Personal-v1 Milestone 2 representative lane

Covered historically by `packages/runtime/test/pi-runtime.test.ts`. The Resources catalog, reload command, and extension-command launcher were removed in personal-v1 Milestone 3. The retained value is the loader/host-UI seam and session-replacement rebind.

### Personal-v1 Milestone 3 focused lane

Covered by `packages/runtime/test/pi-runtime.test.ts` and `apps/desktop/tests/{chat,host-ui}.spec.ts`:

1. `DefaultResourceLoader` disables ordinary extension/skill/prompt/theme discovery and loads only the source-controlled manifest;
2. project `.pi/extensions` and skills are ignored while `AGENTS.md` remains present;
3. select/input host requests use the shared dialog lifecycle and rebind after session replacement;
4. unsupported host UI throws a useful `Error` instead of a stringified object;
5. a newly created active session appears immediately in the sidebar;
6. Electron `USE_TOOL` with `PHO_CODE_TEST_HOST_UI=1` completes a select dialog;
7. conservative Markdown/code rendering covers assistant and streaming text.

Deterministic tests default to an empty manifest so they do not load the permission package. `PHO_CODE_TEST_FEATURES=1` or `createDefaultFeatureManifest()` loads the pinned permission feature, the baked Cursor SDK provider (`pi-cursor-sdk` local-only), the application-owned Trash tool, canonical FFF-backed `find`/`grep` and composer path retrieval, pho-web, the inline plan-agent factory, and the curated-skills feature identity (skills themselves are inserted with `/`, not Pi `additionalSkillPaths`). Personal `bun run dev` uses the same production fallback manifest plus named skill load. FFF is bundled; these retrieval tools do not require or download `rg` or `fd`. The separately bundled `rg` remains a sandbox-runtime resource.

Keep these checks focused. Do not add a visual-regression framework or reproduce the complete third-party permission extension suite.

### Personal-v1 Milestone 4 focused lane

Covered by `packages/runtime/test/permission-settings.test.ts`, `packages/application/test/settings.test.ts`, and `apps/desktop/tests/settings.spec.ts`:

1. Guarded/Balanced map to the reviewed policies; string catch-alls match a `*` map; Custom is preserved on unrelated YOLO changes;
2. invalid/unrecognized existing permission config is refused; managed writes are atomic and keep unowned fields;
3. application appearance (palette, mode, glass, UI font size, chat font size, installed UI/code font families, font smoothing) persists independently of permission settings and migrates v1–v3 `theme` into Default palette + mode with glass defaults;
4. one Electron journey persists palette/mode/glass across relaunch, applies Guarded, and completes the next gated `USE_TOOL` call;
5. typecheck, lint, unit/integration tests, and build pass.

Do not build a generic schema-form test matrix or copy the third-party package's policy test suite.

### Personal-v1 Milestone 5 focused lane

Covered by `packages/runtime/test/{resource-locator,credentials}.test.ts`, `scripts/stage-app-resources.test.ts`, `apps/desktop/tests/credentials.spec.ts`, and `apps/desktop/tests/packaged.spec.ts`:

1. packaged `ResourceLocator` resolves `features/<package>` and never falls back to `node_modules` or global Pi;
2. missing permission package fails closed with a named diagnostic instead of loading ambient packages;
3. API-key import persists through Pi `ModelRuntime.login` into isolated `auth.json` and never returns the secret;
4. Electron Settings imports a dummy key without exposing it on the bridge;
5. `bun run package:mac` stages the pinned permission feature, nested runtime dependencies, the three Pho Code skills, the pinned GitHub MCP native binary (SHA-256 verified; fetched into a gitignored cache when missing), the pinned `@anthropic-ai/sandbox-runtime` engine with nested deps, bundled `rg` (SHA-256 verified), and `THIRD_PARTY_NOTICES.txt`;
6. `bun run test:packaged` launches the unsigned `.app` with isolated user data, `PHO_CODE_TEST_FEATURES=1`, and a PATH that does not contain `pi`.

Default Playwright config ignores `packaged.spec.ts`; the packaged lane uses `playwright.packaged.config.ts`.

### Milestone 0 (v2) focused lane

Covered by `packages/runtime/test/{permission-engine,permission-settings,developer-runtime,trash-target,recoverable-removal,host-dialog-presentation}.test.ts`, `apps/desktop/tests/developer.spec.ts`, and `apps/desktop/tests/packaged.spec.ts`:

1. Developer maps to the reviewed policy; Guarded/Balanced stay unchanged and are never silently detected as Developer;
2. characterization covers compound commands, wrappers, redirection, and representative deny families;
3. Trash target validation refuses workspace roots, protected app/Pi/reference paths, missing paths, and outside-workspace paths;
4. OS Trash adapter uses `/usr/bin/trash` on macOS and never falls back to `rm`;
5. one Electron journey selects Developer, allows `USE_SAFE_SHELL`, denies `USE_DANGEROUS_SHELL`, and moves an owned fixture with `USE_TRASH`;
6. packaged macOS loads `permission-system` and `recoverable-trash` without a Pi CLI and completes the Trash journey under the third owner-facing mode.

### Milestone 2 (v2) accounts lane

Covered by `packages/runtime/test/{provider-auth-flow,provider-oauth,credentials}.test.ts`, `packages/protocol/test/protocol.test.ts`, `packages/application/test/settings.test.ts`, `apps/desktop/tests/{oauth,credentials,smoke}.spec.ts`, and `apps/desktop/tests/packaged.spec.ts`:

1. Pi provider discovery includes OAuth-only providers such as `openai-codex` and the subscription classification disclosure;
2. the one-flow coordinator rejects stale ids, concurrent starts, invalid select values, and active-run mutation;
3. canary tokens and authorization URLs never appear in protocol snapshots, events, or renderer HTML;
4. a deterministic `pho-test-oauth` provider completes browser login, opens only the retained test URL, updates the model picker, and logs out into isolated `auth.json`;
5. the packaged app exposes the same Provider accounts surface without a Pi CLI.

Live `openai-codex` login remains outside ordinary CI. The owner verified it on 2026-08-13; the fake-provider journey covers logout and model-list sync in the Electron and packaged lanes.

v2 Milestone 2 acceptance evidence, recorded 2026-08-13:

```text
bun run typecheck     PASS
bun run lint          PASS
bun test              PASS — 252 tests
bun run test:desktop  PASS — 10 Electron tests (including oauth)
bun run build         PASS
bun run package:mac   PASS — unsigned Apple Silicon app
bun run test:packaged PASS — 2 packaged smokes (permission/Trash and fake OAuth)
```

Milestone 2 verification classes:

- **unit verified:** protocol JSON-safe flow snapshots, `providerAuthFlow` reducer, HTTP(S) URL parser, one-flow coordinator (stale ids, concurrent starts, select validation, canaries, URL expiry, prompt abort), application secret-echo rejection
- **integration verified:** real Pi `0.84.1` lists `openai-codex`; fake `pho-test-oauth` login/logout writes isolated `auth.json` and never echoes canary tokens or authorization URLs
- **desktop verified:** Settings completes the fake OAuth journey, opens only the retained test URL, updates the model picker, and logs out
- **packaged verified:** unsigned local `.app` exposes the same Provider accounts surface without a Pi CLI
- **owner verified:** live `openai-codex` login in the system browser, with the resulting Codex account working in Pho Code
- **not verified:** other Pi OAuth providers; Linux browser integration; separately reported live refresh-on-use or live Codex logout; Keychain-backed storage. GitHub MCP OAuth is intentionally unavailable because that integration is PAT-only.

v2 Milestone 3 acceptance, recorded 2026-08-14:

The owner accepted the real-provider background-switch, archive/restore, and Trash removal workflow, including live thinking surviving chat switches. Desktop and packaged continuity journeys are recorded in the archived [v2 implementation plan](./archive/v2/implementation-plan-v2.md).

Milestone 3 verification classes:

- **unit verified:** composite session keys; catalog/archive metadata; busy-state Trash refusal; keyed live-run store isolation (background thinking survives switch-back)
- **integration verified:** two real Pi `0.84.1` session runtimes share `ModelRuntime`, persist distinct transcripts, and dispose independently; archive/restore leaves the Pi artifact untouched; settled removal uses the Trash boundary with no permanent fallback
- **desktop verified:** background deterministic run continues after switching chats; archive/restore; busy Trash refusal; settled Trash
- **packaged verified:** unsigned local `.app` keeps a background run, persists archive across relaunch, restores, and moves a settled chat to Trash from isolated app-owned data without a Pi CLI
- **owner verified:** real-provider background switching across chats/workspaces, live thinking across switches, archive/restore, and Finder Trash recovery
- **not verified:** Linux desktop/package and real Linux Trash; surviving app exit/crash; fork/tree navigation, compaction, worktrees, or unattended background execution

### Optional real-provider recipe

Not a CI requirement. Personal runs can sign in through a provider account or import a provider API key in Settings. A development run may still explicitly reuse the owner's Pi operational data:

```bash
PHO_CODE_AGENT_DIR="$HOME/.pi/agent" bun run dev
```

This opt-in affects auth, models, sessions, permission config, and logs. It does not load the owner's Pi extensions, skills, prompts, packages, or MCP configuration, and Settings labels the directory as shared. A normal `bun run dev` uses Pho Code's private data root; sign in to a provider account in Settings if no models are authenticated.

1. Choose a local workspace with the native directory picker.
2. Sign in through a provider account in Settings if needed, then create a session.
3. Send a short prompt.
4. Confirm streaming text, any tool activity, Stop, and quit/reopen.

If no authenticated model is available, the UI should say so and point at Settings provider accounts. Never point an automated test at the user's real Pi directory.

Use a deterministic provider or injected runtime in the core lane. Real-provider tests belong in a separate opt-in lane and must not be required for ordinary CI.

## Platform claims

- **macOS supported:** only after development and packaged smoke checks on the stated architecture.
- **Linux compatible:** means pure logic and build configuration avoid macOS assumptions; it is not “Linux supported.”
- **Linux supported:** only after a real Linux desktop/package smoke test and documented dependencies.
- **Windows unsupported:** do not add or advertise Windows artifacts.

## Reference applications

- `refs/pi-gui` demonstrates an Electron shell, direct Pi SDK driver, extension UI adaptation, sessions, worktrees, and desktop tests.
- `refs/pi-web` demonstrates an in-process Next.js Pi host, HTTP/SSE projection, package/skill management, and file-access boundaries.
- `refs/t3code` demonstrates a polished multi-agent control surface and desktop product patterns; it is a UI/product reference, not the Pi runtime architecture.

Consult them to answer a bounded question. Prefer current Pi documentation and installed typings for SDK behavior. Record copied/adapted code in the attribution log.
