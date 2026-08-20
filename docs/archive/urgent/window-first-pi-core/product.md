# Product: window-first Pi core

## Status

Accepted and archived urgent track. Milestone 1 was accepted 2026-08-20 with the owner's explicit waiver of its unrun packaged assertion. This is accepted startup architecture, **not** a numbered version, add-on, desktop-shell change, crash-isolation claim, or sandbox.

Personal v1–v3 remain accepted. Electron remains the accepted shell. The historical implementation contract is [`implementation-plan.md`](./implementation-plan.md); evidence is in the [Milestone 1 implementation log](./logs/2026-08-20-m1-window-first-implementation.md) and [acceptance/closure review](./logs/2026-08-20-m1-acceptance-and-closure.md).

## Outcome

The owner can open Pho Code and see the window, appearance, and recent projects **before** Pi’s `ModelRuntime` finishes constructing. Chat, models, and tools remain unavailable until the runtime is ready, and the UI says so honestly.

Moving `HarnessRuntime` into an Electron `utilityProcess` is deferred to roadmap Phase F. That future slice would be crash isolation. It is not the agent-tool sandbox, renderer sandboxing, or part of this accepted track.

## Why this is urgent, not a feature

The code is stable enough that the next complex add-ons (terminal, Plan/Agent, sandbox) will make main-process Pi **heavier**. Showing a window after that work lands will feel worse, not better. This track is a prerequisite for a trustworthy daily driver, not a new capability.

It did not belong under [`features/`](../../../features/README.md): it could not ship or fail independently of the Electron composition root. It did not belong under [`version/`](../../../version/README.md) as v4: it was not a product increment like change review. It lived in [`urgent/`](../../../urgent/README.md) until first paint no longer waited on Pi, then moved here with its closure evidence.

## Isolation glossary

Do not use “isolation” or “sandbox” without naming which boundary.

| Kind | What it stops | Pho Code today | This track |
| --- | --- | --- | --- |
| Renderer isolation | The chat page reading disk, spawning shells, or seeing tokens | **Done.** `contextIsolation`, `nodeIntegration: false`, `sandbox: true`, typed `window.phoCode` | Unchanged |
| Crash / process isolation | A hung or crashed Pi taking down the window | **Not done.** Pi runs inside Electron main | Milestone 3 (`utilityProcess`) |
| Permission isolation | Agent `bash` / file tools acting outside an OS policy | **Accepted.** [`archive/features/sandbox`](../../features/sandbox/README.md) | Out of scope here |
| Workspace trust | Project permission files becoming ambient authority | Partial (trust dialog/banner; baked features only) | Unchanged |

Renderer isolation is a Chromium UI boundary. Process isolation is a crash boundary. The sandbox add-on is an OS box for **agent `bash` children**. None of those three is the others. Settings, docs, and UI copy must stay honest.

## Current Electron shape

Two OS processes matter:

1. **Renderer** — Chromium. React UI. No `electron`, `node:*`, Pi, MCP, or PTY.
2. **Main** — Electron’s Node. Window, IPC, native pickers, quit — and **still the entire Pi runtime after background attachment**.

Preload is not a third process. It is a script in the renderer’s isolated world that exposes one method per command.

GitHub MCP, when enabled, is already a child process over stdio. Agent `bash` is already a child. The Pi SDK, baked TypeScript extensions, credentials, and session controllers are not. They share main’s address space and lifetime.

The accepted dependency direction stays:

```text
renderer -> protocol <- shell adapter -> application -> runtime -> Pi SDK
```

The protocol is JSON-safe so a later child (Node `utilityProcess`, Deno, or a Tauri sidecar) can implement the same commands and events. That seam already exists. This track uses it. It does not invent a second protocol.

## Original startup defect and implemented correction

The long launch was not “Chromium is heavy” as the only cause. Main **refused to create a window** until Pi was constructed.

Before Milestone 1, `apps/desktop/electron/main.ts` `app.whenReady()`:

1. installs the menu, CSP, metadata store;
2. `await createPhoCodeRuntime(...)`;
3. only then `createWindow()`.

`createPhoCodeRuntime` in `packages/runtime/src/pi-runtime.ts` then:

- builds the baked-feature manifest (permission, Cursor SDK, FFF, web, skills, trash, change capture);
- `await githubMcp.startIfEnabled()` — before the merged Milestone 2 cut, the disabled path still touched the token store;
- `await ModelRuntime.create({ refreshOnCreate: false, allowModelNetwork: false })`.

Milestone 1 now creates the metadata application and IPC, requests window load, then dynamically imports and constructs Pi on a caught background task. The renderer paints metadata-owned welcome/recents first and waits to load provider accounts/catalogs until `BootstrapState.piRuntime` is ready. Disabled GitHub no longer reads the token store, and disabled external skill roots are not scanned.

Two clocks:

| Clock | When | What you feel |
| --- | --- | --- |
| Developer | `bun run dev` | electron-vite compiles main, preload, and the Vite renderer **before** Electron launches, then the blocked Pi constructor |
| Packaged | `Pho Code.app` | Chromium cold start plus the same blocked Pi constructor; no Vite |

Milestone 0 measurements were explicitly deferred at closure. The structural bundle split and paint-before-Pi desktop test are not wall-clock claims.

Related UI record: [`../../../ui/logs/2026-08-16-bug-window-blocked-on-pi-boot.md`](../../../ui/logs/2026-08-16-bug-window-blocked-on-pi-boot.md).

## Selected decisions

These close the 2026-08-16 research. The first-slice decision is accepted; the process-extraction decision is deferred to Phase F.

| Decision | Selection |
| --- | --- |
| Desktop shell | **Keep Electron.** Do not port to Tauri or GPUI as the startup or isolation fix. |
| First slice | **Window and metadata chrome before `ModelRuntime.create`.** |
| Crash isolation | **Deferred to roadmap Phase F.** Electron `utilityProcess` or a Node child may use the same JSON protocol if promoted again. |
| Deno wrap of Pi | **Deferred.** Allowed only as a later *child* behind the same protocol, after Node `utilityProcess` works. Not a first-paint fix. |
| Agent `bash` OS box | **[`archive/features/sandbox`](../../features/sandbox/README.md).** Independent. |
| Owner PTY | **[`features/terminal`](../../../features/terminal/README.md).** `node-pty` stays in the Electron adapter if a Pi child is promoted later. |
| Public distribution | **Still roadmap Phase F.** Signing, notarization, Linux installers, and a public threat model are not this track. |
| Pi embedding | **Keep the pinned TypeScript SDK.** Do not fork Pi, do not switch to `pi --mode rpc` as the product runtime, do not require a user Pi CLI. |

### Why not Tauri or GPUI for this

Athas and Waku were comparison points only. Athas launches ACP CLI agents; it does not embed a TypeScript SDK. Waku spawns the user’s `pi --mode rpc`. Pho Code is a standalone harness: packaged tests launch without `pi` on `PATH`. A Tauri or GPUI move still needs Node (or an unofficial Pi rewrite). The accepted shell decision in [`desktop-shell.md`](../../../architecture/desktop-shell.md) stands.

### Why Deno is later, not first

Deno would be a **host for the Pi child**, not a replacement for Electron. It does not skip Chromium. It does not reorder `createWindow()`. Official Pi does not support Deno; community `pi-deno-runtime` patches HTTP because npm `undici` fails. This repo already externalizes Node-API natives (`fff-node`, `ffi-rs`, `photon-node`; later `node-pty` in the adapter). Deno permissions only help if they *deny*; a coding agent that writes files and runs bash still needs workspace read/write/run plus provider net — close to today’s trusted-owner model.

Prototype Deno only after Milestone 3, against one real session with permission dialogs, cancellation, and packaged sidecar lifecycle. Until then it is research, not a pin.

## User-visible Milestone 1 contract

- Launching the app shows a window without waiting for Pi construction to finish.
- Welcome / recents / appearance can render from `app-metadata.json` and `nativeTheme` while Pi is booting.
- While Pi is booting, the owner cannot send a prompt, change models, or open a session that needs the SDK. Controls are disabled or show a bounded “Starting Pi…” status.
- A Pi boot failure does not leave a blank window. It shows a recoverable error and does not delete sessions.
- After Pi is ready, behavior matches today’s bootstrap: recents, optional last-workspace restore only if that restore already exists (today it does not auto-open a session at launch).

## Trust and honesty

Keep the personal-trust policy. Adding `utilityProcess` does **not** let copy say:

- “sandboxed agent”;
- “isolated from your files”;
- “safer than Electron.”

Allowed: “the chat UI stays up if the agent process crashes.” Required somewhere in Settings/About if Milestone 3 ships: Pi still runs with the app user’s authority; renderer sandboxing is unchanged; the sandbox add-on is a separate OS box for agent `bash`.

## Non-goals

This track will not:

- change the accepted Electron shell;
- introduce Tauri, GPUI, or a general Rust rewrite;
- wrap Pi in Deno as a Milestone 1–3 requirement;
- extract credentials, JSONL, or MCP into a different trust domain;
- sandbox baked TypeScript extensions;
- move `node-pty` into the Pi child;
- auto-open the last chat as a new launch behavior;
- claim public-release hardening;
- block terminal, Plan/Agent, or sandbox implementation.

## Related work

- Architecture (accepted): [`desktop-shell.md`](../../../architecture/desktop-shell.md), [`overview.md`](../../../architecture/overview.md), [`protocol-and-ipc.md`](../../../architecture/protocol-and-ipc.md)
- Phase F (public distribution + deferred process extraction): [`roadmap-vnext.md`](../../../version/roadmap-vnext.md)
- Native-code / no Rust rewrite: [`research-backlog.md`](../../../version/research-backlog.md)
- Sandbox add-on: [`archive/features/sandbox/product.md`](../../features/sandbox/product.md)
- Terminal add-on: [`features/terminal/product.md`](../../../features/terminal/product.md)
- Research: [`2026-08-16 handoff`](./logs/2026-08-16-research-handoff.md), [`2026-08-20 implementation research`](./logs/2026-08-20-implementation-research.md)
- Bounded Stop (accepted and archived separately): [`agent-stop`](../agent-stop/product.md)
