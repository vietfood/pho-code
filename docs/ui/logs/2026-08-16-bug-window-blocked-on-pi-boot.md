# Window and chrome wait on Pi boot

Status: open  
Surface: app launch / welcome shell  
Owner: [`urgent/window-first-pi-core`](../../urgent/window-first-pi-core/README.md)  
Owning plan: [`../../urgent/window-first-pi-core/implementation-plan.md`](../../urgent/window-first-pi-core/implementation-plan.md)  
Related logs: [`../../urgent/window-first-pi-core/logs/2026-08-16-research-handoff.md`](../../urgent/window-first-pi-core/logs/2026-08-16-research-handoff.md)

## Expected

The Electron window appears as soon as Chromium can paint. Recents, appearance, and the welcome launcher can come from application metadata. Pi construction (`ModelRuntime.create`, baked-feature wiring) may still be in progress and must show an honest “Pi not ready” state rather than blocking the first pixel.

## Actual

`apps/desktop/electron/main.ts` calls `createWindow()` only after `await createPhoCodeRuntime(...)`. The renderer `App` then returns a full-window “Loading…” state until `getBootstrapState`, `getSettings`, and `listProviderAccounts` all resolve.

## Reproduction / evidence

Read the `app.whenReady()` handler in `apps/desktop/electron/main.ts` (runtime await, then `createWindow()`). Read `apps/desktop/src/App.tsx` (`if (!bootstrap) { … Loading… }`). `createPhoCodeRuntime` in `packages/runtime/src/pi-runtime.ts` awaits `githubMcp.startIfEnabled()` (token-store touch even when GitHub MCP is off) and `ModelRuntime.create(...)` before returning.

Not verified: wall-clock milliseconds on this machine. That is Milestone 0 of the urgent plan.

## Changes and decisions

None in source. Track opened 2026-08-16.

## Verification

Not verified: no startup timing or window-first behavior exists yet.

## Mistakes and corrections

Do not call this “Electron is slow” as the only cause. Dev `bun run dev` also pays electron-vite compile; packaged launch still waits on the in-process Pi constructor.

## Fix or handoff

Implement Milestone 1 in the urgent plan. Do not treat a Tauri/GPUI/Deno shell change as the fix.
