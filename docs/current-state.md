# Pho Code: current state

Last updated: 2026-08-13

## What exists today

Pho Code is a personal macOS-first Electron application built directly on Pi SDK `0.84.1`. It currently has:

- a sandboxed React renderer behind a narrow typed Electron bridge;
- local workspace selection and recent-project navigation;
- persistent Pi JSONL sessions with new, list, open, resume, and immediate sidebar state;
- real provider/model discovery plus model and thinking-level selection;
- multi-turn streaming chat, thinking blocks, sanitized Markdown with KaTeX/Shiki/Mermaid, tool activity, Stop, and error states;
- a T3-inspired conversation UI with project/session sidebar, a centered empty-session composer, and an anchored composer after the first message;
- a source-controlled baked-feature manifest that ignores arbitrary global/project extensions, skills, prompts, and themes;
- `@gotgenes/pi-permission-system` `24.0.0` as the first baked feature;
- desktop confirm/select/input permission dialogs, approval-for-session, denial reasons, notifications, cancellation, and session rebind;
- typed Settings for system/light/dark appearance and Guarded/Balanced permission presets, with Custom preservation, a confirmed YOLO control, and honest private/shared data-scope disclosure;
- in-app provider API-key import that never returns stored secrets to the renderer;
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

The acceptance review additionally made packaged resource overrides development-only and added pinned-version validation for the permission feature. See the [Milestone 5 code review](./reviews/milestone-5-code-review.md).

## Next-version work

- additional baked extensions or skills;
- specified MCP-backed features or MCP management;
- signed/notarized public installers, updates, or verified Linux artifacts;
- containers, runtime sandboxing, automated package auditing, or production isolation;
- multi-agent orchestration, worktrees, terminal, diff editor, attachments, or session-tree UI.
- session archive/delete UI; the app-owned session root now gives that future feature a clear ownership boundary, and deletion must remain recoverable.

These are not unfinished v1 milestones. They are organized in the [next-version roadmap](./roadmap-vnext.md) and should be promoted into an implementation milestone only when the owner selects a concrete capability.

## Run it

```bash
bun install --frozen-lockfile
bun run dev
```

Use [`implementation-plan.md`](./implementation-plan.md) for the closed v1 record, [`reviews/milestone-5-code-review.md`](./reviews/milestone-5-code-review.md) for v1 acceptance, and [`roadmap-vnext.md`](./roadmap-vnext.md) for later work. Update this brief when the accepted product boundary changes.
