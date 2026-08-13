# Development and runbook

## Current workspace

The repository is a Bun TypeScript workspace with an Electron conversation window on the Pi SDK. Milestones 0 through 5 of personal v1 are accepted. Read the archived [Milestone 5 code review](./archive/v1/reviews/milestone-5-code-review.md) before changing identity, data ownership, packaged feature resolution, packaging, or credential import. Active work lives in the [v2 implementation plan](./implementation-plan-v2.md), while unpromoted work remains in the [roadmap](./roadmap-vnext.md). Conversation chrome lives in the [Conversation UI track](./plans/conversation-ui.md). The three reference submodules remain read-only. See the archived [v1 Milestone 0 review](./archive/v1/reviews/milestone-0-code-review.md) before changing bootstrap security or shutdown.

After a fresh clone, materialize the references with:

```bash
git submodule update --init --recursive
```

This checks out the revisions recorded by the outer repository. Do not replace it with `git submodule update --remote`; reference upgrades must be deliberate changes.

Inspect the current state with:

```bash
git status --short --branch
git submodule status
git -C refs/pi-gui status --short --branch
git -C refs/pi-web status --short --branch
git -C refs/t3code status --short --branch
```

Browse files with:

```bash
rg --files -g '!node_modules' -g '!dist' -g '!build'
```

Do not run install/build commands inside a reference submodule as if that built this product. Do not modify, clean, reset, or advance the submodules unless a task explicitly changes the references.

### Implemented package map

| Path | Current responsibility |
| --- | --- |
| `packages/protocol` | Protocol version, JSON-safe command results/events, workspace/session/run, feature summaries, confirm/select/input host-UI records, typed appearance/permission settings, credential-import commands, `searchWorkspaceReferences` / `@` tokens, steer/follow-up queue state, and prepared image summaries |
| `packages/runtime` | Pi session/loader ownership, baked feature manifest, packaged and development `ResourceLocator`s, extension host, permission-settings adapter, API-key import, FFF local retrieval, pho-web search/fetch, Pi steer/follow-up, prepared image store, deterministic test model |
| `packages/application` | Workspace/session/prompt/settings/credential use cases, recent-workspace and appearance metadata, validation, shutdown |
| `packages/ui` | T3-derived desktop chat shell: multi-project sidebar, transcript, composer, tool rows, host dialogs, compact Settings including API-key import, sanitized markdown with KaTeX/Shiki/Mermaid, Tailwind theme |
| `apps/desktop/electron` | Composition root, native picker, typed IPC results/events, `nativeTheme` appearance, packaged resource/NODE_PATH wiring, agent-dir override, test seams |
| `apps/desktop/src` | Shell state and conversation React composition |
| `apps/desktop/tests` | Playwright smoke/security/shutdown/chat/host-ui/permission/settings/credentials specs, packaged artifact lane, unit tests, fail-closed trash helper |

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
| `bun test` | Run non-GUI unit and integration tests. |
| `bun run test:desktop` | Build the Electron test target and run smoke, security, shutdown, chat, host-UI, permission, settings, and credentials specs. |
| `bun run package:mac` | Stage baked features and notices, flatten production `node_modules`, and create an unsigned local macOS `.app` under `apps/desktop/release`. |
| `bun run test:packaged` | Smoke the packaged `.app` with isolated user data, baked-feature loading, and a PATH that does not contain `pi`. |

Package-local scripts exist for focused work, but documentation and CI should call the root commands for milestone acceptance.

`bun run package:linux` remains later until a real Linux artifact is in scope. Signing and notarization remain deferred.

## First setup

```bash
bun install --frozen-lockfile
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
- desktop tests isolate `userData`, so a separate agent-directory override is needed only when a test intentionally exercises shared-scope disclosure.

### Isolation and test environment variables

| Variable | Role |
| --- | --- |
| `PHO_CODE_USER_DATA_DIR` | Electron `userData`; its default Pi root is `<userData>/pi-agent` |
| `PHO_CODE_AGENT_DIR` | Explicit external/shared Pi data root; also sets `PI_CODING_AGENT_DIR` |
| `PHO_CODE_TEST_MODE=background` | Headless Electron test launch |
| `PHO_CODE_TEST_WORKSPACE` | Inject a directory as if it was chosen with the native picker (test-only) |
| `PHO_CODE_TEST_MODEL=1` | Register the deterministic faux model and `harness_mark` tool |
| `PHO_CODE_TEST_FEATURES=1` | Load the default baked-feature manifest in tests (permission package, recoverable Trash, and pho-web; FFF tools only if the caller passes a retrieval runtime); otherwise tests use an empty manifest |
| `PHO_CODE_RESOURCES_DIR` | Override the staged resource root in source development/tests; packaged production ignores it and uses Electron `process.resourcesPath` |
| `PHO_CODE_SHUTDOWN_PROBE` | Write a JSON dispose probe on quit |

Desktop tests must set `PHO_CODE_USER_DATA_DIR` through the shared launcher. With no agent override, Pi state stays inside that isolated directory. Tests that set `PHO_CODE_AGENT_DIR` must provide a separate owned temporary directory.

## Current verification status

Implementing agents recorded this Milestone 3 baseline on 2026-08-13:

```text
bun run typecheck     PASS
bun run lint          PASS
bun test              59/59 PASS
bun run test:desktop  PASS — 6 Electron tests (smoke, security, shutdown, chat, host-ui, permission)
bun run build         PASS — main, preload, and renderer bundles
```

Milestone 4 implementation evidence, recorded 2026-08-13 and accepted after focused review:

```text
bun run typecheck     PASS
bun run lint          PASS
bun test              91/91 PASS
bun run test:desktop  PASS — 7 Electron tests (smoke, security, shutdown, chat, host-ui, permission, settings)
bun run build         PASS — main, preload, and renderer bundles
```

Verification classes for this change:

- **unit verified:** protocol JSON safety including second-run supersession, command-result envelopes, select dialog settlement, and settings snapshots; application metadata/appearance/shutdown; package boundaries including the pinned permission package; sanitized markdown (KaTeX/Shiki/Mermaid); dialog focus loop; Guarded/Balanced preset mapping, Custom preservation, invalid-config refusal, and atomic permission writes
- **integration verified:** isolated-directory Pi session create, stream, tool, second prompt, abort, dispose, reopen, process-lifetime trust, baked-feature isolation, select/input dialog/rebind, real permission-package select, dispose during a pending dialog, feature-health false-positive rejection
- **desktop verified:** Electron chat with the deterministic test model including a second consecutive prompt, JSONL reopen, and immediate session-list appearance; test-host select dialog; baked permission-system select dialog; Settings palette/mode/glass and font-size persistence across relaunch and Guarded profile applied to the next gated tool call
- **owner verified:** real `deepseek/deepseek-v4-flash` multi-turn chat with thinking and failed/completed tool projection (Milestone 1/2)
- **not verified (Milestone 4):** packaged installer; Linux desktop; real-provider permission allow/deny

The Milestone 4 acceptance review reran 12 focused permission-settings/resource/application checks, `bun run typecheck`, `bun run lint`, and `bun run build`; all passed. It intentionally relied on the implementing pass's recorded full unit and Electron results rather than duplicating them.

Milestone 5 implementation evidence, accepted on 2026-08-13:

```text
bun run typecheck     PASS
bun run lint          PASS
bun test              100/100 PASS
bun run test:desktop  PASS — 8 Electron tests (smoke, security, shutdown, chat, host-ui, permission, settings, credentials)
bun run package:mac   PASS — unsigned Pho Code.app at apps/desktop/release/mac-arm64
bun run test:packaged PASS — 1 packaged Electron test (permission feature, no Pi CLI)
bun run build         PASS — main, preload, and renderer bundles
```

Milestone 5 verification classes:

- **unit verified:** packaged `ResourceLocator` fail-closed lookup; API-key import persists without returning secrets; empty-key rejection; permission-feature staging plus nested wasm/zod; bun-isolated production-package collection
- **desktop verified:** Settings API-key import does not expose the secret on the bridge (credentials spec, with the existing seven Electron journeys)
- **packaged verified:** unsigned local `.app` launches outside the repo with isolated user data, loads `permission-system 24.0.0` from `Contents/Resources/features`, ships `THIRD_PARTY_NOTICES.txt`, and completes a gated `USE_TOOL` dialog with a PATH that does not contain `pi`
- **not verified:** signing/notarization; Linux artifact; real-provider chat inside the packaged app; Gatekeeper-friendly public installer UX

`docs/third-party-notices.md` is regenerated by `bun run package:mac` alongside the artifact copy. The staged electron-builder project uses package name `pho-code-app` so bun workspace detection cannot overwrite the repository root `package.json`.

The acceptance review additionally reran typecheck, lint, eight focused packaging/resource/credential checks, and the packaged smoke. It made `PHO_CODE_RESOURCES_DIR` development-only and added runtime rejection of a mismatched packaged permission-feature version.

Keep TypeScript and `typescript-eslint` inside their declared peer-version ranges.

v2 Milestone 0 implementation evidence, recorded 2026-08-13, pending owner acceptance review:

```text
bun run typecheck     PASS
bun run lint          PASS
bun test              152/152 PASS
bun run test:desktop  PASS — 9 Electron tests (smoke, security, shutdown, chat, host-ui, permission, settings, credentials, developer)
bun run package:mac   PASS — unsigned Pho Code.app at apps/desktop/release/mac-arm64
bun run test:packaged PASS — 1 packaged Electron test (permission + recoverable Trash, Developer Trash journey, no Pi CLI)
bun run build         PASS — main, preload, and renderer bundles
```

Milestone 0 verification classes:

- **unit verified:** stable permission-key mapping and detection; pre-v3 Guarded/Balanced recognition; Custom/invalid preservation; permission-system 24.0.0 command-family characterization; Trash target validation; OS Trash adapter fail-closed behavior; host-dialog title/body split
- **integration verified:** the internal `developer` policy allows `git status`, denies `rm`, asks wrappers, and moves an owned fixture through `/usr/bin/trash`; default manifest loads permission-system and recoverable-trash; idle-only permission updates
- **desktop verified:** the third owner-facing mode persists across relaunch; `USE_SAFE_SHELL` completes without a dialog; `USE_DANGEROUS_SHELL` remains blocked; `USE_TRASH` removes the owned fixture; existing strict/chat/permission journeys still pass
- **packaged verified:** unsigned local `.app` loads `permission-system 24.0.0` and `recoverable-trash 1.0.0` from app-owned resources, completes recoverable Trash with isolated data and a PATH that does not contain `pi`
- **not verified:** Linux desktop and real Linux Trash; owner-monitored real-provider daily-driver proof; treating the permission layer as a sandbox

v2 Milestone 1 Slice 1 implementation evidence, recorded 2026-08-13, pending owner harness testing:

```text
bun run typecheck     PASS
bun run lint          PASS
bun test packages/protocol/test/protocol.test.ts
         packages/runtime/test/workspace-reference.test.ts
         packages/runtime/test/local-retrieval.test.ts
         packages/ui/test/at-mention.test.ts
                      21/21 PASS (local-retrieval needs native FFI; sandbox-blocked runs fail)
```

Slice 1 verification classes:

- **unit verified:** workspace-relative `@` tokens reject absolute/parent/sensitive paths and serialize without absolute paths; composer mention parsing; protocol JSON-safety for reference tokens
- **integration verified:** `FileFinder` indexes an owned temp workspace and returns relative path suggestions
- **desktop verified:** not run; owner should exercise `bun run dev`
- **packaged verified:** not run; native `dlopen` from asar remains a later packaging check
- **not verified:** owner-monitored inline `@path` mentions and `fffind`/`ffgrep` against a real workspace; FFF benchmark gate; Linux index behavior

v2 Milestone 1 Slice 2 implementation evidence, recorded 2026-08-13, pending owner harness testing:

```text
bun run typecheck     PASS
bun run lint          PASS
bun test packages/protocol/test/protocol.test.ts
         packages/runtime/test/web-url.test.ts
         packages/runtime/test/permission-settings.test.ts
                      29/29 PASS
```

Slice 2 verification classes:

- **unit verified:** SSRF rejects file/credentials/localhost/private/link-local/metadata addresses; redirects onto private IPs are denied; DuckDuckGo HTML parse skips ads and decodes `uddg` URLs; protocol JSON-safety for source records; Developer maps `web_search=ask` and `fetch_content=allow`
- **integration verified:** not run against live DuckDuckGo or arbitrary internet hosts
- **desktop verified:** not run; owner should exercise `bun run dev`
- **packaged verified:** not run
- **not verified:** owner-monitored `web_search` / `fetch_content` on a real workspace; Linux DNS/SSRF; adversarial DNS rebinding during the connect window


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
4. Is the Pi SDK imported only from main/runtime code?
5. Is the preload path absolute and present in the built output?
6. Are `contextIsolation`, `sandbox`, and `nodeIntegration` configured correctly?
7. Is the renderer loading the expected local dev URL or packaged file?
8. Are the agent directory, application data directory, and workspace absolute and accessible?
9. Did resource loading produce diagnostics?
10. Did a native dependency require an Electron ABI rebuild?

Log paths and versions, but do not log API keys, auth files, MCP tokens, complete environment dumps, or sensitive tool payloads.

## Debugging a missing model

Verify:

- the runtime uses Pi's model runtime rather than a handwritten catalog;
- expected Pi credentials exist through a supported auth source;
- custom model configuration is valid for the pinned SDK;
- cached catalogs are available when startup network refresh is disabled;
- model/provider errors are reported through a redacted diagnostic;
- session-restored models fall back visibly when no longer available.

Settings includes a compact Provider API keys import that calls Pi `ModelRuntime.login` with a one-shot secret prompt. The renderer never receives stored credential values; list results include provider names only. Do not read and expose raw `auth.json` contents to the renderer. The explicit `PHO_CODE_AGENT_DIR` override remains available for development interoperability.

## Debugging sessions and streaming

- Subscribe before prompting so early events are not missed.
- Correlate UI runs with application run IDs.
- Reject or ignore stale sequence/run events.
- Treat deltas as display updates and final messages as authority.
- Distinguish prompt rejection from failure after admission.
- Confirm abort settles the UI and allows a later prompt.
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

### Milestone 2 representative lane

Covered historically by `packages/runtime/test/pi-runtime.test.ts`. The Resources catalog, reload command, and extension-command launcher were removed in Milestone 3. The retained value is the loader/host-UI seam and session-replacement rebind.

### Milestone 3 focused lane

Covered by `packages/runtime/test/pi-runtime.test.ts` and `apps/desktop/tests/{chat,host-ui}.spec.ts`:

1. `DefaultResourceLoader` disables ordinary extension/skill/prompt/theme discovery and loads only the source-controlled manifest;
2. project `.pi/extensions` and skills are ignored while `AGENTS.md` remains present;
3. select/input host requests use the shared dialog lifecycle and rebind after session replacement;
4. unsupported host UI throws a useful `Error` instead of a stringified object;
5. a newly created active session appears immediately in the sidebar;
6. Electron `USE_TOOL` with `PHO_CODE_TEST_HOST_UI=1` completes a select dialog;
7. conservative Markdown/code rendering covers assistant and streaming text.

Deterministic tests default to an empty manifest so they do not load the permission package. `PHO_CODE_TEST_FEATURES=1` or `createDefaultFeatureManifest()` loads the pinned permission feature, the application-owned Trash tool, and pho-web. Personal `bun run dev` uses the production fallback manifest (permission, Trash, FFF local retrieval, and pho-web).

Keep these checks focused. Do not add a visual-regression framework or reproduce the complete third-party permission extension suite.

### Milestone 4 focused lane

Covered by `packages/runtime/test/permission-settings.test.ts`, `packages/application/test/settings.test.ts`, and `apps/desktop/tests/settings.spec.ts`:

1. Guarded/Balanced map to the reviewed policies; string catch-alls match a `*` map; Custom is preserved on unrelated YOLO changes;
2. invalid/unrecognized existing permission config is refused; managed writes are atomic and keep unowned fields;
3. application appearance (palette, mode, glass, UI font size, chat font size) persists independently of permission settings and migrates v1–v3 `theme` into Default palette + mode with glass defaults;
4. one Electron journey persists palette/mode/glass across relaunch, applies Guarded, and completes the next gated `USE_TOOL` call;
5. typecheck, lint, unit/integration tests, and build pass.

Do not build a generic schema-form test matrix or copy the third-party package's policy test suite.

### Milestone 5 focused lane

Covered by `packages/runtime/test/{resource-locator,credentials}.test.ts`, `scripts/stage-app-resources.test.ts`, `apps/desktop/tests/credentials.spec.ts`, and `apps/desktop/tests/packaged.spec.ts`:

1. packaged `ResourceLocator` resolves `features/<package>` and never falls back to `node_modules` or global Pi;
2. missing permission package fails closed with a named diagnostic instead of loading ambient packages;
3. API-key import persists through Pi `ModelRuntime.login` into isolated `auth.json` and never returns the secret;
4. Electron Settings imports a dummy key without exposing it on the bridge;
5. `bun run package:mac` stages the pinned permission feature, nested runtime dependencies, and `THIRD_PARTY_NOTICES.txt`;
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

### Optional real-provider recipe

Not a CI requirement. Personal runs can import a provider API key in Settings. A development run may still explicitly reuse the owner's Pi operational data:

```bash
PHO_CODE_AGENT_DIR="$HOME/.pi/agent" bun run dev
```

This opt-in affects auth, models, sessions, permission config, and logs. It does not load the owner's Pi extensions, skills, prompts, packages, or MCP configuration, and Settings labels the directory as shared. A normal `bun run dev` uses Pho Code's private data root; import a provider API key in Settings if no models are authenticated.

1. Choose a local workspace with the native directory picker.
2. Import a provider API key in Settings if needed, then create a session.
3. Send a short prompt.
4. Confirm streaming text, any tool activity, Stop, and quit/reopen.

If no authenticated model is available, the UI should say so and point at Settings import. Never point an automated test at the user's real Pi directory.

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
