# Window-first Pi core research handoff

Status: ready for review  
Owner: urgent/window-first-pi-core  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`../../../ui/logs/2026-08-16-bug-window-blocked-on-pi-boot.md`](../../../ui/logs/2026-08-16-bug-window-blocked-on-pi-boot.md), [`../../../features/sandbox/logs/2026-08-16-related-urgent-window-first.md`](../../../features/sandbox/logs/2026-08-16-related-urgent-window-first.md), [`../../../features/terminal/logs/2026-08-16-related-urgent-window-first.md`](../../../features/terminal/logs/2026-08-16-related-urgent-window-first.md)

## Intent

Record 2026-08-16 owner research: keep Electron, treat long startup as a composition-order defect, define isolation honestly, and park Deno as a later Pi-child experiment. Open `docs/urgent/` so this work is visible before more complex features land.

## Contracts and files

- Product: [`../product.md`](../product.md)
- Plan: [`../implementation-plan.md`](../implementation-plan.md)
- Queue: [`../../README.md`](../../README.md)
- Accepted shell (unchanged): [`../../../architecture/desktop-shell.md`](../../../architecture/desktop-shell.md)
- Evidence in source: `apps/desktop/electron/main.ts` `app.whenReady`; `packages/runtime/src/pi-runtime.ts` `createPhoCodeRuntime`; `apps/desktop/src/App.tsx` Loading gate

## Changes and decisions

1. **Keep Electron.** Tauri (Athas-style) and GPUI (Waku-style) are different products: ACP CLIs vs installed `pi --mode rpc`. They are not the startup fix.
2. **Urgent track, not a feature add-on.** Window-first cannot ship independently of the Electron composition root.
3. **Four isolation words.** Renderer isolation is done. Crash isolation is Milestone 3. Permission isolation is `features/sandbox`. Workspace trust stays as today.
4. **Startup cause.** `createWindow()` is after `await createPhoCodeRuntime()`. Dev also pays electron-vite. Packaged still waits on Pi.
5. **Deno.** Deferred child after `utilityProcess`. Not a first-paint tool. Pi is unofficial on Deno; this repo has Node-API natives.
6. **Do not block** terminal, Plan/Agent, or sandbox on this track. PTY stays in the Electron adapter if Pi moves.

## Verification

Not verified: wall-clock startup. That is Milestone 0.

Code-path evidence is from reading source on 2026-08-16, not from a timed launch.

## Mistakes and corrections

Do not describe renderer `sandbox: true` as isolating Pi. Do not describe `utilityProcess` as the sandbox add-on. Do not treat community `pi-deno-runtime` as a supported pin.

## Owner feedback

Owner asked for an optimized Pi core, compared Athas/Waku only as references, asked what isolation means, and reported a really long startup. Owner then asked for comprehensive docs, either under features or a new **urgent** queue for work to do first.

## UI impact

Welcome/Loading chrome will change in Milestone 1. No UI change in this documentation-only slice.

## Blockers and handoff

Implementation starts when the owner promotes Milestone 0 (measure) or Milestone 1 (window first). Architecture pages must keep describing the current blocked-boot order until Milestone 1 is accepted.
