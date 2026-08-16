# Implementation plan

## How to use this plan

Implement in order. Each milestone produces a reviewable outcome with explicit exit checks. Later milestones may refine interfaces, but they must not bypass an earlier unproven boundary.

This plan is now the closed implementation record for personal v1. Work after Milestone 5 belongs to the active [next-version roadmap](../../version/roadmap-vnext.md).

## Global acceptance rules

Every milestone must:

- preserve the dependency direction in the architecture;
- use exact pinned Pi and Electron versions when those dependencies are present; Milestone 0 records the intended compatibility pair before Pi is added;
- keep both reference submodules read-only;
- add the smallest tests that protect behavior or a risky boundary; avoid duplicating implementation details in tests;
- update commands and docs when behavior changes;
- run the listed exit checks before being marked complete;
- record copied or adapted code in the attribution log;
- state any checks not run.
- preserve standalone ownership: application capabilities may not depend on packages/resources installed in a separate user Pi environment.

## Milestone 0: workspace bootstrap

### Status

Accepted after the 2026-08-13 hardening pass. See the [Milestone 0 code review](./reviews/milestone-0-code-review.md).

Present in the repository:

- exact Bun workspace and lockfile;
- `protocol`, `application`, `runtime`, and `ui` packages;
- Electron Vite main/preload/renderer build;
- fixed bootstrap IPC method and reserved event subscription seam;
- renderer sandbox, context isolation, disabled Node integration, CSP, navigation/new-window guards, and permission-request denial;
- focused unit coverage for protocol JSON safety, application shutdown, renderer trust, package boundaries, and fail-closed temp-path ownership;
- three Playwright Electron tests covering bootstrap isolation, production CSP/navigation/permissions, and single runtime disposal;
- exact Electron `43.4.0` pin and intended Pi `0.84.1` compatibility record.

Acceptance is complete. The review's unsafe test cleanup, URL-prefix trust, missing runtime-disposal, boundary-lint, JSON-safety, smoke-coverage, and toolchain peer-version findings are resolved.

### Outcome

The repository becomes a coherent bun TypeScript workspace with an Electron window and enforceable package boundaries. It does not yet run Pi.

### Work

- Add root `package.json`, exact `packageManager` (`bun@1.3.14`), and bun workspaces.
- Create `apps/desktop` and the minimal `protocol`, `application`, `runtime`, and `ui` packages, merging packages only if bootstrap evidence shows the split is premature.
- Configure TypeScript project references or equivalent build ordering.
- Configure formatting/linting without broad mechanical rewrites of references.
- Add Vite React renderer and Electron main/preload builds.
- Create a local application window with context isolation, sandbox, and no Node integration.
- Add restrictive renderer CSP and block arbitrary navigation/new windows.
- Define protocol version `1` and a minimal `getBootstrapState` command.
- Add unit tests for protocol serialization and an Electron test that verifies the bridge and security preferences.
- Pin Electron after verifying its embedded Node satisfies the intended Pi version.

The list above is implemented. Remaining product work is Milestone 1.

### Exit checks

```bash
bun run typecheck
bun run lint
bun test
bun run test:desktop
bun run build
```

Manual proof: `bun run dev` opens the local renderer, displays a bootstrap state obtained through the typed bridge, and exposes no raw Node/Electron API.

Current evidence: typecheck, lint, unit tests, `test:desktop`, and build passed on 2026-08-13 after the hardening pass. The user-provided macOS screenshot remains evidence that `bun run dev` rendered the bootstrap window.

Recorded compatibility pair for later Pi integration:

| Dependency | Version | Role |
| --- | --- | --- |
| bun | 1.3.14 | package manager and unit-test runner |
| Electron | 43.4.0 | desktop shell; verify embedded Node in `test:desktop` |
| `@earendil-works/pi-coding-agent` | 0.84.1 | installed exactly; `engines.node` is `>=22.19.0` |

### Not included

Pi sessions, model calls, resources, MCP, terminal, packaging, or visual polish.

### Closure gate

Milestone 0 is accepted. Do not reopen these controls as optional when starting Milestone 1.

## Milestone 1: gold-standard Pi vertical slice

### Status

Accepted on 2026-08-13 against pinned `@earendil-works/pi-coding-agent` `0.84.1`. M1-001 is closed in source by the run-supersession reducer and second-prompt coverage. M1-006 is owner-validated by a real `deepseek/deepseek-v4-flash` multi-turn screenshot and explicit usability report; the deterministic Electron lane remains the reopen evidence. See the [Milestone 1 review](./reviews/milestone-1-code-review.md) and [Milestone 2 review](./reviews/milestone-2-code-review.md).

### Outcome

One workspace, one persistent Pi session, one prompt, streaming text, one visible tool lifecycle, abort, and reopen work end to end.

This is the representative unit. Review its architecture, state model, event behavior, error handling, and UX before expanding the feature set.

Prerequisite: Milestone 0 is accepted. Keep renderer-origin checks exact and keep runtime disposal in the composition root.

### Design rule

Build one direct path from workspace selection to a persistent Pi conversation. Prefer a small concrete service over a generic framework, and extend the protocol only for behavior the first slice actually uses. Tests should cover the session lifecycle and desktop boundary once; do not multiply equivalent mocks or exhaustively test library behavior.

### Work

- Before replacing the stub, make the bounded quit path treat a rejected `dispose()` as a logged failure and still reach `app.quit()`; keep this a small lifecycle fix.
- Replace the temp-path unit test's direct symlink `unlink` with the repository's recoverable cleanup path or retain the fixture. This is policy cleanup, not a new test subsystem.
- Pin `@earendil-works/pi-coding-agent` exactly and record compatibility.
- Implement `HarnessRuntime` in the runtime package without Electron imports.
- Create shared Pi model/runtime services and a cwd-bound session runtime.
- Implement native workspace selection and recent-workspace metadata.
- Use Pi's normal agent directory for personal runs and keep Electron `userData` limited to harness metadata; inject both paths in tests.
- Treat native-picker selection as process-lifetime project-resource approval through Pi's public trust mechanism, without persisting a new decision; do not activate protected resources merely from recent-workspace metadata.
- Implement session create/open/list for one selected workspace.
- Normalize Pi messages and lifecycle/tool events into protocol records.
- Subscribe before prompt submission and correlate events with run/sequence IDs.
- Implement prompt admission, completion/failure, abort, and bounded disposal.
- Render the transcript, composer, streaming text, thinking status, tool card, stop control, and clear errors.
- Use Pi JSONL as transcript authority; store only recent-workspace and selection metadata separately.
- Inject a deterministic test model/tool path so desktop tests do not require network credentials.
- Add a manual real-provider verification recipe without making it a default CI test.

The list above is implemented and accepted. Preserve the reducer's authoritative-run supersession rule and the direct Pi JSONL reopen path.

### Exit checks

All Milestone 0 checks, plus runtime integration tests proving:

- persistent session creation in an isolated directory;
- exact event order invariants used by the UI;
- prompt failure before and after admission are distinct;
- abort settles and permits another prompt;
- dispose ends subscriptions/resources;
- reopening reconstructs the same visible transcript.

Manual Electron proof against a configured Pi provider is required before calling the slice usable.

### Calibration checkpoint

Review with the owner:

- transcript density and tool presentation;
- streaming smoothness;
- error clarity;
- model selection expectations;
- whether initial credential setup may continue through Pi CLI;
- whether the package boundaries feel proportionate.

Do not bulk-build settings and integrations until this checkpoint is accepted.

## Milestone 2: resource discovery and host UI

### Status

Accepted on 2026-08-13 as an integration proof. The shell, Pi loader seam, structured command results, confirm/notification host path, diagnostics, and session replacement/rebind are in source. The owner then corrected the product direction: Resources is not a store or customization surface. Milestone 3 retains the internal seams while replacing discovery/catalog behavior with a fixed source-controlled feature set. See the [Milestone 2 code and UX review](./reviews/milestone-2-code-review.md).

### Outcome

The harness proves it can compose Pi resources internally, bind extension host UI, report failures, and survive session replacement without committing the product to a customizable resource manager.

### Design rule

Establish the viewport-owning shell before adding another screen. Use one small navigation model that keeps workspace identity, recent sessions, conversation, and Resources reachable. Keep the transcript and composer visually primary, place diagnostics beside the feature they explain, and remove milestone/runtime debug vocabulary from the permanent product chrome. This is a focused information-architecture and visual-foundation pass, not a general design-system project.

### Work

- Construct `DefaultResourceLoader`/settings services according to the pinned SDK.
- Project skills and extensions with source, scope, commands/tools, enabled state when available, and diagnostics.
- Add a compact application shell with workspace/session navigation and a temporary Resources diagnostic destination; do not add a general router.
- Make the shell own the viewport, keep conversation/resource scrolling internal, anchor the composer, and move protocol/Node/SDK strings out of the permanent footer into contextual diagnostics.
- Add a compact read-only Resources proof; no enable/disable controls, marketplace, or remote installation. This proof is removed from the product surface when the curated feature manifest replaces discovery in Milestone 3.
- Implement explicit resource/session reload.
- Bind extensions with the pinned SDK's public `ExtensionUIContext`, RPC-compatible host mode, and command-context actions; rebind replacement sessions before accepting host-UI-dependent work.
- Implement one representative basic extension dialog first. Expand to select, confirm, input, editor, notification, status, and simple text widgets only after that path is reviewed against the pinned SDK.
- Emit typed compatibility diagnostics for terminal-only custom UI.
- Test session replacement/rebind behavior where applicable.
- Display the personal-v1 trust notice.
- Add empty built-in resource injection points without adding unspecified resources.
- Preserve structured expected command errors across Electron IPC with a JSON-safe result or preload reconstruction; do not expose stacks or arbitrary error objects.
- If a Beautiful UI component is copied or materially adapted, take only the useful unit, convert it to repository tokens/protocol props, and update the attribution log in the same change.

### Exit checks

- One isolated fixture exercises a representative skill, extension, diagnostic, reload, and project-trust state without duplicating Pi's own loader test matrix.
- One focused runtime check covers session replacement/rebind.
- One Electron path covers navigation to Resources, reload, one visible diagnostic, and one extension dialog.
- Normal Pi can open the resulting session after the harness closes.
- All standard root checks pass.

## Milestone 3: core harness reliability

### Status

Accepted on 2026-08-13. The source-controlled feature manifest, pinned permission feature, select/input host UI, ambient-resource isolation, immediate session-list state, and removal of the Resources surface are implemented. Conversation chrome progressed in the separate [Conversation UI track](../../ui/implementation/conversation-ui.md). See the [Milestone 3 review](./reviews/milestone-3-code-review.md) for evidence and bounded carryovers.

Recorded exit checks: `bun run typecheck`, `bun run lint`, `bun test` (59/59), `bun run test:desktop` (6 Electron specs), and `bun run build` passed.

### Outcome

The vertical slice becomes a reliable personal Pi host without expanding into production infrastructure or a second product surface.

### Prioritized work

- Add a source-controlled `HarnessFeatureManifest` and configure Pi with ordinary extension/skill/prompt discovery disabled; supply only explicit baked factories and paths. Keep workspace context files such as `AGENTS.md` enabled.
- Pin and bundle `@gotgenes/pi-permission-system` `24.0.0` as the first harness feature. Resolve it from application resources/dependencies rather than the owner's global Pi package settings.
- Implement its RPC-compatible permission `select` and optional `input` requests using the existing dialog lifecycle. Keep its terminal-only `ctx.ui.custom` configuration modal and arbitrary custom UI unsupported.
- Throw useful `Error` instances for unsupported in-process host UI while recording structured compatibility diagnostics separately; never surface `[object Object]`.
- Remove the normal Resources catalog, reload controls, and extension-command launcher. A collapsed About/Diagnostics surface may show baked feature versions and failures but offers no install/enable/configure behavior.
- Correct sidebar session-state precedence so a new/active session appears immediately without relaunch or workspace reopening.
- Trap and restore focus for confirm/select/input dialogs; make transient notifications dismissible.
- Keep shutdown/relaunch behavior robust and add a secret-filtered diagnostics copy action only if it helps daily debugging.

Conversation readability, T3-polished chrome, multi-project sidebar, model/thinking selectors, motion, KaTeX, Shiki, and Mermaid are tracked in the active [conversation UI plan](../../ui/implementation/conversation-ui.md). Defer image attachments, steering/follow-up queues, virtualization, broad shortcuts, and arbitrary extension renderers until daily use demonstrates the need.

### Exit checks

- The nine root v1 criteria pass.
- The additional product success criteria in `product-v1.md` pass for harness reliability (not full conversation chrome).
- Real Electron verification covers new, run, abort, quit, relaunch, and resume.
- A newly created active session appears in the sidebar immediately.
- The owner's permission extension can approve and deny a safe tool call through select/input host UI without `[object Object]` or a stuck request.
- Confirm/select/input dialogs trap focus, support Escape, restore focus, and settle during session replacement/quit.
- Only features named in the source-controlled manifest load; unspecified user/project Pi extensions, skills, prompts, and packages do not.
- The normal product UI has no resource store/catalog or install/enable/reload controls.
- No runtime dependency on `refs/pi-gui`, `refs/pi-web`, or `refs/t3code` exists.
- Accessibility checks cover keyboard-only core harness flow and visible focus.
- Attribution and licenses are current.

This milestone is the personal v1 harness reliability boundary. Conversation UI polish may ship in parallel under its own plan.

## Milestone 4: typed settings for baked features

### Status

Accepted on 2026-08-13 after a focused review and one pinned-schema validation correction. See the [Milestone 4 code review](./reviews/milestone-4-code-review.md).

### Intended work

- Add explicit `getSettings`, `updateAppearanceSettings`, and `updatePermissionSettings` commands/events; do not add a generic key/value settings protocol.
- Persist system/light/dark appearance in versioned application metadata.
- Add a package-version-specific permission settings adapter for `<agentDir>/extensions/pi-permission-system/config.json`.
- Expose Guarded and Balanced versioned policy presets; represent any non-matching existing policy as Custom and preserve it until the user explicitly chooses a managed preset.
- Expose `permissionReviewLog` and a separate YOLO control. Require a warning/second confirmation and persistent visible indicator when YOLO is active.
- Disclose that the global permission config is shared with other Pi processes using the same agent directory.
- Detect and disclose a project permission-config override without editing it in this milestone.
- Validate, preserve unowned valid config fields, and atomically write; refuse to overwrite invalid/unrecognized config.
- Apply permission changes only while idle, then internally reload/rebind the active session and publish fresh state.
- Correct feature-health false positives, retain/validate pending dialog options, and project the permission status needed to make active configuration honest.
- Add one compact Settings surface. Keep the conversation primary and avoid a generic schema/form engine.

The exact contract, storage decision, profiles, and acceptance evidence are defined in the [Milestone 3 review](./reviews/milestone-3-code-review.md).

### Exit checks

- Appearance persists across relaunch.
- Guarded/Balanced generate their reviewed policies; Custom is preserved on unrelated updates.
- Shared-agent-directory and project-override disclosures are visible and accurate.
- YOLO enablement is explicit and remains visibly indicated.
- Save and Apply is blocked during a run and reloads/rebinds cleanly while idle.
- Feature composition remains unchanged and no package/resource/MCP controls appear.
- Focused config/preset checks and one Electron settings-to-permission journey pass; typecheck, lint, and build pass.

## Milestone 5: standalone harness bundle

### Trigger

Active after Milestone 4 acceptance. This milestone proves the standalone ownership model before more feature dependencies are added.

### Status

Accepted on 2026-08-13. Identity/data-root, packaged `ResourceLocator`, permission-feature staging, in-app API-key import, third-party notices, `bun run package:mac`, and packaged smoke verification are present. The review also closed the packaged resource-override seam and added pinned feature-version validation. See the [Milestone 5 code review](./reviews/milestone-5-code-review.md).

### Outcome

Produce a local macOS application artifact that embeds the pinned Pi runtime and the complete current baked-feature bundle. It must start and expose the permission feature on a clean profile with no Pi CLI and no user-global Pi packages installed. This is a functional standalone bundle proof, not public distribution hardening.

### Intended work

- Preserve the confirmed identity convention: display name `Pho Code`, technical slug `pho-code`, package scope `@pho-code/*`, environment prefix `PHO_CODE_*`, IPC namespace `pho-code:v1:*`, and bundle identifier `dev.vietfood.phocode`. Keep generic architectural type names such as `HarnessRuntime`. `phocode.com` is already an archived Vietnamese programming blog, so repeat naming clearance if public distribution later becomes a goal.
- Preserve the app-owned default Pi root at `userData/pi-agent`. `PHO_CODE_AGENT_DIR` is an explicit external/shared override, not ambient configuration. Pre-release Pi Harness/Pi data is not migrated automatically.
- Add a production `ResourceLocator` rooted at `process.resourcesPath`; retain the dependency-graph locator only for source development/tests.
- Stage `@gotgenes/pi-permission-system` `24.0.0`, its declared Pi extension source, schemas/assets, runtime dependencies, and license in app-owned resources.
- Package the pinned Pi SDK/runtime and every application package needed by Electron main/preload/renderer.
- Keep mutable auth, models, sessions, permission config/logs, and application metadata outside ASAR; keep immutable feature code/assets inside app-controlled resources, unpacking native/executable-sensitive files where Electron requires it.
- Add a `bun run package:mac` command that creates an unsigned local artifact. Preserve Linux-compatible resource/path code without claiming or requiring a Linux package in this milestone.
- Provide one credential path that does not require Pi CLI installation: in-app authentication/API-key entry through supported Pi mechanisms, or an explicit app-owned credential import flow. Stored secrets remain privileged and owner-only; the renderer never receives saved credential values.
- Generate/ship third-party notices for Pi and the permission feature.
- Smoke the packaged artifact with isolated application/agent directories and a PATH that does not contain `pi`; prove the baked permission feature loads without user Pi settings/packages.

### Exit checks

- Product name, technical namespaces, bundle identifier, mutable-data locations, and pre-release reset behavior remain documented and internally consistent.
- A local macOS artifact launches from outside the repository and does not resolve feature code from the development workspace.
- Deterministic chat and the permission dialog work with empty isolated user data and no Pi CLI/user-global Pi packages.
- A documented real-provider setup path works without installing Pi CLI.
- The artifact contains the pinned feature version, required assets/dependencies, and license notices.
- Sessions/settings survive artifact relaunch in the documented mutable data locations; compatible Pi data may be reused, but no feature code is sourced from it.
- Missing/corrupt packaged resources fail with named feature diagnostics rather than falling back to global Pi packages.
- Signing, notarization, auto-update, production sandboxing, public installer UX, and Linux artifact verification remain explicitly deferred.

Implementing-pass and acceptance evidence is recorded in the active [`development.md`](../../development.md) and the [Milestone 5 review](./reviews/milestone-5-code-review.md).

## v1 closure

Milestones 0 through 5 are accepted. Pho Code v1 is a usable personal macOS harness with persistent Pi chat, immutable baked feature composition, permission dialogs and settings, in-app API-key import, and a self-contained unsigned application bundle.

There is no Milestone 6 in the v1 plan. Session lifecycle work, selected MCP-backed capabilities, additional baked features, distribution hardening, and optional product expansions moved to the active [next-version roadmap](../../version/roadmap-vnext.md).

## Risks and controls

### SDK/docs version skew

Control: exact pin, compile against installed typings, focused compatibility adapter, upgrade-only changes.

### Missed or stale streaming events

Control: subscribe before prompt, sequence and run IDs, final snapshot reconciliation, tests for abort/retry/late events.

### Main-process crashes

Control in v1: small runtime surface, lifecycle cleanup, error normalization. Future control: move `HarnessRuntime` behind the same protocol into `utilityProcess`.

### Renderer privilege leakage

Control: sandbox, context isolation, disabled Node integration, fixed preload methods, sender/payload validation, CSP, local content.

### Reference code becoming an accidental fork

Control: new product paths, no imports from `refs`, attribution log, repository-owned tests and APIs.

### Styling churn

Control: establish tokens and representative conversation components first; adapt selected Beautiful UI patterns rather than adopting multiple design systems wholesale.

### macOS-only assumptions blocking Linux

Control: shell-neutral runtime, path/process interfaces, Linux CI for pure packages, explicit platform capability flags, no unsupported Linux claim.
