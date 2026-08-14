# Pho Code: current state

Last updated: 2026-08-14

## What exists today

Pho Code is a personal macOS-first Electron application built directly on Pi SDK `0.84.1`. It currently has:

- a sandboxed React renderer behind a narrow typed Electron bridge;
- local workspace selection and recent-project navigation;
- persistent Pi JSONL sessions with new, list, open, resume, and immediate sidebar state;
- real provider/model discovery plus model and thinking-level selection;
- multi-turn streaming chat with sanitized GFM live tokens, compositor-only caret/enter/pulse motion, thinking blocks, KaTeX/Shiki/Mermaid after settle (KaTeX only when the text looks like math), copy and owner rewrite for settled assistant output and copy for fenced code blocks, tool activity, Stop, and error states;
- a T3-inspired conversation UI with a wider collapsible project/session sidebar (manual folder order, no MRU bump on session switch), per-chat activity, archive/restore, and Move chat to Trash, a centered empty-session composer, and an anchored composer after the first message;
- a source-controlled baked-feature manifest that ignores arbitrary global/project extensions, skills, prompts, and themes;
- `@gotgenes/pi-permission-system` `24.0.0` as the first baked feature;
- additive FFF-backed `fffind` / `ffgrep` / `fff-multi-grep` tools and composer inline `@path` mentions from one workspace-scoped index;
- additive `pho-web` tools `web_search` (DuckDuckGo) and `fetch_content` (bounded public HTTP GET) with SSRF/redirect/size limits;
- Pi-native **Steer current run** / **Add follow-up** commands with pending queue chips projected from Pi;
- image attachments (PNG/JPEG/GIF/WebP) picked or pasted, prepared without absolute paths, and admitted only when the selected model accepts images;
- an application-owned `move_to_trash` tool that uses the operating-system Trash facility and never falls back to permanent deletion;
- desktop confirm/select/input permission dialogs, approval-for-session, denial reasons, notifications, cancellation, and session rebind;
- typed Settings in a floating Appearance / Accounts / Permissions dialog for palette + light/dark/system mode (Default, Gruvbox, Catppuccin, Flexoki, GitHub, One Dark), optional frosted-glass blur with strength control, independent UI and chat font sizes, and the owner-facing baby (strict), okay, you got it, and with great power comes great responsibility permission modes, with Custom preservation, honest private/shared data-scope disclosure, and a project-permission trust dialog/banner when a workspace override is present;
- in-app provider account login (API key and OAuth) that never returns stored secrets or authorization URLs to the renderer, with compact Settings rows that keep API-key fields collapsed until explicitly opened;
- an unsigned local macOS bundle that stages Pi and the permission feature under app-owned resources;
- internal feature/version diagnostics without install, enable, disable, or marketplace controls;
- bounded shutdown, CSP/navigation/permission guards, context isolation, renderer sandboxing, and disabled Node integration.

## Standalone product direction

The intended product is a standalone harness powered by an embedded, bare-bones Pi runtime. The application—not the user's separate Pi installation—owns its complete capability bundle:

- the exact Pi SDK/runtime version;
- every baked extension and its dependencies;
- every baked skill and prompt;
- every selected MCP adapter/server and required assets;
- host UI adapters, settings adapters, and feature configuration defaults.

The user should install Pho Code and receive those capabilities automatically. They should not need to install Pi packages, copy skills, edit their Pi package settings, configure an MCP adapter separately, or even have a Pi CLI installation for feature loading.

Pho Code now owns its Pi operational data by default under Electron `userData/pi-agent`: provider credentials, model definitions, sessions, permission config, and permission logs. `PHO_CODE_AGENT_DIR` remains an explicit development/interoperability override and is disclosed as shared in Settings. No automatic migration is promised for this pre-release transition.

Milestones 0 through 5 are accepted, and the personal v1 is complete. The owner has also exercised real-provider chat. Signed/notarized public installers and Linux desktop remain outside the verified v1 surface.

## Accepted v1 boundary

The typed Settings contract is accepted. Settings configure supported behavior of baked features; they do not install, remove, enable, disable, or discover feature code.

Milestone 5 completed the standalone boundary:

- product identity is `Pho Code`, with slug `pho-code`, workspace scope `@pho-code/*`, bridge `window.phoCode`, IPC namespace `pho-code:v1:*`, and environment prefix `PHO_CODE_*`;
- the bundle identifier is `dev.vietfood.phocode`;
- the default Pi data directory is application-owned at `userData/pi-agent`; an explicit `PHO_CODE_AGENT_DIR` override is treated as externally shared;
- production `ResourceLocator` resolves baked features from app-owned `Resources/features`; development/tests keep the workspace `node_modules` locator;
- `@gotgenes/pi-permission-system` `24.0.0` is staged with its declared extension source, nested runtime dependencies, and license;
- Settings offers in-app provider API-key import through Pi `ModelRuntime.login`; stored secrets never reach the renderer;
- `bun run package:mac` produces an unsigned local macOS `.app`; `bun run test:packaged` smokes that artifact with isolated data and a PATH that does not contain `pi`.

The acceptance review additionally made packaged resource overrides development-only and added pinned-version validation for the permission feature. See the archived [Milestone 5 code review](./archive/v1/reviews/milestone-5-code-review.md).

## Active v2 planning

The owner approved this current milestone order:

- **Milestone 0 — autonomy foundation:** accepted with three owner-facing permission modes over stable internal policy keys, reviewed safe command families, clearer permission context, and an application-owned recoverable Trash tool.
- **Milestone 1 — retrieval and richer input:** accepted with local additive FFF tools and `@` references, bounded public web research, Pi-native steer/follow-up, and image attachments.
- **Milestone 2 — accounts and subscription login:** accepted as provider-owned OAuth through Pi `ModelRuntime`, with a Provider accounts Settings surface, opaque system-browser handles, cancellation, logout, and model-list synchronization. The deterministic fake-provider journey is in the Electron and packaged lanes. The owner completed a live `openai-codex` login and confirmed it works.
- **Milestone 3 — session continuity and lifecycle:** accepted. Independently owned session controllers, keyed catalog/cache, a per-chat live-run store, sidebar activity, archive/restore, recoverable OS-Trash chat removal, and per-workspace FFF indexes are in source. Desktop verified: background-run switching, archive/restore, busy-state Trash refusal, and settled Trash. Packaged verified: background-run switching, archive persist across relaunch, restore, and settled Trash from isolated app-owned data without a Pi CLI. The owner accepted the real-provider background-switch, live thinking across chat switches, archive/restore, and Trash workflow on 2026-08-14.
- **Milestone 4 — curated capabilities:** moved from the former Milestone 3. It remains drafted as five text-only baked skills plus one read-only GitHub MCP capability. The design preserves immutable composition, packages a pinned native server, exposes only reviewed read tools, and does not add a skill store or MCP manager.

[`product-v2.md`](./product-v2.md) defines the intended product boundary. [`implementation-plan-v2.md`](./implementation-plan-v2.md) contains the accepted Milestone 0 through 3 contracts and the draft Milestone 4 contract.

Browser automation, diff/checkpoint workflows, session fork/tree and compaction controls, terminal, multi-agent worktrees, public distribution, and isolation remain later candidates in the [roadmap](./roadmap-vnext.md). They are not unfinished v1 work and must be promoted explicitly before implementation.

## Run it

```bash
bun install --frozen-lockfile
bun run dev
```

Use [`implementation-plan-v2.md`](./implementation-plan-v2.md) for active work, [`archive/v1`](./archive/v1/README.md) for the closed v1 record, and [`roadmap-vnext.md`](./roadmap-vnext.md) for work not yet promoted. Update this brief when the accepted product boundary changes.
