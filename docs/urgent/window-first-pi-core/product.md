# Product: window-first Pi core

## Status

Proposed urgent track, queued 2026-08-16. This is **not** accepted architecture, **not** a numbered version, **not** an add-on, and **not** a desktop-shell change.

Personal v1–v3 remain accepted. Electron remains the accepted shell. The implementation contract is [`implementation-plan.md`](./implementation-plan.md). Status stays **Proposed** until the owner promotes a milestone; then **In implementation** until that milestone’s gate passes.

## Outcome

The owner can open Pho Code and see the window, appearance, and recent projects **before** Pi’s `ModelRuntime` finishes constructing. Chat, models, and tools remain unavailable until the runtime is ready, and the UI says so honestly.

A later slice may move `HarnessRuntime` into an Electron `utilityProcess` so a hung or crashed Pi does not take down the window. That slice is crash isolation. It is not the agent-tool sandbox, not renderer sandboxing, and not a public-distribution phase.

## Why this is urgent, not a feature

The code is stable enough that the next complex add-ons (terminal, Plan/Agent, sandbox) will make main-process Pi **heavier**. Showing a window after that work lands will feel worse, not better. This track is a prerequisite for a trustworthy daily driver, not a new capability.

It does not belong under [`features/`](../../features/README.md): it cannot ship or fail independently of the Electron composition root. It does not belong under [`version/`](../../version/README.md) as v4: it is not a product increment like change review. It belongs in [`urgent/`](../README.md) until first paint no longer waits on Pi.

## Isolation glossary

Do not use “isolation” or “sandbox” without naming which boundary.

| Kind | What it stops | Pho Code today | This track |
| --- | --- | --- | --- |
| Renderer isolation | The chat page reading disk, spawning shells, or seeing tokens | **Done.** `contextIsolation`, `nodeIntegration: false`, `sandbox: true`, typed `window.phoCode` | Unchanged |
| Crash / process isolation | A hung or crashed Pi taking down the window | **Not done.** Pi runs inside Electron main | Milestone 3 (`utilityProcess`) |
| Permission isolation | Agent `bash` / file tools acting outside an OS policy | **Not done.** Owner-approved as [`features/sandbox`](../../features/sandbox/README.md) | Out of scope here |
| Workspace trust | Project permission files becoming ambient authority | Partial (trust dialog/banner; baked features only) | Unchanged |

Renderer isolation is a Chromium UI boundary. Process isolation is a crash boundary. The sandbox add-on is an OS box for **agent `bash` children**. None of those three is the others. Settings, docs, and UI copy must stay honest.

## Current Electron shape

Two OS processes matter:

1. **Renderer** — Chromium. React UI. No `electron`, `node:*`, Pi, MCP, or PTY.
2. **Main** — Electron’s Node. Window, IPC, native pickers, quit — and **today the entire Pi runtime**.

Preload is not a third process. It is a script in the renderer’s isolated world that exposes one method per command.

GitHub MCP, when enabled, is already a child process over stdio. Agent `bash` is already a child. The Pi SDK, baked TypeScript extensions, credentials, and session controllers are not. They share main’s address space and lifetime.

The accepted dependency direction stays:

```text
renderer -> protocol <- shell adapter -> application -> runtime -> Pi SDK
```

The protocol is JSON-safe so a later child (Node `utilityProcess`, Deno, or a Tauri sidecar) can implement the same commands and events. That seam already exists. This track uses it. It does not invent a second protocol.

## Observed startup defect

The long launch is not “Chromium is heavy” as the only cause. Main **refuses to create a window** until Pi is constructed.

In `apps/desktop/electron/main.ts`, `app.whenReady()`:

1. installs the menu, CSP, metadata store;
2. `await createPhoCodeRuntime(...)`;
3. only then `createWindow()`.

`createPhoCodeRuntime` in `packages/runtime/src/pi-runtime.ts` currently:

- builds the baked-feature manifest (permission, Cursor SDK, FFF, web, skills, trash, change capture);
- `await githubMcp.startIfEnabled()` — even when GitHub MCP is off, this still touches the token store;
- `await ModelRuntime.create({ refreshOnCreate: false, allowModelNetwork: false })`.

The renderer then paints a full-window “Loading…” until `getBootstrapState`, `getSettings`, and `listProviderAccounts` return (`apps/desktop/src/App.tsx`).

Two clocks:

| Clock | When | What you feel |
| --- | --- | --- |
| Developer | `bun run dev` | electron-vite compiles main, preload, and the Vite renderer **before** Electron launches, then the blocked Pi constructor |
| Packaged | `Pho Code.app` | Chromium cold start plus the same blocked Pi constructor; no Vite |

Milestone 0 must measure both. Do not optimize from anecdote after the first slice.

Related UI record: [`../../ui/logs/2026-08-16-bug-window-blocked-on-pi-boot.md`](../../ui/logs/2026-08-16-bug-window-blocked-on-pi-boot.md).

## Selected decisions

These close the 2026-08-16 research. They are product decisions for this track, not accepted architecture until implemented.

| Decision | Selection |
| --- | --- |
| Desktop shell | **Keep Electron.** Do not port to Tauri or GPUI as the startup or isolation fix. |
| First slice | **Window and metadata chrome before `ModelRuntime.create`.** |
| Crash isolation | **Electron `utilityProcess` (or a Node child using the same JSON protocol)** after window-first is accepted. Same Pi SDK, same OS user. |
| Deno wrap of Pi | **Deferred.** Allowed only as a later *child* behind the same protocol, after Node `utilityProcess` works. Not a first-paint fix. |
| Agent `bash` OS box | **[`features/sandbox`](../../features/sandbox/README.md).** Independent. Must not wait on this track. |
| Owner PTY | **[`features/terminal`](../../features/terminal/README.md).** `node-pty` stays in the Electron adapter, not inside the Pi child. |
| Public distribution | **Still roadmap Phase F.** Signing, notarization, Linux installers, and a public threat model are not this track. |
| Pi embedding | **Keep the pinned TypeScript SDK.** Do not fork Pi, do not switch to `pi --mode rpc` as the product runtime, do not require a user Pi CLI. |

### Why not Tauri or GPUI for this

Athas and Waku were comparison points only. Athas launches ACP CLI agents; it does not embed a TypeScript SDK. Waku spawns the user’s `pi --mode rpc`. Pho Code is a standalone harness: packaged tests launch without `pi` on `PATH`. A Tauri or GPUI move still needs Node (or an unofficial Pi rewrite) and would delay terminal, sandbox, and window-first work. The accepted shell decision in [`desktop-shell.md`](../../architecture/desktop-shell.md) stands.

### Why Deno is later, not first

Deno would be a **host for the Pi child**, not a replacement for Electron. It does not skip Chromium. It does not reorder `createWindow()`. Official Pi does not support Deno; community `pi-deno-runtime` patches HTTP because npm `undici` fails. This repo already externalizes Node-API natives (`fff-node`, `ffi-rs`, `photon-node`; later `node-pty` in the adapter). Deno permissions only help if they *deny*; a coding agent that writes files and runs bash still needs workspace read/write/run plus provider net — close to today’s trusted-owner model.

Prototype Deno only after Milestone 3, against one real session with permission dialogs, cancellation, and packaged sidecar lifecycle. Until then it is research, not a pin.

## User-visible contract (once Milestone 1 exists)

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

- Architecture (accepted): [`desktop-shell.md`](../../architecture/desktop-shell.md), [`overview.md`](../../architecture/overview.md), [`protocol-and-ipc.md`](../../architecture/protocol-and-ipc.md)
- Phase F (public distribution + process extraction as a later numbered-version phase): [`roadmap-vnext.md`](../../version/roadmap-vnext.md)
- Native-code / no Rust rewrite: [`research-backlog.md`](../../version/research-backlog.md)
- Sandbox add-on: [`features/sandbox/product.md`](../../features/sandbox/product.md)
- Terminal add-on: [`features/terminal/product.md`](../../features/terminal/product.md)
- Research log: [`logs/2026-08-16-research-handoff.md`](./logs/2026-08-16-research-handoff.md)
- Bounded Stop (separate urgent track): [`../agent-stop/product.md`](../agent-stop/product.md)
