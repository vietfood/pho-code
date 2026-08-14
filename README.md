# Pho Code

A bowl of [Pi](https://github.com/earendil-works/pi), served on the desktop.

**A coding agent in a window you own.** Fork the UI, the system prompt, the skills, and the built-in tools. Pi stays the engine.

Pho Code helps developers who personalize their editors and desktops build an AI coding workspace they truly own. The agent reads, edits, searches, and fetches inside a trusted local folder. The host around it is source you can change.

## Philosophy

Always free. I built this for myself. You can use it too.

- Hate it? Fork it and make the version you want.
- Want to sell it? That's your problem, not mine.
- Love it? Give it a star. Love you.

No plan, no paywall, no "open core." The source is the product.

This is for people who rice their editor, keep a dotfiles repo, and would rather change a file than wait on a plugin marketplace. If you want a signed store app, a generic MCP manager, or someone else's feature catalog, this is the wrong bowl.

## For agents

If a human asked you to run, change, or fork Pho Code, read this section, then `[AGENTS.md](./AGENTS.md)`.

Pho Code is a **desktop harness**, not a Pi fork and not a plugin platform. Pi (`@earendil-works/pi-coding-agent` `0.84.1`) owns the agent loop, sessions, models, and JSONL transcripts. This repository owns the window, permissions, and the pinned feature bundle.

| Change                  | Path                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation UI         | `[packages/ui](./packages/ui)`                                                                                                                                            |
| System / context prompt | empty-chat **Context prompt** panel; workspace `AGENTS.md`; prompt templates on the feature manifest                                                                      |
| Skills                  | `[packages/runtime/features/@pho-code/curated-coding-skills](./packages/runtime/features/@pho-code/curated-coding-skills)` — insert with `/`, do not bake into every turn |
| Built-in tools          | `[packages/runtime/src/features.ts](./packages/runtime/src/features.ts)` — `createDefaultFeatureManifest`                                                                 |

Do not import `electron`, `node:*`, or Pi from the renderer. Do not add a marketplace, generic MCP manager, or ambient extension discovery. Pin Pi to an exact version. Settings change documented behavior of features already in the manifest; they do not install code.

## Make it yours

Ownership means the capability set lives in source you can fork and rebuild. Settings do not install plugins, accept an extension path, or inherit another Pi install.

```text
renderer -> ui -> protocol
renderer -> protocol
Electron main -> application -> runtime -> Pi SDK
Electron main/preload -> protocol
```

The renderer is a view. The runtime owns the agent. Fork the layer you care about; leave the rest alone.

macOS is the verified desktop. Linux-compatible path and process behavior is required in the code. Windows is out of scope.

## Run it

Pho Code is built from this repository. There is no public installer yet.

```bash
git submodule update --init --recursive
bun install --frozen-lockfile
bun run stage:github-mcp
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

## Trust

Pi does not include a built-in sandbox. By default it runs with the permissions of the process that launched it.

Pho Code adds named modes, confirmation dialogs, and recoverable Trash. That layer gates recognized operations. It does not contain arbitrary extension code, and it is not a substitute for a container, VM, or operating-system sandbox.

Be honest about the workspace you open. Selected folders and the source-reviewed feature bundle are trusted. Renderer sandboxing protects the desktop UI boundary. It does not sandbox the agent.

## Status

This is early, personal software. Expect bugs. The first usable release exists; the daily-driver work is still in progress.

There is no plugin marketplace, no generic MCP manager, and no "paste an extension path" screen. Capabilities enter the app as source-controlled, pinned features.

## Documentation

Start here if you want to use or fork the app:

- [Current state](./docs/current-state.md) — what exists today
- [Architecture](./docs/architecture/overview.md) — ownership and dependency direction
- [Extension model](./docs/extension-model.md) — baked features, not a plugin platform
- [Development runbook](./docs/development.md) — commands, isolation, and verification
- [Conversation UI](./docs/plans/conversation-ui.md) — transcript, sidebar, and chrome
- [Attribution log](./docs/references-and-attribution.md) — what was read vs adapted

Records and later work:

- [Archived product v2](./docs/archive/v2/product-v2.md) — the accepted daily-driver boundary
- [V2 archive](./docs/archive/v2/README.md) — accepted Milestones 0 through 4
- [Later roadmap](./docs/roadmap-vnext.md) — work not yet promoted
- [Personal v1 archive](./docs/archive/v1/README.md) — the closed first release

## Development

```bash
bun run typecheck
bun run lint
bun test
bun run test:desktop
bun run build
```

`bun run build` produces Electron main, preload, and renderer bundles under `apps/desktop/out`. It does not create an installer.

## Acknowledgements

Pho Code is new code. It would not exist in this shape without the projects below. Reading them for architecture required no copying. Where code, CSS, or component structure was adapted, the exact source, revision, and extent are recorded in [the attribution log](./docs/references-and-attribution.md).

### Agent runtime

- **[Pi](https://github.com/earendil-works/pi)** by [Earendil Works](https://github.com/earendil-works) — the reason this app exists. Pho Code embeds `[@earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)` and `[@earendil-works/pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai)` as the agent engine, session format, model runtime, resource loader, and tool loop. The Pi TUI also informed composer usage chrome (context, tokens, cache, cost). See [pi.dev](https://pi.dev).



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

- `[@gotgenes/pi-permission-system](https://www.npmjs.com/package/@gotgenes/pi-permission-system)` by Chris Lasher — the first baked feature: policy, confirm/select/input host UI, and the permission modes Settings exposes.
- `[@ff-labs/fff-node](https://www.npmjs.com/package/@ff-labs/fff-node)` by Dmitry Kovalenko, with tool names informed by `[@ff-labs/pi-fff](https://www.npmjs.com/package/@ff-labs/pi-fff)` — workspace-scoped local retrieval and `@` suggestions. Pho Code owns the adapter and index location; it does not load the Pi TUI extension.
- `[pi-web-access](https://www.npmjs.com/package/pi-web-access)` by Nico Bailon — policy, DuckDuckGo parsing, and YouTube URL detection that informed the application-owned `pho-web` tools. Pho Code does not load that extension.
- **[Jina Reader / Search](https://github.com/jina-ai/reader)** — keyless HTTP search/extraction used by `pho-web` alongside HTML search engines and for thin JS pages. Queries and target URLs on that path are disclosed to jina.ai.
- **[Readability](https://github.com/mozilla/readability)**, **[linkedom](https://github.com/WebReflection/linkedom)**, and **[Turndown](https://github.com/mixmark-io/turndown)** — public-page extraction behind `fetch_content`.

Local checkouts of T3 Code, pi-gui, and pi-web live under `[refs/](./refs)` as read-only references. They are not the application base.