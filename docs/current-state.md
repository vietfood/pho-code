# Pho Code: current state

Last updated: 2026-08-18

## What exists today

Pho Code is a personal macOS-first Electron application built directly on Pi SDK `0.84.1`. It currently has:

- a sandboxed React renderer behind a narrow typed Electron bridge;
- local workspace selection and recent-project navigation;
- persistent Pi JSONL sessions with new, list, open, resume, and immediate sidebar state;
- real provider/model discovery plus model and thinking-level selection;
- multi-turn streaming chat with sanitized GFM live tokens, compositor-only caret/enter/pulse motion, thinking blocks, KaTeX/Shiki/Mermaid/SVG after settle (KaTeX only when the text looks like math; SVG as a data-URL image with lightbox), copy and owner rewrite for settled assistant output and copy for fenced code blocks, tool activity, Stop, and error states;
- a T3-inspired conversation UI with a wider collapsible, mouse-resizable project/session sidebar (manual folder order, no MRU bump on session switch; collapse swaps the panel for a compact overlay pill with Home, Open folder, New session, and Settings, or those same actions in the chat header when the right sidebar is expanded so the conversation fills the left pane; Home returns to the welcome launcher without disposing background sessions; collapse control on the macOS traffic-light inset’s right and leading on Linux), a welcome launcher when no session is live, per-chat activity with a chat icon or 3×3 running mark while a run is live, archive/restore, Move chat to Trash, and a warned Remove project that trashes that folder’s chats, a centered empty-session composer, and an anchored composer after the first message; session switch updates sidebar selection and the chat pane only (cached chats paint immediately; uncached opens show chat-pane loading), and live tokens update a transcript tail rather than the settled turn list;
- a persistent right sidebar that stays a compact overlay pill until expanded (Changes unified-diff review for tracked Pi `write`/`edit`, plus Context prompt); opened from a tool card or the FileDiff/BookOpen icons; clicking the active surface icon hides the panel; ⌘R / Ctrl+R toggles the panel (⌘⇧R / Ctrl+Shift+R reloads); the expanded panel is mouse-resizable (default 520px, up to 1100px or 62% of the window); Approve is ledger state only; conversation stays primary;
- a source-controlled baked-feature manifest that ignores arbitrary global/project extensions, skills, prompts, and themes, plus three Pho Code-authored text-only skills available through `/` after the built-in source (always on) or an explicitly enabled Codex/Cursor/Claude/Pi user root;
- `@gotgenes/pi-permission-system` `24.0.0` as the first baked feature;
- `pi-cursor-sdk` `0.2.0` as a baked Cursor provider (local Cursor SDK agents only; ambient `~/.cursor` settings and Cursor Cloud are disabled by harness policy); selecting a Cursor model shows an honest warning dialog with the Cursor mark;
- additive FFF-backed `fffind` / `ffgrep` / `fff-multi-grep` tools and composer inline `@path` mentions from one workspace-scoped index;
- additive `pho-web` tools `web_search` (parallel DuckDuckGo, Bing, Brave, Mojeek, and Jina, merged unique URLs) and `fetch_content` (bounded public HTTP GET with Readability, YouTube captions/metadata, then Jina Reader for thin JS pages) with SSRF/redirect/size limits;
- Pi-native **Steer current run** / **Add follow-up** commands with pending queue chips projected from Pi;
- image attachments (PNG/JPEG/GIF/WebP) picked or pasted, prepared without absolute paths, and admitted only when the selected model accepts images;
- an application-owned `move_to_trash` tool that uses the operating-system Trash facility and never falls back to permanent deletion;
- desktop confirm/select/input permission dialogs with Allow once, Allow for this session, and No with an optional reason on the same card, notifications, cancellation, and session rebind;
- an Agent-chat `ask_user_question` questionnaire card and per-chat Plan/Agent toggle (composer mode icon: Bot/ListTree, menu for Agent/Plan and Images…) with a Plan sidebar document plus session `todo` list on the transcript tool row and Plan rail (accepted Plan/Agent); `ask_user_question`, `update_plan_document`, `todo`, and `execute_plan` are permission-allow-listed so they do not open a permission dock on a synced config; Execute is the Plan footer button **or** `execute_plan` after the owner asks in chat; the Execute kickoff is hidden from the transcript; managed profiles allow `web_search` and ask for `fetch_content`;
- typed Settings in a floating Appearance / Accounts / GitHub / Skills / Archived / Permissions / Sandbox dialog for palette + light/dark/system mode (Default, Gruvbox, Catppuccin, Flexoki, GitHub, One Dark), optional frosted-glass blur with strength control, independent UI and chat font sizes, built-in and trusted instruction sources with Refresh, a Settings-controlled read-only GitHub MCP row (default off; PAT in the OS secret store), the owner-facing baby (strict), okay, you got it, and with great power comes great responsibility permission modes, with Custom preservation, honest private/shared data-scope disclosure, captured write/edit snapshots stored in app data (not encrypted at rest in personal v3), a project-permission trust dialog/banner when a workspace override is present, and an agent-tool sandbox row (default on; fail-closed Seatbelt wrap for agent bash; healthy sandbox skips bash and in-policy file-tool asks; in-process `read`/`write`/`edit` policy; packaged macOS stages the pinned engine and bundled `rg`);
- in-app provider account login (API key and OAuth) that never returns stored secrets or authorization URLs to the renderer, with compact Settings rows that keep API-key fields collapsed until explicitly opened;
- an unsigned local macOS bundle that stages Pi, the permission feature, the pinned sandbox-runtime engine, and bundled `rg` under app-owned resources;
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

## Workstream status

- **V1:** accepted and archived. Its standalone shell, settings, identity, packaging, credential, and permission evidence lives under [`archive/v1`](./archive/v1/README.md).
- **V2:** accepted and archived. Daily-driver autonomy, retrieval, provider accounts, independent sessions, interoperable text-only skills, and the fixed read-only GitHub MCP record live under [`archive/v2`](./archive/v2/README.md).
- **V3 — Change Control and Recovery:** accepted and archived. Tracked Pi `write`/`edit` changes have bounded unified-diff review, Approve, conflict-safe per-file Undo, restart persistence, corrupt-ledger fail-closed behavior, and real macOS Trash recovery. Undo all and shell/MCP mutation recovery remain unavailable. See the [V3 acceptance review](./archive/v3/logs/2026-08-16-v3-acceptance-review.md).
- **Integrated terminal add-on:** promoted and in implementation; no PTY or Terminal rail exists in source. Product, plan, and handoff live under [`features/terminal`](./features/terminal/README.md).
- **Plan / Agent and ask-user add-on:** accepted 2026-08-18; workstream archived 2026-08-18. Agent default; Plan write-tool policy (not a sandbox); juicesharp-style ask-back card; session `todo` in Agent and Plan; Plan document + Execute with V3 capture; no baked juicesharp/`pi-tui`. Composer mode is the Bot/ListTree context button (not a plus, not a labeled chip); Stay/Refine buttons and composer `n/m` chip are not shipped. Todos stay on the transcript tool row and Plan rail. Living behavior is architecture. Product, plan, and review live under [`archive/features/plan-agent`](./archive/features/plan-agent/README.md). Closure: [`archive/features/plan-agent/logs/2026-08-18-workstream-closure.md`](./archive/features/plan-agent/logs/2026-08-18-workstream-closure.md).
- **Agent-tool sandbox add-on:** accepted 2026-08-17; workstream archived 2026-08-18. Default on; fail-closed Seatbelt wrap for agent bash; healthy sandbox skips bash and in-policy `read`/`write`/`edit` asks; extra-workspace writes may still ask on `external_directory`; packaged macOS stages the pinned engine and bundled `rg`. Living behavior is architecture. Product, plan, and review live under [`archive/features/sandbox`](./archive/features/sandbox/README.md). Closure: [`archive/features/sandbox/logs/2026-08-18-workstream-closure.md`](./archive/features/sandbox/logs/2026-08-18-workstream-closure.md). Distinct from Phase F runtime extraction and from the urgent window-first track.
- **Urgent queue:** opened 2026-08-16. Priority 1 is [agent stop](./urgent/agent-stop/README.md) (proposed; not in source): bounded in-process Stop so a stuck run, permission card, or ask-user card can be cancelled; this is not crash isolation. Priority 2 is [window-first Pi core](./urgent/window-first-pi-core/README.md) (proposed; not in source): show the window before `ModelRuntime.create`; later crash isolation via `utilityProcess` is not a sandbox. See [`urgent/README.md`](./urgent/README.md).
- **Conversation UI:** active independent track for transcript, composer, project/session chrome, and shared right-sidebar host behavior under [`ui`](./ui/README.md).

Browser automation, broader shell-mutation recovery, session tree/compaction controls, multi-agent worktrees, public distribution, and remaining Pi-process isolation (if not accepted from the urgent track) remain unpromoted core research in the [`version` roadmap](./version/roadmap-vnext.md).

## Related records

Use [`archive`](./archive/README.md) for immutable history, [`version`](./version/README.md) for the current numbered core product, [`features`](./features/README.md) for current add-ons, [`urgent`](./urgent/README.md) for owner-priority work to do first, [`ui`](./ui/README.md) for conversation chrome, [`architecture`](./architecture/README.md) for accepted boundaries, and [`development.md`](./development.md) for commands and verification. Update this brief when implemented behavior or workstream status changes.
