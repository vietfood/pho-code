# Pho Code

A bowl of [Pi](https://github.com/earendil-works/pi), served on the desktop.

Pho Code is the window I wanted to live in: open a workspace, talk to the model, watch it change the files in front of you. Pi is the agent. This app is everything around it — the conversation, the permissions, and a feature bundle that ships in the install. You should not need a second Pi installation to make it useful.

## Philosophy

Always free. I built this for myself. You can use it too.

- Hate it? Fork it and make the version you want.
- Want to sell it? That's your problem, not mine.
- Love it? Give it a star. Love you.

No plan, no paywall, no "open core." The source is the product.

## What it does

- Open a local workspace and start or resume a persistent Pi session
- Stream assistant text, thinking, Markdown, math, code, and diagrams
- Watch tool activity as it happens, then Stop, steer the current run, or queue a follow-up
- Mention files and folders with `@`, search the workspace, and attach images the model can see
- Fetch public web pages and search the open web through bounded, application-owned tools
- Choose how much autonomy to grant: **baby**, **okay**, **you got it**, or **with great power comes great responsibility**
- Move files to the operating-system Trash instead of deleting them forever
- Sign in to a provider account in Settings, or import an API key; stored secrets never reach the renderer
- Run as a self-contained unsigned macOS app, with Pi and every baked feature inside the bundle

macOS is the verified desktop. Linux-compatible path and process behavior is required in the code. Windows is out of scope.

## Permissions

Pi does not include a built-in sandbox. By default it runs with the permissions of the process that launched it.

Pho Code adds an owner-facing permission layer on top of that: named modes, confirmation dialogs, and a dedicated recoverable Trash tool. That layer gates recognized operations. It does not contain arbitrary extension code, and it is not a substitute for a container, VM, or operating-system sandbox.

Be honest with yourself about the workspace you open. Selected folders and the source-reviewed feature bundle are trusted. Renderer sandboxing protects the desktop UI boundary. It does not sandbox Pi.

## Run it

Pho Code is built from this repository. There is no public installer yet.

```bash
git submodule update --init --recursive
bun install --frozen-lockfile
bun run dev
```

Then:

1. Choose a local workspace.
2. Sign in through a provider account in Settings if you have not already.
3. Start a session and send a prompt.

A normal run keeps Pi-compatible auth, models, sessions, and permission state under the app's own data directory. `PHO_CODE_AGENT_DIR` is an explicit override for sharing that directory with another Pi process; Settings labels it as shared.

Prerequisites, isolation env vars, and the optional real-provider recipe live in the [development runbook](./docs/development.md).

## Package a local macOS app

```bash
bun run package:mac
bun run test:packaged
```

`package:mac` writes an unsigned `Pho Code.app` under `apps/desktop/release`. `test:packaged` smokes that artifact with isolated user data and a PATH that does not contain `pi`. Signing, notarization, and auto-update are not part of this product yet.

## Some notes

This is early, personal software. Expect bugs. The first usable release exists; the daily-driver work is still in progress.

Capabilities enter the app as source-controlled, pinned features. Settings change documented behavior of those features. There is no plugin marketplace, no generic MCP manager, and no "paste an extension path" screen.

## Documentation

Start here if you want to use or extend the app:

- [Current state](./docs/current-state.md) — what exists today
- [Product v2](./docs/product-v2.md) — the daily-driver boundary
- [Development runbook](./docs/development.md) — commands, isolation, and verification
- [Architecture](./docs/architecture/overview.md) — ownership and dependency direction
- [Desktop shell](./docs/architecture/desktop-shell.md) — why Electron
- [Extension model](./docs/extension-model.md) — baked features, not a plugin platform
- [Conversation UI](./docs/plans/conversation-ui.md) — transcript, sidebar, and chrome
- [V2 implementation plan](./docs/implementation-plan-v2.md) — active milestone work
- [Later roadmap](./docs/roadmap-vnext.md) — work not yet promoted
- [Personal v1 archive](./docs/archive/v1/README.md) — the closed first release

Agents and contributors should follow [`AGENTS.md`](./AGENTS.md).

## Development

```bash
bun run typecheck
bun run lint
bun test
bun run test:desktop
bun run build
```

`bun run build` produces Electron main, preload, and renderer bundles under `apps/desktop/out`. It does not create an installer.

```text
renderer -> ui -> protocol
renderer -> protocol
Electron main -> application -> runtime -> Pi SDK
Electron main/preload -> protocol
```

The renderer is a view. It talks through a typed bridge. It does not import Electron internals, Node filesystem APIs, or the Pi SDK.

## Acknowledgements

Pho Code is new code. It would not exist in this shape without the projects below. Reading them for architecture required no copying. Where code, CSS, or component structure was adapted, the exact source, revision, and extent are recorded in [the attribution log](./docs/references-and-attribution.md).

### Agent runtime

- **[Pi](https://github.com/earendil-works/pi)** by [Earendil Works](https://github.com/earendil-works) — the reason this app exists. Pho Code embeds [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) and [`@earendil-works/pi-ai`](https://www.npmjs.com/package/@earendil-works/pi-ai) as the agent engine, session format, model runtime, resource loader, and tool loop. The Pi TUI also informed composer usage chrome (context, tokens, cache, cost). See [pi.dev](https://pi.dev).

### Desktop and conversation

- **[T3 Code](https://github.com/pingdotgg/t3code)** by [T3 Tools](https://t3.codes) — the primary product and UI reference for a dense agent conversation: hidden-inset desktop chrome, zinc theme, sidebar and composer dock, work-entry timeline, Markdown, Shiki, and inline approval cards. Pho Code is not a T3 Code fork and does not control other coding agents.
- **[pi-gui](https://github.com/minghinmatthewlam/pi-gui)** by Matthew Lam — the closest existing Electron home for Pi. Sidebar density, collapse chrome, and "a native window around the Pi SDK" are the useful lessons. Pho Code does not take pi-gui's worktrees, terminal, or multi-agent orchestration.
- **[pi-web](https://github.com/agegr/pi-web)** by agegr — an earlier Pi chat surface that informed the first shell, session list, clipboard copy, and Markdown image lightbox.

### Visual language

- **Codex desktop** — turn-level "Worked for …" collapse and the purple emphasis on the highest thinking level. Visual inspiration only; no Codex source is in this repository.
- **Cursor desktop** — shell chrome: sidebar actions, soft panels, composer footer selectors, empty-session hero, and inline `@` chips. Visual inspiration only; no Cursor source is in this repository.
- **[Beautiful UI](https://www.beautifului.dev/)** by Shane Levine — optional AI-native interface patterns.
- **[Simple Icons](https://simpleicons.org/)** — provider mark path data.
- **[Gruvbox](https://github.com/morhetz/gruvbox)**, **[Catppuccin](https://github.com/catppuccin/catppuccin)**, **[Flexoki](https://stephango.com/flexoki)**, **[GitHub Primer](https://primer.style)**, and Atom One Dark — palette values mapped onto Pho Code's theme tokens.

### Baked capabilities

- **[`@gotgenes/pi-permission-system`](https://www.npmjs.com/package/@gotgenes/pi-permission-system)** by Chris Lasher — the first baked feature: policy, confirm/select/input host UI, and the permission modes Settings exposes.
- **[`@ff-labs/fff-node`](https://www.npmjs.com/package/@ff-labs/fff-node)** by Dmitry Kovalenko, with tool names informed by [`@ff-labs/pi-fff`](https://www.npmjs.com/package/@ff-labs/pi-fff) — workspace-scoped local retrieval and `@` suggestions. Pho Code owns the adapter and index location; it does not load the Pi TUI extension.
- **[`pi-web-access`](https://www.npmjs.com/package/pi-web-access)** by Nico Bailon — policy and DuckDuckGo parsing that informed the application-owned `pho-web` tools. Pho Code does not load that extension.
- **[Readability](https://github.com/mozilla/readability)**, **[linkedom](https://github.com/WebReflection/linkedom)**, and **[Turndown](https://github.com/mixmark-io/turndown)** — public-page extraction behind `fetch_content`.

Local checkouts of T3 Code, pi-gui, and pi-web live under [`refs/`](./refs) as read-only references. They are not the application base.
