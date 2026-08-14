# Pho Code: current state

Last updated: 2026-08-14

## What exists today

Pho Code is a personal macOS-first Electron application built directly on Pi SDK `0.84.1`. It currently has:

- a sandboxed React renderer behind a narrow typed Electron bridge;
- local workspace selection and recent-project navigation;
- persistent Pi JSONL sessions with new, list, open, resume, and immediate sidebar state;
- real provider/model discovery plus model and thinking-level selection;
- multi-turn streaming chat with sanitized GFM live tokens, compositor-only caret/enter/pulse motion, thinking blocks, KaTeX/Shiki/Mermaid/SVG after settle (KaTeX only when the text looks like math; SVG as a data-URL image with lightbox), copy and owner rewrite for settled assistant output and copy for fenced code blocks, tool activity, Stop, and error states;
- a T3-inspired conversation UI with a wider collapsible, mouse-resizable project/session sidebar (manual folder order, no MRU bump on session switch; collapse hides without unmounting; collapse control on the macOS traffic-light inset’s right and leading on Linux), a welcome launcher when no session is live, per-chat activity with a chat icon or Beautiful UI Dots while a run is live, archive/restore, Move chat to Trash, and a warned Remove project that trashes that folder’s chats, a centered empty-session composer, and an anchored composer after the first message; session switch updates sidebar selection and the chat pane only (cached chats paint immediately; uncached opens show chat-pane loading), and live tokens update a transcript tail rather than the settled turn list;
- a source-controlled baked-feature manifest that ignores arbitrary global/project extensions, skills, prompts, and themes, plus three Pho Code-authored text-only skills available through `/` after the built-in source (always on) or an explicitly enabled Codex/Cursor/Claude/Pi user root;
- `@gotgenes/pi-permission-system` `24.0.0` as the first baked feature;
- `pi-cursor-sdk` `0.2.0` as a baked Cursor provider (local Cursor SDK agents only; ambient `~/.cursor` settings and Cursor Cloud are disabled by harness policy); selecting a Cursor model shows an honest warning dialog with the Cursor mark;
- additive FFF-backed `fffind` / `ffgrep` / `fff-multi-grep` tools and composer inline `@path` mentions from one workspace-scoped index;
- additive `pho-web` tools `web_search` (parallel DuckDuckGo, Bing, Brave, Mojeek, and Jina, merged unique URLs) and `fetch_content` (bounded public HTTP GET with Readability, YouTube captions/metadata, then Jina Reader for thin JS pages) with SSRF/redirect/size limits;
- Pi-native **Steer current run** / **Add follow-up** commands with pending queue chips projected from Pi;
- image attachments (PNG/JPEG/GIF/WebP) picked or pasted, prepared without absolute paths, and admitted only when the selected model accepts images;
- an application-owned `move_to_trash` tool that uses the operating-system Trash facility and never falls back to permanent deletion;
- desktop confirm/select/input permission dialogs, approval-for-session, denial reasons, notifications, cancellation, and session rebind;
- typed Settings in a floating Appearance / Accounts / GitHub / Skills / Archived / Permissions dialog for palette + light/dark/system mode (Default, Gruvbox, Catppuccin, Flexoki, GitHub, One Dark), optional frosted-glass blur with strength control, independent UI and chat font sizes, built-in and trusted instruction sources with Refresh, a Settings-controlled read-only GitHub MCP row (default off; PAT in the OS secret store), and the owner-facing baby (strict), okay, you got it, and with great power comes great responsibility permission modes, with Custom preservation, honest private/shared data-scope disclosure, and a project-permission trust dialog/banner when a workspace override is present;
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

## Accepted personal v2 boundary

The owner approved this current milestone order:

- **Milestone 0 — autonomy foundation:** accepted with three owner-facing permission modes over stable internal policy keys, reviewed safe command families, clearer permission context, and an application-owned recoverable Trash tool.
- **Milestone 1 — retrieval and richer input:** accepted with local additive FFF tools and `@` references, bounded public web research, Pi-native steer/follow-up, and image attachments.
- **Milestone 2 — accounts and subscription login:** accepted as provider-owned OAuth through Pi `ModelRuntime`, with a Provider accounts Settings surface, opaque system-browser handles, cancellation, logout, and model-list synchronization. The deterministic fake-provider journey is in the Electron and packaged lanes. The owner completed a live `openai-codex` login and confirmed it works.
- **Milestone 3 — session continuity and lifecycle:** accepted. Independently owned session controllers, keyed catalog/cache, a per-chat live-run store, sidebar activity, archive/restore, recoverable OS-Trash chat removal, and per-workspace FFF indexes are in source. Desktop verified: background-run switching, archive/restore, busy-state Trash refusal, and settled Trash. Packaged verified: background-run switching, archive persist across relaunch, restore, and settled Trash from isolated app-owned data without a Pi CLI. The owner accepted the real-provider background-switch, live thinking across chat switches, archive/restore, and Trash workflow on 2026-08-14. A later correction keyed image prepare and dialog resolve to the composite session and compared event identity as `{workspaceId, sessionId}`.
- **Milestone 4 — interoperable skills and GitHub MCP:** accepted on 2026-08-14. Three Pho Code skills, fixed owner-enabled Codex/Cursor/Claude/Pi sources, provenance inventory, Refresh, and on-demand `/`/named loading are in source without baking skill paths into Pi. The Settings-controlled GitHub capability uses pinned `github/github-mcp-server` `v1.9.0`, MCP client `1.30.0`, OS-secret-store PAT authentication, and one fixed `mcp` dispatcher restricted to qualified `github:<read-tool>` targets. External sources stay disabled until trusted. Arbitrary/project skill discovery, executable skill assets, generic MCP configuration, GitHub OAuth, and GitHub mutations remain rejected.

Personal v2 is complete and archived under [`archive/v2`](./archive/v2/README.md), including the accepted [product boundary](./archive/v2/product-v2.md), [implementation plan](./archive/v2/implementation-plan-v2.md), and [Milestone 4 closure review](./archive/v2/reviews/milestone-4-code-review.md). No advanced-feature Milestone 5 blocks v2 completion.

Browser automation, diff/checkpoint workflows, session fork/tree and compaction controls, terminal, multi-agent worktrees, public distribution, and isolation are separated into independently promotable future-release phases in the [roadmap](./roadmap-vnext.md). They are not unfinished v2 work. UI polish, defect fixes, and owner-reviewed skill additions that preserve the accepted boundaries may continue as v2.x maintenance after archival.

## Run it

```bash
bun install --frozen-lockfile
bun run stage:github-mcp
bun run dev
```

Use [`archive/v2`](./archive/v2/README.md) for the accepted v2 record, [`archive/v1`](./archive/v1/README.md) for v1, and [`roadmap-vnext.md`](./roadmap-vnext.md) for future work not yet promoted. Update this brief when the accepted product boundary changes.
