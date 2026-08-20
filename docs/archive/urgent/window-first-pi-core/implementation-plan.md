# Implementation plan: window-first Pi core

## Status and use

Closed urgent-track plan, queued 2026-08-16 and accepted/archived 2026-08-20. Milestone 1 and selected Milestone 2 cuts are recorded in the [implementation evidence](./logs/2026-08-20-m1-window-first-implementation.md); the [acceptance/closure review](./logs/2026-08-20-m1-acceptance-and-closure.md) records the owner's package-gate waiver, timing deferral, and Milestone 3 deferral to Phase F. This plan is historical contract, not acceptance evidence.

Read [`product.md`](./product.md), [`../../../architecture/desktop-shell.md`](../../../architecture/desktop-shell.md), [`../../../architecture/overview.md`](../../../architecture/overview.md), and [`../../../architecture/protocol-and-ipc.md`](../../../architecture/protocol-and-ipc.md) before editing Electron main or runtime construction.

Do not put this work in `archive/v3/`, `archive/features/sandbox/`, or `features/terminal/` source ownership. Do not treat a shell rewrite as in scope.

## Global acceptance rules

Every milestone must:

- preserve `renderer -> protocol <- shell adapter -> application -> runtime -> Pi SDK`;
- keep Pi `0.84.1` as the agent/session authority;
- keep the renderer free of `electron`, `node:*`, Pi SDK, MCP SDKs, and PTY libraries;
- keep protocol values JSON-safe; no `utilityProcess` handles, Node streams, or Pi objects cross the bridge;
- show a window without waiting on `ModelRuntime.create` once Milestone 1 is in source;
- fail honestly if Pi boot fails; never delete sessions as recovery;
- leave `node-pty` / `TerminalHost` in the Electron adapter even if Pi moves to a child;
- leave agent-tool Seatbelt work to [`archive/features/sandbox`](../../features/sandbox/README.md);
- distinguish unit, integration, desktop, packaged, and unverified evidence;
- update architecture, development, current-state, and attribution only when the corresponding milestone lands, and mark accepted behavior only after the gate.

## Architecture

### Baseline before Milestone 1

```mermaid
flowchart LR
    Renderer["React renderer"] --> Preload["preload window.phoCode"]
    Preload --> Main["Electron main"]
    Main --> App["Application"]
    App --> Runtime["HarnessRuntime + Pi SDK"]
    Main --> MCP["GitHub MCP stdio if enabled"]
```

Pi and Electron main were one OS process with `createWindow()` after `createPhoCodeRuntime()`. Pi remains in main after Milestone 1, but this blocked order no longer exists in source.

### Milestone 1 (accepted 2026-08-20)

```mermaid
flowchart LR
    Ready["app.whenReady"] --> Host["metadata + runtime host + IPC"]
    Host --> Window["createWindow + metadata chrome"]
    Window --> Boot["dynamic import + background createPhoCodeRuntime"]
    Window --> Renderer["welcome / recents / Starting Pi"]
    Boot --> Host
    Host --> ReadyEvent["authoritative status + wakeup"]
    ReadyEvent --> Renderer
```

Same process. Different **order**. Application metadata and appearance apply without Pi. Commands that need the SDK return a stable “runtime not ready” error until boot finishes.

### Milestone 3 (proposed)

```mermaid
flowchart LR
    Renderer["React renderer"] --> Main["Electron main broker"]
    Main --> Util["utilityProcess: HarnessRuntime + Pi"]
    Main --> PTY["TerminalHost + node-pty"]
    Util --> MCP["GitHub MCP stdio if enabled"]
```

Same JSON protocol. Main owns the window, pickers, quit, and PTY. The child owns Pi. Crash of the child must not destroy the `BrowserWindow`. This is still not a sandbox.

## Protocol

Prefer existing bootstrap fields. Add only what first paint requires.

Selected shape (names may tighten in Milestone 1):

- `capabilities.piRuntime` remains the ready flag. Add an authoritative bounded startup status so bootstrap distinguishes `starting` from `failed` without changing that capability's meaning.
- If the renderer can paint before the runtime exists, `getBootstrapState` must succeed from metadata alone (`recentWorkspaces`, appearance, versions) with `capabilities.piRuntime: false`.
- A runtime-status wakeup tells the renderer to refresh bootstrap. The query remains authoritative because startup may settle before subscription.
- Do not merge an independently numbered shell event into the existing runtime stream: the reducer drops non-increasing sequence numbers. Either resequence all forwarded events through one broker or use a separate narrow lifecycle subscription. Do not add a generic `invoke`.

Validate the exact names against `packages/protocol/src/version.ts` during Milestone 1. Do not collapse this into a key/value channel.

## File ownership

| Layer | Milestone 1 | Milestone 3 |
| --- | --- | --- |
| `apps/desktop/electron/main.ts` + eager imports | Metadata/runtime host and IPC before load; remove broad runtime value imports; create the window before dynamic runtime import | Spawn/broker `utilityProcess`; keep pickers, quit, PTY |
| `packages/application` | Stable attachable runtime connection; metadata bootstrap while starting; stable not-ready errors | Remains in main; still no Electron import |
| `packages/runtime` | Safe to construct later; narrow pure helper exports; transactional partial-boot ownership where retry requires it | Complete `HarnessRuntime` graph runs in the child |
| `packages/protocol` | Metadata-only bootstrap + ready/failed event if missing | Same commands/events over the child pipe |
| `packages/ui` + `apps/desktop/src` | Welcome chrome without a full-window block on Pi; honest Starting Pi status | Surface child-crash / restart copy without claiming a sandbox |
| `apps/desktop/tests` | Smoke: window visible while runtime still booting (or a test seam that delays boot) | Desktop: kill/hang the child; window remains |

## Milestones

### Milestone 0 — Measure the two clocks

**Closure status:** deferred by owner. All five source and packaged clocks are explicitly not verified in the [closure review](./logs/2026-08-20-m1-acceptance-and-closure.md); no speedup claim is accepted.

**Intent:** Replace anecdote with numbers.

Record, on macOS, for `bun run dev` (warm and cold) and for the unsigned `.app` if one is already built:

1. time to Electron process start;
2. time to `createWindow` / `ready-to-show`;
3. time to first recents/welcome paint;
4. time until `capabilities.piRuntime` is true;
5. time until a prompt can be admitted in an empty session.

Do not change behavior. Write numbers in a new dated log. If no packaged artifact is present, mark packaged timing **not verified** and still record dev timings.

**Acceptance:** a log exists with the five timestamps or an explicit not-verified reason per clock. No source change required.

**Verification:** not a product test lane. The log is the artifact.

### Milestone 1 — Window first

**Implementation status:** accepted 2026-08-20. Source and desktop evidence passed; the owner explicitly waived the packaged assertion under the standing no-package instruction. Packaged behavior is not verified and was not called passed. See the [implementation record](./logs/2026-08-20-m1-window-first-implementation.md) and [closure review](./logs/2026-08-20-m1-acceptance-and-closure.md).

**Intent:** First paint does not wait on `ModelRuntime.create`.

Sequence:

1. `app.whenReady`: menu/CSP, metadata store, stable runtime host/application, metadata appearance, and startup-safe IPC.
2. Create the window and request `loadURL` / `loadFile` before starting synchronous Pi work.
3. On a caught background task, dynamically import the runtime and call `createPhoCodeRuntime`. Remove other eager broad-runtime imports (including image MIME sniffing) so the Pi graph is not parsed before the window path.
4. Renderer fetches metadata-safe bootstrap/settings first and shows welcome/recents. It must not await provider accounts or catalogs while `piRuntime` is false. No full-window “Loading…” hides chrome.
5. Pi/session/model controls are disabled while starting. Show bounded “Starting Pi…” or a redacted failure in existing chrome — not a second app. Pi commands return stable `runtimeUnavailable`, not a hang or false success.
6. Attach only the active boot generation, forward events through one sequence-safe seam, and refresh authoritative bootstrap. If quit wins the race, dispose a late runtime and never attach it.
7. Use a deterministic test-only boot gate/failure seam. Hold boot, prove rendered welcome plus unavailable command, release and prove normal chat; separately prove failure leaves the window alive.

**Acceptance:**

- desktop: rendered welcome/recents (not only `ready-to-show`) are visible while runtime boot is held and `capabilities.piRuntime` is false;
- desktop: sending a prompt while not ready returns a stable harness error, not a hang;
- desktop: boot failure leaves chrome alive with a bounded error; quit during held boot does not attach or leak a late runtime;
- desktop: after ready, smoke chat still works;
- unit: metadata-only bootstrap is JSON-safe and does not require a live `HarnessRuntime`;
- packaged: unsigned `.app` shows chrome without a Pi CLI (existing packaged lane plus the window-first assertion).

**Verification:** `bun run test:desktop` for the smoke/security/session specs that still apply, plus a new desktop spec for window-before-runtime. Packaged lane when the desktop slice is green.

### Milestone 2 — Cut remaining boot work on the critical path

**Implementation status:** the disabled GitHub secret-store read, initial metadata-enabled skill scan, disabled-root skip, and unchanged-set no-op merged with Milestone 1. Wall-clock comparison remains open.

**Closure status:** accepted only as behavior-preserving merged cuts with focused coverage. Their performance effect is unmeasured and explicitly not claimed.

**Intent:** After window-first, shrink time-to-Pi-ready without a process split.

Candidates (keep only those Milestone 0/1 measurements still justify):

- do not call the GitHub token store at all when `githubMcpEnabled` is false;
- pass metadata-enabled skill sources once, skip an unchanged normalized update, and avoid scanning disabled external roots;
- defer remaining skill/resource filesystem walks only when measurement justifies it;
- keep `refreshOnCreate: false` / `allowModelNetwork: false` (already true);
- do not instantiate session controllers at launch (already true: no auto-open session).

**Acceptance:** time-to-Pi-ready is lower than the Milestone 0 baseline on the same machine, recorded in a log, **or** the log explains why a candidate was skipped. No behavior change for an enabled GitHub MCP row: turning it on still starts the child as today.

### Milestone 3 — `utilityProcess` for Pi

**Closure status:** explicitly deferred by the owner to roadmap Phase F. Nothing in this section is implemented or accepted by this archive.

**Intent:** Crash isolation. Window and Pi boot in parallel. Same protocol.

Sequence:

1. Electron main keeps window, IPC broker, metadata store, native pickers, appearance, quit, and `TerminalHost`.
2. A Node `utilityProcess` owns the complete `HarnessRuntime` graph while application stays in main, matching “application does not know Electron; runtime does not know Electron.” Resolve synchronous runtime getters before coding: convert them to async commands or maintain explicit authoritative cached projections in the proxy; never fake synchronous cross-process access.
3. Commands/events are the existing JSON envelopes. No Structured Clone-only values.
4. Child crash: renderer gets a recoverable error; window stays; owner can retry boot. Sessions on disk are untouched.
5. Shutdown: existing bounded quit must dispose the child; do not hang forever.
6. Packaged: the child must resolve baked features via `ResourceLocator` with no user Pi CLI.

**Acceptance:**

- desktop: killing the child leaves the `BrowserWindow` alive;
- desktop: permission confirm/select/input still round-trip;
- desktop: GitHub MCP off stays off; when on, stdio still works from the child;
- packaged: `test:packaged` still launches without `pi` on `PATH`;
- unit/integration: runtime tests still run without Electron.

**Honesty:** docs and UI must not call this a sandbox.

**Out of scope for Milestone 3:** Deno, Tauri, Seatbelt for the Pi process, signing.

## Deferred on this track

- Deno sidecar (see product). Requires Milestone 3 plus a real-session prototype.
- Tauri/GPUI shell change (see [`desktop-shell.md`](../../../architecture/desktop-shell.md) “When to revisit”).
- OS/container jail for the whole Pi process (roadmap Phase F; distinct from [`archive/features/sandbox`](../../features/sandbox/README.md)).

## Pins and packaging

No new runtime pin in Milestones 0–2. Milestone 3 uses Electron’s existing `utilityProcess` on pinned Electron `43.4.0`. Do not add Deno, Tauri, or a second Node distribution.

Native modules used by Pi stay rebuilt for Electron’s ABI while they load in an Electron Node process (main today, `utilityProcess` after Milestone 3 — same ABI). `node-pty` stays in main with that same ABI.

## Exit checks

Promote a milestone only after:

```bash
bun run typecheck
bun run lint
bun test
bun run test:desktop
```

and, for Milestones 1 and 3:

```bash
bun run build
bun run package:mac
bun run test:packaged
```

Use [`.agents/skills/test-pho-code`](../../../../.agents/skills/test-pho-code/SKILL.md). Record only checks that ran.

## Acceptance gate for the track

The track may close or shrink when:

1. Milestone 1 is accepted (window-first is current architecture); and
2. either Milestone 3 is accepted, or the owner explicitly defers process isolation back to Phase F with a log.

Milestone 2 may merge into 1 if the critical-path cuts are small. Deno never blocks closure.

**Closure decision:** satisfied 2026-08-20. Milestone 1 is accepted with the explicit packaged-evidence waiver recorded above, selected Milestone 2 cuts merged without a timing claim, and the owner deferred Milestone 3 to Phase F.
