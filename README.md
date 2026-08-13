# Pho Code

Pho Code is a personal, local-first desktop coding harness built directly on the [Pi SDK](https://pi.dev/docs/latest/sdk). The first release is intentionally small: open a workspace, start or resume a Pi session, stream a conversation, inspect tool activity, stop a run, and use a curated set of capabilities baked into the application.

The product is new code. [`refs/pi-gui`](./refs/pi-gui), [`refs/pi-web`](./refs/pi-web), and [`refs/t3code`](./refs/t3code) are MIT-licensed read-only implementation/product references, not the application base. Meaningful code or components copied or materially adapted from a reference must be recorded in [the attribution log](./docs/references-and-attribution.md).

## Repository status

Milestones 0 through 5 are accepted, and the personal v1 is complete. The application has persistent multi-turn Pi chat, immutable source-controlled feature composition, the pinned permission system with desktop dialogs and settings, in-app API-key import, and a self-contained unsigned macOS bundle. V2 planning now focuses on quieter effect-aware permissions, recoverable removal, and bounded local/web retrieval.

The confirmed identity is `Pho Code` / `pho-code`, package scope `@pho-code/*`, environment prefix `PHO_CODE_*`, bridge `window.phoCode`, IPC namespace `pho-code:v1:*`, and bundle identifier `dev.vietfood.phocode`. Normal runs keep Pi-compatible operational data under Electron `userData/pi-agent`; `PHO_CODE_AGENT_DIR` is an explicit external/shared override.

See the archived [Milestone 5 code review](./docs/archive/v1/reviews/milestone-5-code-review.md) for v1 acceptance evidence. The complete historical record lives in the [personal-v1 archive](./docs/archive/v1/README.md), while active work lives in the [v2 product definition](./docs/product-v2.md) and [v2 implementation plan](./docs/implementation-plan-v2.md).

Start with:

1. [Current state: what exists and what is next](./docs/current-state.md)
2. [Product v2 scope](./docs/product-v2.md)
3. [V2 implementation plan](./docs/implementation-plan-v2.md)
4. [Architecture](./docs/architecture/overview.md)
5. [Electron decision](./docs/architecture/desktop-shell.md)
6. [Extension model](./docs/extension-model.md)
7. [Development and runbook](./docs/development.md)
8. [Later roadmap](./docs/roadmap-vnext.md)
9. [Personal-v1 archive](./docs/archive/v1/README.md)

Agents and contributors must also follow [`AGENTS.md`](./AGENTS.md).

## Product principles

- **Usable before broad.** The first milestone is one reliable local chat loop, not a plugin marketplace or production distribution system.
- **Pi remains the agent runtime.** Use Pi's SDK, session format, resource loader, tools, model runtime, and extension contracts. Do not reimplement its agent loop.
- **Standalone feature bundle.** The installed harness embeds its pinned Pi runtime and every baked extension, skill, prompt, MCP integration, dependency, and asset. Users never prepare a separate Pi installation to supply application features.
- **The renderer is a view.** React renders state and sends typed intents. It does not import Pi, Electron internals, Node filesystem APIs, or MCP clients.
- **Local and personal by default.** v1 assumes the owner trusts selected workspaces and the source-reviewed feature bundle shipped by the application.
- **Boundaries now, isolation later.** Interfaces must permit moving the runtime to a utility process or Tauri sidecar later, but v1 may run it inside Electron's main process.
- **Curated features.** Extensions, skills, prompts, and later MCP integrations are selected in source, pinned, and shipped as application features. Users may configure deliberately exposed behavior of those features, but cannot change which feature code is loaded.
- **Evidence over claims.** A command, test, package, or platform is supported only after it has been exercised on that surface.

## v1 at a glance

The first usable release targets macOS and is written to remain compatible with Linux. Windows is out of scope.

Included in the personal v1:

- Electron desktop shell with a React and TypeScript renderer
- direct `@earendil-works/pi-coding-agent` SDK integration
- provider/model discovery through Pi
- new and resumed persistent Pi sessions
- streaming assistant text and thinking state
- tool-call lifecycle display and cancellation
- workspace selection
- baked-in permission-system feature with native decision dialogs
- explicit source-controlled seams for later baked skills and MCP-backed features
- internal feature diagnostics and typed settings for supported baked-feature behavior, without install/enable/disable controls
- a shell-neutral, versioned bridge contract
- a standalone unsigned macOS bundle that embeds Pi and all baked feature resources without requiring Pi CLI/user-global packages

Moved to the next-version roadmap:

- sandboxing, containers, VMs, and remote execution
- automatic auditing or signing of extensions and packages
- plugin marketplace, remote catalog, and automatic package installation
- unspecified extensions, skills, and MCP servers
- comprehensive MCP management UI
- multi-agent orchestration, worktrees, integrated terminal, diff editor, and updater
- code signing, notarization, automatic updates, and public distribution hardening
- Windows support

These items are outside the accepted v1 rather than unfinished v1 work.

## Why Electron for v1

Pi and its extension ecosystem are Node.js and TypeScript-first. Electron already embeds a compatible Node runtime and provides React rendering, native windows, process APIs, and a narrow preload bridge. Tauri would require a separately packaged long-lived Node sidecar or Pi RPC process before it could run the same SDK and extensions.

The renderer will communicate through a shell-neutral `DesktopBridge`. A future Tauri shell can implement the same JSON-safe commands and events over Tauri invoke/channels while hosting the runtime in a Node sidecar or Pi RPC process. The detailed decision is in [desktop-shell.md](./docs/architecture/desktop-shell.md).

## Current workspace layout

The implemented workspace has this ownership structure:

```text
.
├── apps/
│   └── desktop/
│       ├── electron/          # Electron main and preload adapters
│       ├── src/               # React conversation renderer
│       ├── tests/             # Playwright Electron smoke, chat, host-UI, permission, settings, credentials, packaged lanes
│       ├── electron.vite.config.ts
│       └── playwright.config.ts
├── packages/
│   ├── protocol/              # JSON-safe commands, events, errors, versions
│   ├── runtime/               # Pi SDK session and baked feature ownership
│   ├── application/           # shell-neutral use cases and state projection
│   └── ui/                    # reusable React components and tokens
├── docs/
│   └── reviews/               # dated implementation reviews and closure evidence
├── refs/
│   ├── pi-gui/                # reference only
│   ├── pi-web/                # reference only
│   └── t3code/                # reference only
├── AGENTS.md
├── bun.lock
├── bunfig.toml
├── eslint.config.js
└── package.json
```

The current import direction is:

```text
renderer -> ui -> protocol
renderer -> protocol
Electron main -> application -> runtime -> Pi SDK 0.84.1
Electron main/preload -> protocol
```

## Current commands

Install and launch from the repository root:

```bash
bun install --frozen-lockfile
bun run dev
```

Required verification commands:

```bash
bun run typecheck
bun run lint
bun test
bun run test:desktop
bun run build
```

`bun run build` produces Electron main, preload, and renderer bundles under `apps/desktop/out`; it does not create an installer.

Milestone 5 packaging commands:

```bash
bun run package:mac
bun run test:packaged
```

`package:mac` produces an unsigned local macOS `.app` under `apps/desktop/release`. `test:packaged` smokes that artifact with isolated user data and a PATH that does not contain `pi`. `package:linux` remains later until a real Linux artifact is in scope. Signing and notarization remain deferred.

Use [the development runbook](./docs/development.md) for prerequisites, isolation env vars, the desktop chat lane, and the optional real-provider recipe.

## Accepted v1 baseline

The following first-usable criteria have been demonstrated in the Electron application:

1. The user selects a local directory.
2. The app creates a persistent Pi session in that directory.
3. The user sends a prompt and sees streaming assistant text.
4. At least one Pi tool call renders start, update, and completion states.
5. Stop cancels the active run without corrupting the session.
6. Closing and reopening the app can resume the session from Pi's JSONL file.
7. The baked permission feature loads without relying on global/project package discovery, and its allow/deny dialog settles one gated tool call.
8. Renderer sandboxing, context isolation, and disabled Node integration are verified.
9. Unit tests, type checking, and one Electron smoke test pass.

## Documentation authority

- [`docs/current-state.md`](./docs/current-state.md) is the short tracking brief and must be updated at milestone transitions.
- [`docs/product-v2.md`](./docs/product-v2.md) defines the active product scope and acceptance criteria.
- [`docs/architecture/overview.md`](./docs/architecture/overview.md) defines component ownership and dependency direction.
- [`docs/architecture/desktop-shell.md`](./docs/architecture/desktop-shell.md) records the Electron decision.
- [`docs/extension-model.md`](./docs/extension-model.md) defines the baked feature manifest, feature-settings boundary, permission host UI, and future MCP-feature boundary.
- [`docs/implementation-plan-v2.md`](./docs/implementation-plan-v2.md) is the active milestone and exit-criteria record.
- [`docs/development.md`](./docs/development.md) defines development and verification commands.
- [`docs/roadmap-vnext.md`](./docs/roadmap-vnext.md) owns work not yet promoted into an active milestone.
- [`docs/archive/v1`](./docs/archive/v1/README.md) preserves the closed v1 product, implementation, and review record.
- [`AGENTS.md`](./AGENTS.md) defines contribution behavior for coding agents.

When documents disagree, use the most specific document. Product scope overrides implementation convenience; security boundaries override UI convenience.
