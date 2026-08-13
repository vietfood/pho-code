# Milestone 0 code review

> Historical acceptance record. The archived v1 product and plan live in [`../product-v1.md`](../product-v1.md) and [`../implementation-plan.md`](../implementation-plan.md); current direction lives in [`../../../current-state.md`](../../../current-state.md).

Review date: 2026-08-13

Scope: the Bun workspace, protocol/application/runtime/UI packages, Electron main and preload adapters, bootstrap renderer, unit tests, and Playwright smoke lane currently present in this repository.

## Verdict

Milestone 0 is accepted after the 2026-08-13 hardening pass. The original review found three blockers (unsafe recursive test cleanup, prefix-based renderer trust, and missing runtime disposal). Those, plus the P2 findings, are resolved in source and covered by unit and Electron tests.

Original 2026-08-13 snapshot: type checking, linting, unit tests, and production bundling passed; `test:desktop` was not rerun because cleanup was unsafe. A user screenshot showed the development window. That snapshot is retained below as historical evidence.

Hardening-pass Electron proof is recorded at the end of this document.

## What is working well

- The repository is a real Bun workspace with exact dependency versions and a lockfile.
- The split between `protocol`, `application`, `runtime`, `ui`, and the Electron adapter matches the accepted dependency direction.
- Renderer source imports React, the shared protocol, and the UI package; it does not import Electron, Node, Pi, or the runtime.
- Preload exposes the fixed `getBootstrapState` and `subscribe` methods rather than raw `ipcRenderer` or a generic `invoke` function.
- The window enables context isolation and renderer sandboxing and disables Node integration and `<webview>`.
- Production and development CSPs exist, new windows are denied, external URL schemes are filtered, and permission requests are denied.
- `BootstrapState`, the protocol version, the intended Pi version, and the Electron compatibility pair have one protocol-level representation.
- Unit tests exercise bootstrap projection, error normalization, JSON round trips, protocol-version rejection, runtime disposal idempotence, and Node compatibility.
- The production build generates separate main, preload, and renderer outputs.

## Original findings (historical)

### M0-001 — P1 — Desktop-test cleanup can recursively delete an unrelated directory

Locations:

- `apps/desktop/tests/helpers/electron-app.ts:40`
- `apps/desktop/tests/smoke.spec.ts:67`

`removeTestDirectory()` calls `rm(directory, { recursive: true, force: true })`. Its guard accepts a path when either its direct parent is the OS temporary directory **or any part of the path contains** `pi-harness-test-`. A caller can therefore pass an unrelated directory such as `/some/important/pi-harness-test-project`, and the helper will permanently remove it. The operation also violates this repository's recoverable-deletion policy.

Required change:

1. Remove the permanent recursive deletion path.
2. Implement a fail-closed test-artifact cleanup adapter that uses the platform's recoverable Trash mechanism, or retain the isolated directory and print its path for deliberate cleanup.
3. Canonicalize the candidate and require it to be a direct child of the canonical OS temporary directory whose basename starts with the exact fixture prefix.
4. Add negative tests for a matching substring outside the temp root, the temp root itself, a nested descendant, a symlink, an empty path, and a relative path.

Acceptance: `bun run test:desktop` performs no permanent deletion and refuses every path outside its exact fixture ownership boundary.

### M0-002 — P1 — Renderer trust accepts URL-prefix collisions

Locations:

- `apps/desktop/electron/security.ts:42`
- `apps/desktop/electron/main.ts:45`

Production trust uses `url.startsWith(rendererRoot)`. With a renderer root ending in `/renderer`, this also accepts a sibling such as `/renderer-evil/index.html`. Development sender trust accepts any `http:` or `https:` URL on any port whose hostname is `localhost` or `127.0.0.1`, rather than the configured dev-server origin. The development navigation guard separately uses a raw prefix check against `ELECTRON_RENDERER_URL`.

This is low-impact while the only privileged command returns version metadata, but it becomes a real privilege-boundary defect as soon as workspace selection, filesystem access, sessions, or tools are added.

Required change:

1. Parse the configured renderer URL once and pass an exact trusted location/origin into both navigation and IPC checks.
2. In production, require `file:` and verify pathname containment with a path-aware relative/canonical-path check or an exact allowed entry URL; do not use string-prefix containment.
3. In development, require the exact configured origin, including port, and constrain the allowed path if practical.
4. Add unit tests for sibling prefixes, encoded paths, credentials syntax, alternate ports, subframes, malformed URLs, and the valid production/dev entries.

Acceptance: the known renderer is accepted and every prefix-collision or alternate-origin case is rejected before invoking application code.

### M0-003 — P1 — The runtime is never disposed by the Electron application

Locations:

- `apps/desktop/electron/main.ts:20`
- `apps/desktop/electron/main.ts:137`
- `packages/runtime/src/harness-runtime.ts:5`

Main constructs the stub runtime inline and loses the lifecycle handle. `window-all-closed` calls `app.quit()` where appropriate, but no `before-quit`/shutdown coordinator invokes `runtime.dispose()`. The stub has no resources today, so the screenshot is unaffected. Replacing it with Pi without first fixing ownership would leave sessions, subscriptions, extension resources, and future subprocesses without an orderly shutdown path.

Required change:

1. Keep explicit ownership of `HarnessRuntime` in the composition root.
2. Add one idempotent application shutdown operation that stops new work and disposes runtime-owned resources.
3. Gate Electron quit while bounded asynchronous shutdown runs, avoiding recursive `before-quit` handling.
4. Test normal window close, explicit quit, repeated quit/dispose, and a bounded failure/timeout path.

Acceptance: a desktop test observes exactly one runtime disposal before process exit, including on macOS explicit quit.

## Important findings

### M0-004 — P2 — The desktop smoke lane does not prove several advertised controls

Location: `apps/desktop/tests/smoke.spec.ts:9`

The test checks the visible bootstrap, three `webPreferences`, the Electron/Node versions, absence of common globals, and bridge keys. It does not verify the production CSP response, navigation rejection, external-link routing, permission denial, subframe/sender rejection, event unsubscription, or a rejected protocol payload. Because of M0-001, this review did not execute the lane.

Required change: split pure URL/CSP/security-policy tests from the real-window smoke test, then add focused Electron assertions for the behaviors that require a real `webContents`. Keep the bootstrap lane small; the chat lifecycle belongs to Milestone 1.

### M0-005 — P2 — Lint rules only partially enforce package boundaries

Location: `eslint.config.js:42`

The shared portable-package rule blocks Electron and React, but it does not distinguish the different permissions of `protocol`, `application`, and `runtime`. For example, protocol/application code can currently import `node:*` or Pi packages without lint failure, and the UI package can import `@earendil-works/*`. Runtime is the one package that will legitimately need Node and Pi.

Required change: define separate rules for each layer. At minimum, deny Node/Electron/React/Pi in protocol; deny Electron/React/Pi and direct filesystem/process dependencies in application; allow Node/Pi but deny Electron/React in runtime; and deny Node/Electron/Pi/application/runtime in UI and renderer. Treat the manifest dependency graph as another enforceable boundary, not only source linting.

### M0-006 — P2 — `isJsonSafeValue()` accepts lossy arrays and crashes on cycles

Location: `packages/protocol/src/json.ts:32`

A sparse array is reported safe even though JSON converts its hole to `null`. A cyclic object produces a `RangeError` instead of `false`. The helper is not currently used to validate IPC data, so this does not break the bootstrap, but it cannot yet support the protocol's stated JSON-safety guarantee.

Required change: define the accepted JSON value model precisely, reject sparse arrays and symbol-keyed/custom-serialization objects, detect cycles with a `WeakSet`, and add boundary tests. Before Milestone 1, validate command inputs and event/snapshot outputs at runtime instead of relying only on TypeScript types.

### M0-007 — P2 — The lint toolchain has an unsupported TypeScript peer pairing

Locations:

- `package.json:26`
- `bun.lock` entries for `typescript` and `typescript-eslint`

The workspace pins TypeScript `5.9.3` and `typescript-eslint` `8.38.0`; the locked `typescript-eslint` packages declare TypeScript support below `5.9.0`. Lint currently passes, but the pairing is outside the tool's declared compatibility range.

Required change: upgrade the ESLint TypeScript integration to a version that declares TypeScript 5.9 support, or pin TypeScript to a supported version. Re-run the complete Milestone 0 checks after changing the pair.

## Minor findings

### M0-008 — P3 — macOS still brands the process as Electron

Evidence: the user-provided screenshot shows “Electron” in the macOS application menu while the window content says “Pi Harness.” The root and desktop package manifests do not define product metadata, and main does not set the application name.

Required change: set development application naming deliberately and add final product metadata when packaging is introduced. This is not a reason to begin packaging now.

### M0-009 — P3 — Version comparison logic is duplicated in the smoke helper

Locations:

- `packages/protocol/src/json.ts:1`
- `apps/desktop/tests/helpers/electron-app.ts:22`

The smoke helper reimplements Node-version parsing and hardcodes the minimum. Import the protocol implementation/constants or expose a small test-safe compatibility projection so version rules cannot drift.

### M0-010 — P3 — The event bridge is reserved but not operational

Locations:

- `packages/protocol/src/bridge.ts:4`
- `apps/desktop/electron/preload.ts:7`

`subscribe()` registers the renderer listener, but main never publishes `pi-harness:v1:event`. This is acceptable for the bootstrap as long as documentation calls it a reserved seam. Before use, define discriminated event payloads, validate them at the boundary, sequence them per runtime policy, and test unsubscribe/replacement behavior.

## Verification record

Executed successfully in this checkout on 2026-08-13:

```text
bun run typecheck  PASS (5 workspace packages)
bun run lint       PASS
bun test           PASS (9 tests, 23 assertions)
bun run build      PASS (main, preload, renderer bundles)
```

Additional static probes confirmed:

- a production sibling path under `renderer-evil` is currently trusted;
- an unrelated localhost development port is currently trusted by `isTrustedRendererUrl()`;
- a sparse array is currently reported JSON-safe and round-trips to `[null]`;
- a cyclic object currently throws `RangeError` in `isJsonSafeValue()`.

Not executed:

- `bun run test:desktop`, because its `finally` block performs the unsafe permanent cleanup described in M0-001;
- a fresh dependency installation, because dependencies and the lockfile were already present;
- Linux checks, because this review ran on macOS;
- packaged-application checks, because packaging is deferred and no packaging scripts exist.

The pre-existing Playwright last-run marker reports a pass, but this review does not elevate that artifact to an independently executed check.

## Original milestone gate (historical)

Resolve M0-001 through M0-003 before adding the Pi SDK. Resolve M0-004 through M0-007 while closing Milestone 0, preferably in the same hardening pass. M0-008 through M0-010 may be completed during that pass or immediately before their affected feature becomes active.

After the fixes, run:

```bash
bun run typecheck
bun run lint
bun test
bun run test:desktop
bun run build
```

Then record the real Electron result here and mark Milestone 0 accepted in `docs/implementation-plan.md`.

## Hardening pass (2026-08-13)

Status of the original findings:

| ID | Severity | Status |
| --- | --- | --- |
| M0-001 | P1 | Resolved — fail-closed ownership check; `/usr/bin/trash` on macOS; no recursive `rm` |
| M0-002 | P1 | Resolved — parsed trusted location; path containment for `file:`; exact origin for dev |
| M0-003 | P1 | Resolved — composition-root runtime handle; idempotent `application.shutdown()`; bounded `before-quit` |
| M0-004 | P2 | Resolved — unit URL/CSP tests plus Electron CSP, navigation, window-open, and permission assertions |
| M0-005 | P2 | Resolved — per-layer ESLint import rules and package.json dependency-graph tests |
| M0-006 | P2 | Resolved — dense-array/cycle/`toJSON`/symbol rejection; bootstrap snapshot validated at the boundary |
| M0-007 | P2 | Resolved — `typescript-eslint` `8.67.0` declares TypeScript `<6.1.0` |
| M0-008 | P3 | Resolved — `app.setName("Pi Harness")` and desktop `productName` |
| M0-009 | P3 | Resolved — smoke lane uses bootstrap-state compatibility instead of a duplicated parser |
| M0-010 | P3 | Documented — `subscribe` remains a reserved unwired seam until Milestone 1 |

Executed successfully after the fixes:

```text
bun run typecheck  PASS (5 workspace packages)
bun run lint       PASS
bun test           PASS (38 tests, 76 assertions)
bun run test:desktop  PASS (3 Electron tests: security, shutdown, smoke)
bun run build      PASS (main, preload, renderer bundles)
```

Electron observations from `test:desktop` on macOS:

- production CSP includes `default-src 'self'` and `script-src 'self'` without `unsafe-eval`;
- top-level navigation to `file:///etc/passwd` is denied;
- `window.open` is denied and does not create a second window;
- `Notification.requestPermission()` returns `denied`;
- `app.quit()` twice still writes a shutdown probe with `disposeCount: 1`;
- the bootstrap smoke lane sees protocol version 1, compatible embedded Node, renderer isolation, and application name `Pi Harness`.

`bun run dev` was not relaunched in the hardening pass. Next optional check: confirm the development CSP and exact-origin trust in a live `ELECTRON_RENDERER_URL` session.

## Milestone 1 transition recheck

Rechecked on 2026-08-13. Milestone 0 remains accepted and Milestone 1 is active.

Current evidence:

```text
bun run typecheck  PASS
bun run lint       PASS
31 non-destructive unit tests  PASS
bun run test:desktop  PASS (3 Electron tests, permitted desktop run)
bun run build      PASS
```

The first `test:desktop` attempt was blocked by the execution sandbox before Electron launched; the single permitted retry passed. The transition review found no reason to reopen Milestone 0. It carried two narrow fixes into the start of Milestone 1:

- `runBoundedShutdown()` handles completion and timeout, but a rejected `dispose()` currently escapes `finishQuit()` before `app.quit()`; handle the rejection before replacing the stub with Pi.
- `owned-temp-path.test.ts` directly calls `unlink()` for its symlink fixture; change that cleanup to comply with the repository's recoverable-deletion rule.

Keep both fixes small. They do not justify more abstraction or a broader test framework.
