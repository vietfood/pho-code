# Window and chrome wait on Pi boot

Status: accepted and closed 2026-08-20
Surface: app launch / welcome shell
Owner: archived [`window-first-pi-core`](../../archive/urgent/window-first-pi-core/README.md)
Owning plan: [`implementation-plan.md`](../../archive/urgent/window-first-pi-core/implementation-plan.md)
Related logs: [`research handoff`](../../archive/urgent/window-first-pi-core/logs/2026-08-16-research-handoff.md), [`implementation research`](../../archive/urgent/window-first-pi-core/logs/2026-08-20-implementation-research.md), [`implementation`](../../archive/urgent/window-first-pi-core/logs/2026-08-20-m1-window-first-implementation.md), [`closure`](../../archive/urgent/window-first-pi-core/logs/2026-08-20-m1-acceptance-and-closure.md), [`UI change`](./2026-08-20-change-window-first-startup-status.md)

## Expected

The Electron window appears as soon as Chromium can paint. Recents, appearance, and the welcome launcher can come from application metadata. Pi construction (`ModelRuntime.create`, baked-feature wiring) may still be in progress and must show an honest “Pi not ready” state rather than blocking the first pixel.

## Original behavior

`apps/desktop/electron/main.ts` calls `createWindow()` only after `await createPhoCodeRuntime(...)`. The renderer `App` then returns a full-window “Loading…” state until `getBootstrapState`, `getSettings`, and `listProviderAccounts` all resolve.

## Original evidence

Read the `app.whenReady()` handler in `apps/desktop/electron/main.ts` (runtime await, then `createWindow()`). Read `apps/desktop/src/App.tsx` (`if (!bootstrap) { … Loading… }`). `createPhoCodeRuntime` in `packages/runtime/src/pi-runtime.ts` awaits `githubMcp.startIfEnabled()` (token-store touch even when GitHub MCP is off) and `ModelRuntime.create(...)` before returning.

Not verified: wall-clock milliseconds on this machine. The 2026-08-20 research discarded an ad-hoc source-built timing attempt after the outer harness timed out. The owner explicitly deferred all five timing clocks at closure; no speedup claim is accepted.

## Changes and decisions

Fixed through a stable application runtime host, startup-safe IPC, a window load request before a caught dynamic runtime import, metadata-first renderer bootstrap, and separate starting/ready/failed status. Disabled GitHub no longer reads the secret store; disabled skill roots are not walked.

## Verification

Desktop verified: the deterministic boot gate proves welcome/recents before Pi, stable `runtime_unavailable`, ready transition plus normal chat, bounded failure chrome, and quit while held. See the implementation log for commands and counts. Packaged behavior and wall-clock timing remain unverified.

## Mistakes and corrections

Do not call this “Electron is slow” as the only cause. Dev `bun run dev` also pays electron-vite compile; packaged launch still waits on the in-process Pi constructor.

## Fix or handoff

The defect is accepted as closed on desktop evidence with an explicit owner waiver of packaged verification. Packaged behavior remains unverified. Pi process extraction is deferred to roadmap Phase F; do not treat a Tauri/GPUI/Deno shell change as this fix.
