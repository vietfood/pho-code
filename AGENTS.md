# Agent instructions

These instructions apply to the entire repository. Nested `AGENTS.md` files may add path-specific rules but may not weaken the architecture, verification, deletion, or attribution requirements here.

## Mission and current maturity

Build a personal, macOS-first and Linux-compatible desktop harness on the Pi SDK. Personal v1 is accepted and archived. v2 Milestones 0 through 3 are accepted. Remaining v2 work aims to make the harness a fast daily driver with curated capabilities; it is not yet a publicly distributed or adversarially hardened product.

Milestones 0 through 5 of personal v1 are accepted on Pi SDK `0.84.1`. Their product, implementation, and review records live under `docs/archive/v1`. Read the archived Milestone 4 and 5 reviews before changing settings, identity, data-root, packaging, or credential import. Conversation chrome remains tracked in `docs/plans/conversation-ui.md`. Do not turn v2 into signing/notarization, a generic settings engine, package/resource manager, MCP manager, or production-hardening project without an explicit scope change.

Read these files before nontrivial implementation:

1. `docs/current-state.md`
2. `docs/product-v2.md`
3. `docs/architecture/overview.md`
4. `docs/architecture/desktop-shell.md`
5. `docs/extension-model.md`
6. `docs/implementation-plan-v2.md`
7. `docs/plans/conversation-ui.md` when changing conversation chrome
8. `docs/development.md`
9. `docs/archive/v1/reviews/milestone-5-code-review.md` when changing packaged resources, credentials, identity, or data ownership
10. `docs/archive/v1/reviews/milestone-4-code-review.md` when changing settings or permission configuration
11. the earlier record under `docs/archive/v1` only when changing a boundary it established

## Product constraints

- The product is built from scratch. `refs/pi-gui`, `refs/pi-web`, and `refs/t3code` are read-only references unless a task explicitly updates their gitlink revisions.
- Electron is the accepted shell. Do not introduce Tauri or Rust without an explicit architecture-decision change.
- macOS is the first verification surface. Preserve Linux-compatible path, process, and UI behavior. Do not add Windows-specific work unless scope changes.
- Use the Pi SDK directly. Do not fork or reproduce Pi's agent loop, model runtime, session tree, resource discovery, or JSONL persistence.
- Do not make deferred production work a blocker for personal v2. Sandbox/container execution, plugin auditing, signing, notarization, auto-update, marketplaces, and broad MCP management remain deferred.
- Do not silently add features. Extensions, skills, prompts, and MCP integrations enter the product only as source-controlled manifest entries explicitly specified by the owner.
- Settings may change only typed, documented behavior of features already present in that manifest. Do not expose generic key/value configuration, executable paths, arbitrary JSON schemas, package controls, or server definitions.
- Treat the harness as standalone. Production feature loading must use app-owned packaged resources; never require the user to install a package/skill/MCP adapter into another Pi installation. Pi-compatible auth, model, session, and operational data may be reused, but user Pi feature composition is never a runtime dependency.

## Dependency boundaries

The intended dependency direction is:

```text
renderer -> protocol <- shell adapter -> application -> runtime -> Pi SDK
```

Enforce the following:

- Renderer code imports React, UI packages, and the shared protocol only.
- Renderer code never imports `electron`, `node:*`, Pi SDK packages, MCP SDKs, or PTY libraries.
- Preload exposes one method per approved command or a comparably narrow typed facade. Never expose raw `ipcRenderer`, generic channel names, filesystem handles, or process execution.
- Protocol values are JSON-safe data. No class instances, functions, symbols, custom prototypes, Electron objects, Node streams, or Pi runtime objects cross the boundary.
- Application code coordinates use cases and projects runtime events into UI state. It does not know Electron APIs.
- Runtime code owns `ModelRuntime`, `SettingsManager`, `DefaultResourceLoader`, `AgentSessionRuntime`, session subscriptions, and future MCP adapters. It must not import Electron or React.
- Filesystem, process launch, environment, and packaged-resource discovery go through explicit interfaces so the runtime can move to an Electron utility process or Tauri sidecar later.

If a feature appears to require breaking a boundary, first propose a narrow contract change and explain why the existing contract is insufficient.

## Pi integration rules

- Pin `@earendil-works/pi-coding-agent` to an exact verified version. Do not use `latest`, a caret, or an unreviewed transitive upgrade in release code.
- Confirm the chosen Electron version embeds a Node version satisfying Pi's `engines.node` requirement.
- Treat the installed SDK typings and tests as the API source of truth. Online `latest` documentation may describe a newer version.
- Construct sessions through Pi's documented services and `AgentSessionRuntime`; keep session replacement behavior in the runtime layer.
- Re-subscribe to events and re-bind extensions whenever `AgentSessionRuntime` replaces its active session.
- Keep Pi JSONL files authoritative for transcripts. Store only UI/catalog metadata separately.
- Disable ordinary global/project extension, skill, prompt, package, and MCP discovery. Supply only the source-controlled harness feature manifest through Pi's public loader options. Keep Pi workspace context loading such as `AGENTS.md`.
- Surface baked feature and extension-host diagnostics; do not swallow load errors.
- Use `dispose`, abort signals, and extension/session shutdown events to release long-lived resources.
- Do not parse streaming text as final state. Use final message/session events as authoritative and deltas for rendering only.

## Personal trust policy

The product assumes the owner trusts selected workspaces and the source-reviewed baked extensions, skills, packages, and MCP servers. The UI and documentation must still be honest:

- Pi has no built-in sandbox.
- Extensions execute code with the permissions of the app process.
- Skills may instruct the model to run commands.
- MCP servers may execute local programs or access remote accounts.
- Renderer sandboxing protects the desktop UI boundary; it does not sandbox the Pi runtime.

Do not describe confirmation dialogs, Electron renderer sandboxing, Tauri capabilities, or process separation as a sandbox for Pi extensions. Production hardening is deferred, but misleading security claims are never acceptable.

## UI rules

- The conversation is the primary surface: transcript, streaming state, tool activity, errors, and composer take priority.
- The minimal application should not become a generic dashboard.
- Use accessible semantic controls, visible focus, keyboard operation, and reduced-motion handling.
- Design streaming updates to avoid re-rendering the full transcript for each token.
- Render tool inputs and outputs as untrusted data. Never inject unsanitized HTML.
- External links open outside the application through a validated `http:` or `https:` URL path in the main process.
- Beautiful UI, pi-web, and T3 Code examples may be adapted, but copied code must retain attribution required by its license and be recorded in `docs/references-and-attribution.md`.
- Prefer the project design tokens over introducing a second styling system for isolated copied components.

## References and copying

`refs/pi-gui`, `refs/pi-web`, and `refs/t3code` are MIT-licensed references. Reading them for concepts requires no source annotation. Copying or closely adapting meaningful code does.

Whenever code is copied or materially adapted:

1. Confirm the source license permits the use.
2. Add a short source comment where practical.
3. Add the source path/URL, upstream revision, destination, extent of adaptation, and license to `docs/references-and-attribution.md`.
4. Preserve the required copyright and license notice in the eventual third-party notices artifact.
5. Add tests owned by this repository; upstream tests are evidence, not a substitute.

Do not copy generated artifacts, credentials, session data, screenshots containing private data, or code with unclear licensing.

## Implementation workflow

For nontrivial work:

1. Inspect repository status, applicable instructions, architecture, and the current implementation phase.
2. State concrete acceptance criteria and planned verification.
3. Resolve material product or API ambiguity before editing.
4. Keep changes inside one implementation milestone or one narrow cross-cutting concern.
5. Add or update tests with the implementation.
6. Run the smallest relevant checks, then the milestone's full exit checks.
7. Inspect the actual diff and repository status before reporting completion.
8. Update documentation when commands, boundaries, state ownership, or extension behavior change.

Do not build later-phase UI or integrations around mocked contracts that have not been validated by the first vertical slice.

## Verification policy

Never claim a check passed unless it ran. Distinguish:

- **unit verified:** protocol, reducers, and pure logic tests passed;
- **integration verified:** runtime with real Pi SDK and temporary directories passed;
- **desktop verified:** behavior passed in the real Electron surface;
- **packaged verified:** a built application artifact passed a smoke test;
- **not verified:** document the reason and exact next check.

For renderer or IPC changes, unit tests alone are insufficient. Run the Electron smoke/integration lane appropriate to the milestone. For native dependencies, verify against Electron's ABI after Electron upgrades.

The root command contract, once scaffolded, is:

```bash
bun run typecheck
bun run lint
bun test
bun run test:desktop
bun run build
```

Use the narrower package command during iteration, followed by the required milestone exit checks in `docs/implementation-plan-v2.md`.

## Filesystem and deletion

- Treat both reference submodules as read-only.
- Do not initialize, update, reset, clean, or switch a submodule without explicit task scope.
- Preserve unrelated user changes and staged gitlinks.
- Never permanently delete files or directories. On macOS use `/usr/bin/trash <absolute-path>` for approved removals. On Linux use `trash-put` or `gio trash`; stop if neither is available.
- Never delete Pi sessions, credentials, package caches, skills, extensions, MCP configuration, screenshots, or workspaces as cleanup.
- Tests must use isolated temporary agent and workspace directories and must never point destructive operations at the user's real Pi directory.

## Documentation rules

- Commands in `README.md` and `docs/development.md` must match root scripts.
- Mark future commands as contracts until implemented.
- Architecture documents describe current accepted decisions; proposals belong in the implementation plan or a new decision record.
- When a decision changes, update the decision status and every downstream document in the same change.
- Use links to primary Pi, Electron, Tauri, and upstream repository documentation where API or security behavior matters.

## Completion bar

A change is complete only when its requested behavior exists, relevant checks pass, documentation and attribution are current, and no known issue undermines the stated acceptance criteria. Partial scaffolding should be reported as partial scaffolding.
