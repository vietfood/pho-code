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
- bounded projections for accepted workspaces, sessions, runs, models, messages, tools, settings, credentials, queues, attachments, and features;
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

- bootstrap, workspace recents/reorder, session catalog/snapshots, create/open/archive/restore/removal;
- prompt, steer/follow-up, image preparation, abort, model/thinking, assistant rewrite, context prompt, host dialogs;
- appearance, permissions/trust, skill sources, credentials/provider OAuth, and GitHub MCP;
- workspace-reference search;
- implemented V3 review/diff/Approve/per-file Undo commands.

`apps/desktop/tests/unit/bridge-commands.test.ts` asserts that preload, main, and IPC stay aligned with the registry. Do not maintain a copied full interface in architecture prose.

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

Runtime events carry protocol version, sequence, composite session identity where relevant, run identity where relevant, type, bounded payload, and occurrence time.

The implemented event catalog in `packages/protocol/src/events.ts` covers:

- authoritative session/feature/settings snapshots;
- run admission, text/thinking deltas, tool activity, settle, and failure;
- extension dialog requests/settlement, notifications, and permission status;
- provider authentication flow;
- session activity and removal;
- V3 `changeReviewUpdated` invalidation/summary events.

`controllerGeneration` is reserved in the envelope but is not currently populated by runtime; do not rely on it for ownership.

Authoritative snapshots replace projections after reload or missed events. Incremental events never override another `{workspaceId, sessionId, runId}`. A valid admission or full snapshot may establish a successor run after the previous run settles; do not reject authoritative replacement events with a global run-ID mismatch guard.

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
- `HostDialogKind` `"questionnaire"` and ask-user answer payloads are implemented in source for [`../features/plan-agent/`](../features/plan-agent/README.md) Milestone 0 and are not accepted.

Those plans must preserve named methods, JSON safety, bounded results, composite identity, and renderer non-authority.
