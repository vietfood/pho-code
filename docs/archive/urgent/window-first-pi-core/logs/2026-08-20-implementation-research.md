# Window-first Pi core implementation research

Status: implementation-ready research; Milestone 0 timing gate still open
Owner: urgent/window-first-pi-core
Plan: [`../implementation-plan.md`](../implementation-plan.md)
Related logs: [`2026-08-16-research-handoff.md`](./2026-08-16-research-handoff.md), [`../../../../ui/logs/2026-08-16-bug-window-blocked-on-pi-boot.md`](../../../../ui/logs/2026-08-16-bug-window-blocked-on-pi-boot.md), [`../../../../features/terminal/logs/2026-08-16-related-urgent-window-first.md`](../../../../features/terminal/logs/2026-08-16-related-urgent-window-first.md), [`agent-stop closure`](../../agent-stop/logs/2026-08-20-m2-acceptance-and-closure.md)

## Intent

Turn the existing window-first proposal into a clean implementation shape grounded in the current composition root, the installed Pi `0.84.1` implementation, and Electron's supported lifecycle. This record changes no runtime behavior.

## Conclusion

Milestone 1 should be a small same-process startup reorder with one attachable runtime owner:

1. after `app.whenReady()`, install menu/security and resolve application-data paths;
2. load metadata, apply appearance, create a metadata-capable application facade, and register startup-safe IPC;
3. create/load the `BrowserWindow` and paint recents/welcome chrome;
4. dynamically import `@pho-code/runtime` on a caught background task after window loading has been requested (do not wait for `ready-to-show`, because boot and renderer should overlap);
5. construct `createPhoCodeRuntime()` in the background and attach it through a narrow runtime-host state machine;
6. publish ready or failed and let the renderer refresh from authoritative bootstrap state.

Do not implement this as a global variable swap or an unobserved `void createPhoCodeRuntime()`. Do not split Pi service objects in Milestone 1. Milestone 3 should move the complete `HarnessRuntime` ownership unit into `utilityProcess`, not distribute `ModelRuntime`, `SettingsManager`, and `AgentSessionRuntime` across both processes.

## Current source findings

- `apps/desktop/electron/main.ts` awaits `createPhoCodeRuntime()`, constructs `ApplicationService`, registers IPC, opens the injected test workspace, and only then calls `createWindow()`. First paint therefore waits on the whole runtime path.
- The main process has top-level runtime value imports. Merely moving the `await` later still parses the Pi/provider/native graph before `app.whenReady()`. Keep `HarnessRuntime` as a type-only import and dynamically import runtime factories after starting window load.
- `apps/desktop/electron/image-ingest.ts` also imports `sniffImageMime` from the broad runtime barrel, so changing only `main.ts` does not sever the eager graph. Move that pure helper behind a narrow runtime subpath or into a shell/protocol-safe module, and add a static boundary check that eager Electron modules do not import the broad runtime entry.
- Every IPC handler resolves the current `ApplicationService` through `requireApplication()`. Handlers must exist before renderer load, so a startup facade/host is required rather than registering IPC after Pi.
- `packages/runtime/src/harness-runtime.ts` already proves the desired unavailable behavior: `createDisposableStubHarnessRuntime()` reports `piRuntime: false` and stable `runtimeUnavailable` errors. The current application closes over one runtime instance, so the production solution should be an attachable delegating host with the same interface, not repeated application reconstruction.
- `apps/desktop/src/App.tsx` initially awaits `getBootstrapState`, `getSettings`, and `listProviderAccounts` together. Provider accounts are Pi-backed, so this all-or-nothing load would still hide metadata chrome. Fetch bootstrap first; while `piRuntime` is false, use metadata appearance plus bounded empty runtime settings/accounts, then refresh Pi-backed state on ready.
- Runtime-ready events are hints, not authority: Pi may finish before the renderer subscribes. `getBootstrapState()` must always expose the current status.
- `createPhoCodeRuntime()` currently performs permission setup, resource/native feature resolution, retrieval/web/sandbox construction, GitHub MCP startup, and `ModelRuntime.create()` before resolving.
- `githubMcp.startIfEnabled()` reads the secret store even when disabled. Milestone 2 should remove that disabled-path read rather than merely schedule it later.
- Skill discovery also performs avoidable synchronous work twice: the registry scans at construction (including disabled external roots), then `ApplicationService` unconditionally reapplies enabled sources and causes another scan. Pass metadata-enabled sources into runtime construction and make an unchanged normalized source set a no-op.
- Runtime construction is not transactional. If boot fails after a child/service starts, partial resources and `PI_CODING_AGENT_DIR` state are not rolled back. A retry control must wait until cleanup ownership exists; Milestone 1 may show a stable failed state without retry if transactional cleanup is not completed in the same slice.

## Runtime-host contract

Use one small owner with states `starting -> ready | failed -> stopping` and a monotonically increasing boot generation.

- Metadata-only operations succeed while starting.
- Pi-backed commands return the existing stable `runtimeUnavailable` error while starting or failed.
- `getBootstrapState()` reports `capabilities.piRuntime: false` plus a bounded boot status/failure projection; do not add a generic invoke channel.
- Attach exactly one resolved runtime for the active generation and forward its events.
- If quit starts before boot resolves, refuse late attachment and dispose the late runtime.
- Catch and redact every boot failure; never leave an unhandled startup promise.
- Retry, if promoted, starts a new generation only after partial-startup cleanup finishes.

The minimal protocol addition is a global runtime-status wakeup (`starting`, `ready`, or `failed` with bounded non-secret copy). The renderer must still query bootstrap after receiving it. Do not inject an independently sequenced shell event naively into the runtime event stream: both producers begin at low sequence numbers and the reducer drops `sequence <= lastSequence`. Either resequence every shell/runtime event through one main-process broker (the better preparation for child restart) or use a separate narrow lifecycle subscription.

## Electron details

- Create `BrowserWindow` only after `app.whenReady()`; register `ipcMain.handle` before `loadURL`/`loadFile`.
- Current `show: !testMode` makes the later `ready-to-show` `show()` redundant in production. Start Milestone 1 with `show: false` and show on `ready-to-show`, using the existing matching `backgroundColor`; measure before choosing immediate show.
- `ready-to-show` proves a first frame, not that recents/welcome rendered. Add a renderer paint acknowledgement after metadata bootstrap and one `requestAnimationFrame` for the product clock.
- Keep the protocol JSON-safe even though Electron IPC supports Structured Clone.
- Defer expensive imports/work from main's critical path; dynamic runtime import is the structural performance win.

Primary Electron sources: [app lifecycle](https://www.electronjs.org/docs/latest/api/app), [BrowserWindow showing guidance](https://www.electronjs.org/docs/latest/api/browser-window), [IPC tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc), [performance guide](https://www.electronjs.org/docs/latest/tutorial/performance), [utility process](https://www.electronjs.org/docs/latest/api/utility-process), and [native modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules).

## Pinned Pi findings

- `ModelRuntime.create({ refreshOnCreate: false, allowModelNetwork: false })` still imports/composes the built-in providers, reads local model configuration, creates stores, and rebuilds the catalog. The flags skip network refresh; they do not make construction free.
- `ModelRegistry` is a synchronous compatibility facade over the shared `ModelRuntime`; it has no independent lifecycle.
- `SettingsManager.create()` performs synchronous configuration reads under a synchronous lock. Writes need `flush()` for a durability boundary; there is no dispose method.
- `createAgentSessionServices()` reuses `ModelRuntime` but creates cwd-bound settings/resource services and reloads resources when a workspace session opens. That is prompt/session readiness work, distinct from bare Pi-runtime readiness.
- `AgentSessionRuntime` owns a session plus cwd services. Pho Code must retain its bounded abort and settings flush before disposal.
- `ModelRuntime` has no dispose API. The meaningful cleanup owner is the complete Pho Code `HarnessRuntime` graph.

Pinned-source references: [ModelRuntime `v0.84.1`](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/src/core/model-runtime.ts), [SettingsManager `v0.84.1`](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/src/core/settings-manager.ts), [agent session services `v0.84.1`](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/src/core/agent-session-services.ts), [AgentSessionRuntime `v0.84.1`](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/src/core/agent-session-runtime.ts), and the [Pi SDK guide](https://pi.dev/docs/latest/sdk).

## Milestone 3 boundary

Main keeps window, metadata, sender validation, native dialogs/pickers, appearance, quit, and the owner PTY. The utility child owns Pi, session controllers, baked feature/resource loading, retrieval/web, sandbox adapters, and GitHub MCP.

Child startup configuration must be JSON data. Current runtime options contain functions and service objects; reconstruct child-owned services inside the child and proxy host-only actions such as validated OAuth URL opening through named messages. Use request IDs, event sequence numbers, and boot generations; reject pending commands on child exit. Graceful shutdown sends a typed command under the existing outer deadline, then kills a non-responsive child. A child crash marks Pi failed and leaves the window and session files intact.

Before Milestone 3, resolve the synchronous `HarnessRuntime` getter mismatch: either make those operations asynchronous or maintain explicit authoritative cached projections in the proxy. Never fake synchronous cross-process access.

## Measurement and verification design

Add application-owned marks before claiming a speedup:

- OS process creation (`process.getCreationTime()`), main module evaluation, `whenReady`, before/after window construction, and `ready-to-show`;
- runtime import start/end, runtime boot start/ready/fail, and application attachment;
- preload loaded, React mounted, metadata bootstrap received, and welcome/recents painted after `requestAnimationFrame`;
- session creation and first prompt admission as a separate prompt-ready clock.

Use at least five cold and five warm source-development runs and report median plus range. Do not compare electron-vite compilation time with an artifact launch. The owner explicitly requested no packaged build/test on this machine, so packaged clocks remain **not verified** here.

The attempted ad-hoc repeated source-built measurement was discarded: its outer harness timed out during repeated launch/cleanup and left isolated Electron processes, which were stopped by exact PID; the four owned temp roots were moved to Trash. No partial number is evidence. Milestone 0 remains open until in-app marks produce trustworthy clocks.

For deterministic desktop proof, add a controllable runtime-boot gate, not sleeps:

1. hold Pi boot;
2. assert the window and welcome/recents paint with `piRuntime: false`;
3. assert a Pi command returns `runtimeUnavailable` promptly;
4. release boot and assert the ready event plus authoritative refresh;
5. run normal deterministic chat;
6. add a boot-failure case showing recoverable chrome and untouched sessions.

## Verification

- **static/source verified:** current composition, renderer bootstrap, runtime stub, GitHub MCP disabled path, and installed Pi `0.84.1` sources/typings were inspected.
- **primary-source verified:** Electron lifecycle/performance/utility-process and tagged Pi sources above.
- **not verified:** source dev timing, packaged timing, window-first behavior, runtime failure UI, retry, and utility-process crash survival. No behavior change was made.

## Handoff

Implement measurement marks/test boot gate first or alongside Milestone 1. Keep Milestone 1 and Milestone 3 separate reviews. The first source slice should own the runtime host, metadata bootstrap, dynamic import, renderer status, and deterministic window-before-runtime test; it should not also introduce `utilityProcess`.
