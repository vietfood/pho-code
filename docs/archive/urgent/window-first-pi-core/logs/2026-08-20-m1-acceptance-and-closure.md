# Milestone 1 acceptance and window-first closure

Status: accepted and archived 2026-08-20
Owner: archived urgent/window-first-pi-core
Plan: [`../implementation-plan.md`](../implementation-plan.md) Milestone 1, selected Milestone 2 cuts, and track closure gate
Implementation evidence: [`2026-08-20-m1-window-first-implementation.md`](./2026-08-20-m1-window-first-implementation.md)
UI evidence: [`../../../../ui/logs/2026-08-20-change-window-first-startup-status.md`](../../../../ui/logs/2026-08-20-change-window-first-startup-status.md)

## Verdict

Milestone 1 and the complete window-first urgent track are **accepted and closed**. The owner first prohibited package work on this machine, then explicitly directed the work to continue until it could be archived. That direction is the acceptance exception for the plan's packaged Milestone 1 assertion: packaged window-first behavior was **waived and not verified**, not passed.

The accepted behavior is the same-process startup reorder. Electron creates the metadata-backed application, registers IPC, constructs the window, and requests renderer load before dynamically importing or constructing Pi. Welcome chrome and recents render while Pi reports `starting`; Pi-backed commands fail promptly with `runtime_unavailable`; a redacted boot failure leaves the window alive; a late runtime cannot attach after shutdown.

## Accepted evidence

Run 2026-08-20 in this workspace:

- **unit/integration verified:** 77 focused protocol, application-host, runtime-startup-cut, UI-status, and Electron-boundary tests passed during implementation. A final focused subset passed 60/60 after the last renderer adjustment.
- **desktop verified:** `bun run test:desktop` passed 28/28, including all existing chat, lifecycle, sandbox, Stop, settings, security, and shutdown journeys plus three new window-first journeys. The final focused `window-first.spec.ts` rerun passed 3/3.
- **static verified:** `bun run typecheck` passed. `bun run lint` completed with zero errors and eight pre-existing React hook warnings.
- **source-build verified:** the build used by the desktop lane produced a `144.44 kB` eager Electron main entry and a dynamically imported `1,974.53 kB` runtime chunk. The pre-change main artifact was `2,091.41 kB`. This proves the Pi graph left the eager entry; it is not a wall-clock speed claim.
- **full Bun lane classified:** `bun test` reported 670 pass / 12 fail. The failures were confined to the pre-existing real-Pi and OS-sandbox environment-sensitive suites; no new window-first contract test failed. This lane is not called green.
- **documentation verified:** `git diff --check` passed and all 154 local Markdown files resolved their relative link targets before closure.
- **packaged not verified:** `bun run package:mac` and `bun run test:packaged` were not run by owner instruction. No packaged support claim is added by this review.

## Milestone 0 timing disposition

The earlier ad-hoc repeated source measurement was discarded because its outer harness timed out during launch/cleanup. No partial value is evidence. The owner chose closure without another timing harness, so all five clocks are explicitly deferred:

1. Electron process start — **not verified** with a controlled cold/warm timing harness.
2. `createWindow` / `ready-to-show` — ordering is behavior-tested, but elapsed time is **not verified**.
3. First welcome/recents paint — paint-before-Pi is desktop-tested, but elapsed time is **not verified**.
4. `capabilities.piRuntime: true` — functional transition is tested, but time-to-ready is **not verified**.
5. First prompt admission — post-ready admission is tested, but elapsed time is **not verified**.

Packaged values for all five clocks are also **not verified** because package work was prohibited. No latency median, improvement percentage, or cold/warm performance claim is accepted.

## Milestone 2 disposition

The disabled GitHub secret-store skip, initial metadata-enabled skill scan, disabled-root skip, and unchanged-set no-op are accepted as small behavior-preserving cuts merged into Milestone 1. Their focused runtime coverage passed. Their wall-clock performance effect is unmeasured and is not claimed.

## Milestone 3 disposition

The owner explicitly defers `utilityProcess` crash isolation back to roadmap Phase F, which satisfies the track's alternative closure gate. Pi still runs in Electron main. A Pi crash or busy loop can still freeze the window, and the accepted startup reorder is not a sandbox or crash-isolation boundary. Any future process extraction must be promoted as new active work with its own desktop and packaged evidence.

## Documentation closure

Living startup truth remains in [`desktop-shell.md`](../../../../architecture/desktop-shell.md), [`overview.md`](../../../../architecture/overview.md), [`protocol-and-ipc.md`](../../../../architecture/protocol-and-ipc.md), [`renderer-and-ui.md`](../../../../architecture/renderer-and-ui.md), [`codebase-map.md`](../../../../architecture/codebase-map.md), [`current-state.md`](../../../../current-state.md), and the linked UI records. Historical product, plan, research, implementation, and acceptance evidence remain together in this archive.

## Known limits

- Packaged launch and the no-Pi-CLI packaged assertion were waived and remain unverified.
- Startup elapsed times remain unmeasured.
- There is no in-app retry after a failed Pi boot; restarting Pho Code is the recovery path.
- Pi remains in Electron main, so a process crash or busy loop is not survivable by the window.
- Linux startup behavior was not independently exercised in this review.
