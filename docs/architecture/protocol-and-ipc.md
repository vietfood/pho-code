# Protocol and IPC

## Status

Accepted architecture for the current harness. Version and feature plans may propose additions, but a proposed command is not an accepted shared boundary until its owning milestone is accepted and this document is updated.

## Purpose

The protocol is the portability and privilege boundary between the renderer and the desktop/application/runtime stack.

```text
renderer -> protocol <- preload/main -> application -> runtime
```

The renderer receives snapshots/events and sends named intents. It never receives filesystem, process, credential, Electron, Pi, MCP, or PTY authority.

## Package ownership

`packages/protocol` owns:

- protocol version and command names;
- JSON-safe request/result/event types;
- normalized error codes;
- bounded projections for accepted workspaces, sessions, runs, models, messages, tools, settings, credentials, queues, attachments, and features, plus V5's in-source backend descriptors, backend-pinned compatibility identity, backend-owned model/reasoning/Fast state, and text/tool-delta events;
- runtime validators and JSON-safety helpers that can run without Node or Electron.

It does not import Node, Electron, React, Pi, MCP, the application, or the runtime.

## Named bridge

Preload exposes one method per approved operation through `window.phoCode`, plus narrowly typed subscriptions. Do not expose:

- raw `ipcRenderer`;
- `invoke(channel, payload)`;
- arbitrary read/write/spawn methods;
- absolute app-data paths, secret values, process handles, streams, or Electron objects.

Every privileged operation has a fixed purpose. Renderer input is untrusted and is validated again in main/application code even when TypeScript types appear correct.

The authoritative command registry is `packages/protocol/src/version.ts`; method signatures live in `bridge.ts`, channel names in `apps/desktop/electron/ipc.ts`, and preload implements the same list. Current groups cover:

- bootstrap, backend discovery, workspace recents/reorder, session catalog/snapshots, create/open/archive/restore/removal;
- prompt, steer/follow-up, image preparation, abort, model/thinking/Fast, assistant rewrite, context prompt, host dialogs;
- appearance, permissions/trust, skill sources, credentials/provider OAuth, GitHub MCP, and agent-tool sandbox Settings (`updateSandboxSettings`);
- workspace-reference search;
- implemented V3 review/diff/Approve/per-file Undo commands.

Window-first startup adds no generic command. `BootstrapState.piRuntime` is the authoritative `starting | ready | failed` projection, while `capabilities.piRuntime` remains the ready boolean. `subscribePiRuntimeStatus` is a separate narrow wakeup that tells the renderer to re-query bootstrap. It does not enter the sequenced Pi event stream, so shell lifecycle messages cannot collide with runtime sequence numbers.

V5's unaccepted compatibility slice also projects `BootstrapState.agentBackends`. Session-bearing commands, summaries, events, host-dialog requests, and host-dialog resolutions may carry `backendId`; absence is normalized to `pi` so metadata and Pi session keys written before schema v7 keep their existing identity. Non-Pi composite keys include the backend and are never reinterpreted as Pi sessions. Backend-neutral interaction events carry a bounded request ID and explicit approval choices or questionnaire fields; the product bridge maps them to the existing named `resolveHostDialog` command without exposing the backend connection. The owning contract and acceptance status remain in [`../version/v5/implementation-plan.md`](../version/v5/implementation-plan.md).

`apps/desktop/tests/unit/bridge-commands.test.ts` asserts that preload, main, and IPC stay aligned with the registry. Do not maintain a copied full interface in architecture prose.

### Three command declarations, deliberately not merged

`DesktopBridge` (`packages/protocol/src/bridge.ts`), `ApplicationService` (`packages/application/src/bootstrap.ts`), and `HarnessRuntime` (`packages/runtime/src/harness-runtime.ts`) restate overlapping method lists. This is intentional layering, **not** duplication to clean up. A 2026-08-27 deslop pass flagged it as the largest apparent clone in the tree and, on inspection, left it alone:

- **`HarnessRuntime` is a different interface, not a copy.** It takes positional arguments (`createSession(workspaceId, backendId?)`) where the other two take input objects, exposes synchronous getters (`getCapabilities`, `getAgentDir`, `listSessionActivity`, `getPermissionSettings`, `disposeCount`), and omits archive/restore/prepare-removal entirely.
- **`DesktopBridge` and `ApplicationService` overlap heavily but diverge exactly at the process boundary.** The bridge is asynchronous everywhere because every call crosses IPC, and it owns shell-only affordances (`pickWorkspace`, `pickImages`, `pasteImages`, `subscribePiRuntimeStatus`). The application service is in-process, so `getBootstrapState` and `getSettings` stay synchronous, and it exposes `openPickedWorkspace(path)`, `prepareImage`, and `shutdown` instead. Their `subscribe` payloads differ too (`RuntimeEventEnvelope` vs `RuntimeEvent`).
- **Drift is already impossible.** `preload.ts` carries a compile-time assertion that the `DesktopBridge` command set and the IPC channel set are mutually exhaustive; `main.ts` derives its registration type from `keyof ApplicationService & keyof typeof IPC_CHANNELS`; `bridge-commands.test.ts` checks the channel list against `PROTOCOL_COMMANDS`. A method added to one layer and forgotten in another fails the build or the test.
- **Merging would fight V4.** [`../version/v4/implementation-plan.md`](../version/v4/implementation-plan.md) moves `HarnessRuntime` into a utility process, where "synchronous cross-process calls are forbidden" — its getters must become asynchronous. A shared base interface would have to be unpicked with `Omit<>` at that point, which is worse than the current restatement.

Extract a shared base only if a future change makes two of these layers genuinely identical *and* keeps them so. Signature restatement that the compiler already checks is cheaper than the coupling.

`resolveHostDialog` for `kind: "select"` may include `value` as an optional permission denial reason. The extension host applies that string to the permission package's follow-up `input()` without emitting a second dialog. A select without `value` still shows the follow-up input when the package asks for a reason.

## JSON-safe values

Protocol values must survive JSON serialization. Reject:

- functions, symbols, `undefined`, non-finite numbers, and bigint;
- cycles and sparse arrays;
- class instances, custom prototypes, and custom serialization hooks;
- Node buffers/streams, Electron objects, Pi runtime objects, errors, and filesystem handles.

Large text, lists, diffs, files, and event bursts have explicit bounds. On-demand pages carry bounded content; general event streams carry summaries and invalidation signals.

## Results and errors

Expected command failures cross IPC as a typed JSON-safe result envelope and are reconstructed by preload. Unexpected exceptions remain generic:

- do not send stacks, raw OS error codes, absolute paths, tokens, headers, or provider payloads;
- use stable product error codes and bounded user-facing messages;
- log privileged diagnostics only through redacted internal paths.

## Events and ordering

Runtime events carry protocol version, sequence, backend-pinned composite session identity where relevant, run identity where relevant, type, bounded payload, and occurrence time. A missing backend remains the compatibility spelling of Pi.

The implemented event catalog in `packages/protocol/src/events.ts` covers:

- authoritative session/feature/settings snapshots;
- run admission, text/thinking deltas, tool activity (optional `sandboxed` on Seatbelt-wrapped bash), settle, and failure;
- extension dialog requests/settlement, notifications, and permission status;
- provider authentication flow;
- session activity and removal;
- V3 `changeReviewUpdated` invalidation/summary events.

`controllerGeneration` is reserved in the envelope but is not currently populated by runtime; do not rely on it for ownership.

Authoritative snapshots replace projections after reload or missed events. Incremental events never override another `{backendId, workspaceId, sessionId, runId}` after normalizing a missing backend to Pi. A valid admission or full snapshot may establish a successor run after the previous run settles; do not reject authoritative replacement events with a global run-ID mismatch guard.

Streaming deltas are rendering input, not final transcript truth. Final Pi message/session events reconcile settled state.

## Electron enforcement

Main validates:

- exact renderer sender and origin;
- command payload shape and bounds;
- workspace/session ownership;
- opaque handles and revisions;
- URL protocol before opening an external page.

Preload bundles the protocol facade and exposes no generic channel access. The renderer remains sandboxed, context-isolated, and free of Node integration.

## Boundary enforcement

`eslint.config.js` is the executable dependency-boundary check:

- protocol cannot import privileged layers;
- UI and renderer can import React/UI/protocol only;
- application cannot import Electron, React, Node, or Pi;
- runtime cannot import Electron, React, application, or UI.

Typecheck and lint complement runtime payload validation; they do not replace it.
`apps/desktop/tests/unit/package-boundaries.test.ts` and `bridge-commands.test.ts` encode the package and facade invariants.

## Workstream-owned additions and history

Accepted additions are promoted here; active proposals remain with their owner:

- change-review/Approve/per-file Undo are accepted named commands; their closed contract lives under [`../archive/v3/`](../archive/v3/README.md);
- terminal commands and dedicated events are proposed under [`../features/terminal/`](../features/terminal/README.md) and do not exist in source;
- `HostDialogKind` `"questionnaire"` and ask-user answer payloads are accepted structured host dialogs ([`../archive/features/plan-agent/`](../archive/features/plan-agent/README.md));
- `setSessionMode`, `updateSessionPlanDocument`, and `executeSessionPlan` plus snapshot `plan` (including `todos`) and Plan-only `execute_plan` are accepted Plan/Agent commands.

Those plans must preserve named methods, JSON safety, bounded results, composite identity, and renderer non-authority.
