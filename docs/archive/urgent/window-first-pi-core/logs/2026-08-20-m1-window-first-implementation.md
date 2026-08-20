# Milestone 1 window-first implementation

Status: implemented and desktop verified 2026-08-20; acceptance pending packaged evidence and owner review
Owner: urgent/window-first-pi-core
Plan: [`../implementation-plan.md`](../implementation-plan.md) Milestones 1 and selected Milestone 2 cuts
UI record: [`../../../../ui/logs/2026-08-20-change-window-first-startup-status.md`](../../../../ui/logs/2026-08-20-change-window-first-startup-status.md)

## Intent

Render the application window and metadata-owned welcome chrome before importing or constructing Pi, while preserving one application instance, stable typed commands, bounded failure, and bounded shutdown.

## Implementation

- `ApplicationRuntimeHost` is one attachable/delegating owner with authoritative `starting`, `ready`, and redacted `failed` states. It retains pre-attach runtime-event subscribers and skill settings, forwards one attached runtime, and disposes a runtime that resolves after shutdown.
- `BootstrapState.piRuntime` is the authoritative JSON-safe state. `capabilities.piRuntime` remains true only when ready. A separate `subscribePiRuntimeStatus` wakeup avoids collisions with Pi runtime event sequence numbers; the renderer always refreshes bootstrap after the hint.
- Electron creates the metadata store/application, applies appearance, registers IPC, and requests window load before a caught background task dynamically imports `@pho-code/runtime` and calls `createPhoCodeRuntime`.
- The eager main entry keeps only an erased `HarnessRuntime` type import. Native image admission imports `@pho-code/runtime/image-bytes`, a narrow pure subpath, instead of the broad runtime barrel.
- The renderer fetches bootstrap and metadata-safe settings first. Provider accounts and session catalogs wait until Pi is ready. Welcome/recents remain visible with **Starting Pi…** or a bounded failure, and Pi-backed controls remain disabled.
- A test-only absolute file gate holds runtime boot deterministically. A separate failure seam proves the failed state without sleeps. Quit checks the shared shutdown state so a held or late boot cannot attach.

## Critical-path cuts merged from Milestone 2

- Disabled GitHub MCP no longer reads the secret store.
- Runtime construction receives metadata-enabled skill sources on its first scan.
- Disabled external skill roots are not walked, and applying the same normalized enabled set is a no-op.

Enabled GitHub behavior remains unchanged: enabling reads the credential and starts the reviewed stdio server path.

## Structural performance evidence

The source build now produces a `144.44 kB` eager Electron main entry plus a dynamically imported `1,974.53 kB` runtime chunk. Before this change the main entry was one `2,091.41 kB` bundle. This proves the Pi/runtime graph left the eager entry; it is not a wall-clock startup claim.

## Verification

Run 2026-08-20 in this workspace:

- **unit verified:** 77 focused protocol, application-host, runtime-startup-cut, UI-status, and desktop-boundary tests passed.
- **static verified:** `bun run typecheck` passed; `bun run lint` completed with zero errors and the eight pre-existing React hook warnings.
- **source build verified:** `bun run --filter @pho-code/desktop build` passed and emitted the split main/runtime chunks above.
- **desktop verified:** the new `window-first.spec.ts` passed 3/3: held boot with rendered metadata recents plus prompt rejection then normal chat, boot failure with live chrome, and quit during held boot. The focused startup/chat/shutdown/Stop regression lane passed 11/11.
- **full desktop verified:** `bun run test:desktop` passed 28/28, including all existing chat, lifecycle, sandbox, Stop, settings, security, and shutdown journeys plus the three new startup journeys. The command's source build reproduced the `144.44 kB` eager entry and `1,974.53 kB` lazy runtime chunk.
- **full Bun suite classified:** `bun test` finished with 670 pass and 12 failures. The failures are confined to the pre-existing real-Pi and OS-sandbox environment-sensitive suites; the new protocol, application-host, runtime-startup-cut, UI-status, and eager-boundary tests passed. This gate is not green and is not reported as such.
- **not run:** package build and packaged tests, per the owner's instruction not to package on this machine.
- **not verified:** cold/warm wall-clock medians, Linux, retry after failed partial construction, or `utilityProcess` crash survival.

## Remaining acceptance gap

Milestone 1 is implemented but not marked accepted because its plan requires the packaged assertion and the owner explicitly excluded package work on this machine. Milestone 0 timing also remains open; do not turn the structural chunk split into an unsupported latency number.

Milestone 3 remains separate: Pi still shares Electron main and a crash or busy loop can still freeze the window. Moving the complete `HarnessRuntime` to `utilityProcess` must not be described as a sandbox.
