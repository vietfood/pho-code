# Prerequisite — decompose the runtime, renderer, and bootstrap god-files

**Kind:** prerequisite
**Status:** In implementation — step 1 (five state owners) and step 3 (renderer layout chrome) landed 2026-08-27; step 2 landed six extractions 2026-08-28 and is deliberately paused there; step 4 resolved as will-not-do
**Owner outcome:** the three largest source files stop being single closures, so a reviewer can read one concern at a time and V4's runtime extraction moves a graph that is already modular.

This is a **proposal**, not accepted architecture and not an implementation contract. Steps 1 and 3 are in source and step 2 is under way (see the progress tables below); step 4 was resolved as will-not-do. It exists because a deslop pass on 2026-08-27 removed every unreferenced export in the tree and found that the remaining bulk is not dead code — it is three files that each hold one very large function.

## Why this is a prerequisite and not ordinary polish

`docs/urgent/README.md` scopes this folder to work that should happen *before adding more capability*. These files are where new capability lands. Each new backend, command, or sidebar surface currently appends to a closure that no longer fits in a reviewer's head, so the cost of the next feature rises with every feature already added.

## Measured starting point (2026-08-27, after the deslop pass)

| File | Lines | Shape |
| --- | --- | --- |
| `packages/runtime/src/pi-runtime.ts` | 2,680 | `createPhoCodeRuntime` spans lines 333–2523 — one ~2,190-line function holding ~70 inner functions over ~35 closure bindings (lines 337–500), ending in a `const runtime: HarnessRuntime = { … }` literal at 1676 with ~60 methods across ~690 lines. 58 imports. |
| `apps/desktop/src/App.tsx` | 1,756 | `App()` spans 89–1722 — one ~1,630-line component with 20+ `useState` hooks declared at 90–112. |
| `packages/application/src/bootstrap.ts` | 1,623 | Single bootstrap module restating the bridge command surface. |

The closure bindings are the real coupling: every inner function reads shared mutable state (`selected`, `sequence`, `generation`, `catalogCache`, `registry`, `sandbox`, `modelRuntime`, …) directly, so no cluster can move without first naming that state.

## Hard boundary — this must not absorb V4

V4 Milestone 2 owns moving "the complete `HarnessRuntime` graph—not a partial duplicate—into one Electron utility process", and V4 is **Pending** (held 2026-08-20). See [`version/v4/implementation-plan.md`](../version/v4/implementation-plan.md).

This proposal therefore:

- changes **module organization inside `packages/runtime` only** — no process boundary, no IPC, no serialization change;
- keeps `HarnessRuntime`'s public shape byte-identical, including its synchronous getters, so V4 inherits the same contract it planned against;
- must not be described, in code or docs, as progress on V4 Milestone 2.

It makes V4 cheaper rather than competing with it: "move the complete graph" is easier to verify when the graph is a set of named modules over one explicit context than when it is one closure.

## Proposed shape

**Step 1 — name the state.** *Revised during implementation.* The original plan proposed one `RuntimeContext` object holding all ~35 closure bindings. That was rejected in practice: the mutable `let` bindings (`selected` alone has 25 references) would require rewriting every read and write across ~2,200 lines in a single unreviewable change.

The working approach instead extracts **one self-contained state owner at a time**, each with its own module, interface, and unit test. Every step is independently reviewable and leaves the tree green, and each one removes mutable state from the closure rather than relocating all of it at once.

Progress on 2026-08-27 — mutable `let` bindings in the closure went from **10 to 3**:

| Extracted | Owns | Was |
| --- | --- | --- |
| `runtime-event-emitter.ts` | `listeners`, `sequence`, envelope stamping, listener fan-out | `let sequence` + a listener `Set` + inlined `emit`/`subscribe` |
| `workspace-catalog-cache.ts` | the one-slot model/session catalog for the active workspace | `let catalogCache` + duplicated projection in `resolveCatalog` |
| `dispose-latch.ts` | the one-way disposal flag and its count | `let disposed` + `let disposeCount`, updated at separate statements |
| `sandbox-settings.ts` → `createSandboxSettingsStore` | current sandbox settings and their persistence | `let storedSandbox` + a `saveSandboxSettings` call the caller had to remember |
| `session-selection.ts` | which session is active and which workspace to fall back to | `let selected` + `let lastWorkspace`, set together in one place and separately in three others |

`activeWorkspacePath()` now names `selected?.workspace.path ?? lastWorkspace?.path`, which appeared at four command sites — one of which evaluated it twice and used a `!` non-null assertion to satisfy the compiler.

Two coupled invariants were also collapsed rather than wrapped: `githubBindingRevision += 1` immediately followed by `rebindIdleGitHubSessions()` appeared at three command sites and is now `invalidateGitHubBinding()` — bumping without rebinding would leave idle sessions on a stale binding.

`createSessionSelection` is generic over the session type so the runtime's `LiveSession` stays private to `pi-runtime.ts`. It captures the invariant that selecting a session must also record its workspace, while *clearing* the selection must not forget it — global commands still need a workspace to act on after the last chat closes.

Remaining closure state: `testProvider`, `generation`, `githubBindingRevision`. The last two are bare counters and the first is test scaffolding; wrapping any of them would add indirection without removing duplication or protecting an invariant. They should move with whichever cluster step 2 relocates, not on their own.

**Step 2 — move one cluster at a time.** The inner functions already cluster cleanly. Each becomes a module once the state it reads has its own owner from step 1; the line ranges below are from the 2,680-line starting point and shift as step 1 proceeds:

| Proposed module | Current lines | Concern |
| --- | --- | --- |
| `runtime-events.ts` | 498–652 | `emitFor`, `toolEventPayload`, snapshot/activity emission (`emit` itself already moved) |
| `runtime-sessions.ts` | 653–863 | controller pool: instantiate, open, dispose, relocate, busy refusal |
| `runtime-catalog.ts` | 864–1045 | models, accounts, workspace/session catalog, `buildSnapshot` |
| `runtime-features.ts` | 1046–1211 | resource loader, sandbox/GitHub rebinding, host-UI bind |
| `runtime-run-loop.ts` | 1212–1484 | `handleAgentEvent`, `finishRun`, session titling |
| `runtime-plan-context.ts` | 1485–1560 | context prompt and Plan/Agent projection |
| `runtime-admission.ts` | 1561–1660 | tool policy, admission, run publication |

`pi-runtime.ts` keeps `createPhoCodeRuntime`, the context construction, and the `HarnessRuntime` literal — the literal's methods become thin delegations.

**Progress on 2026-08-28.** Six extractions, each with its own module, interface, and unit test. `pi-runtime.ts` went 2,667 → 2,409 lines; `createPhoCodeRuntime` spans 2,176 → 1,950 lines and holds 70 → 49 inner function declarations.

| Extracted | Owns | Was |
| --- | --- | --- |
| `runtime-events.ts` → `createRuntimeEventProjector` | how live session state becomes protocol events: `emitFor`, `toolEventPayload`, sandboxed-bash recording, snapshot emission, queued-work and activity projection | eight inner functions reading `emit`, `sandbox`, `selection`, and `registry` directly, reachable only through a constructed runtime |
| `compiled-context-prompt-cache.ts` | the per-session compiled context prompt | a bare `Map` mutated at five sites, including a hand-written `set`/`delete` branch |
| `runtime-plan-context.ts` → `createPlanContextProjector` | context-prompt and Plan/Agent projection plus the session tool policy | nine inner functions that read no closure state except that `Map` |
| `project-trust.ts` | which workspaces may use project-supplied resources | a bare `Set` of session approvals beside the persistent store, with the three-way decision spelled out inline |
| `runtime-controller-lookup.ts` | resolving `{ sessionId, workspaceId? }` to one controller | 18 lines of branching with three refusal paths, re-entered from ~30 command sites |
| `runtime-run-lifecycle.ts` | the `ActiveRun` type, run creation, and prompt settlement | two inner functions plus the type, including the never-reject guarantee on `promptDone` that only a comment protected |
| `model-catalog.ts` → `assertModelAdmissible` | refusing a turn the catalog cannot serve | an inline three-branch condition inside `assertTurnAdmission`, next to an already-tested module that owned the same concern |

`projectSessionMessages` also moved from a module-level helper in `pi-runtime.ts` into `transcript.ts`, next to the `projectMessages` it wraps — both new modules needed it, and it was already outside the closure.

The dependencies the event projector needs are passed as callbacks (`sandboxStatus()`, `isSelected()`, `listSessions()`) rather than captured values, because every one of them changes after construction. That is what makes the projections testable against plain objects: the new and extended test files add 36 tests covering activity phases, sandbox marking, queued-work fallbacks, the compiled-prompt cache, the Plan tool policy, trust precedence, every controller-lookup refusal path, run settlement including abort and caller-owned failures, and catalog admission — none of which had direct coverage before.

Two fixture mistakes are worth recording, because both were the test being wrong rather than the code: a plan record without `documentMarkdown` does not parse, so the first tool-policy test silently exercised Agent mode; and `renderToStaticMarkup` escapes apostrophes, which broke a first attempt at a copy assertion elsewhere in the same change.

**Where step 2 should stop, at least for now.** The clusters left — sessions, catalog, features, and the run loop — are not more of the same. Each reads six to ten construction-time bindings *and* calls into the others, so moving one produces a module whose signature is a bag of eight callbacks. That is the same failure the original one-`RuntimeContext` design was rejected for in step 1, arrived at from the other direction, and it would make `pi-runtime.ts` harder to read rather than easier.

Two counters (`generation`, `githubBindingRevision`) also stay put, per the step-1 note's own conclusion: wrapping a bare counter adds indirection without removing duplication or protecting an invariant.

What was taken instead is everything with a real invariant or a real branch in it. What remains is orchestration whose only honest home is the composition root — `buildSnapshot` alone reads the catalog, features, plan, context prompt, usage, queue, and change reviews. If the remaining bulk is still a problem after this, the next move is to give those seams names (a features port, a catalog port), not to relocate the closure wholesale.

The session cluster is still the hardest — `instantiateSession` alone reaches `ensureSandboxInitialized`, `workspaceSummary`, `createRuntime`, `bindSession`, `bindHostUi`, `hydrateTodos`, `ensureSessionModelIsSelectable`, and `retrieval.bind`, so moving it needs those seams named first rather than a callback bag of ten.

**Step 3 — `App.tsx`.** Group the 20+ `useState` hooks into the containers that already exist implicitly. `use-change-review.ts` is the precedent. The component keeps its JSX; only state ownership moves.

Done 2026-08-27: `use-layout-chrome.ts` owns `sidebarCollapsed`, `rightSidebarCollapsed`, `rightSidebarSurface`, `changesWindowOpen`, their two mirror refs, and the eight callbacks that drive them. The motivating defect was a coupled invariant, not size: `setRightSidebarCollapsed(x)` had to be paired by hand with `writeRightSidebarCollapsed(x)` at five call sites, and missing the write silently loses the collapse preference across relaunch. That pairing now exists once. `App.tsx` 1,756 → 1,690.

Assessed and deliberately **not** extracted:

- **Removal dialogs** (`pendingRemoval`, `pendingProjectRemoval`, `pendingArchivedRemoval`) — already share a `requestRemoval(prepare, setState)` helper, and each is read by exactly one JSX block. A hook would add indirection and remove no duplication.
- **The three removal dialog JSX blocks** — they share a five-line wrapper skeleton but their confirm bodies genuinely differ (project removal tears down workspace state, session removal leaves the current chat). A generic wrapper would cost about as much as it saves.
- **Project trust** (`trustDialogOpen` and the two dismissed-id sets) — plausible, but its setters are threaded through eight JSX sites, so the extraction is wider than the layout one for less gain. Worth doing only alongside a trust-surface change.

`useLayoutChrome` is **desktop-verified, not unit-tested**: the repository has no hook-test harness (no testing-library, no jsdom/happy-dom — UI tests use `renderToStaticMarkup` only), and adding a DOM environment for it would be a new dependency nobody asked for. `change-review.spec.ts`, `settings.spec.ts`, and `chat.spec.ts` drive the real chrome.

**Step 4 — `bootstrap.ts`. Resolved 2026-08-27: will not deduplicate.** The clone scan ranked the command-surface interface restated across `protocol/src/bridge.ts`, `runtime/src/harness-runtime.ts`, and `application/src/bootstrap.ts` as the tree's largest clone. Inspection showed it is not one: `HarnessRuntime` takes positional arguments and exposes synchronous getters the other two do not have, and `DesktopBridge` diverges from `ApplicationService` precisely at the IPC boundary (async everywhere, shell-only pickers, a different `subscribe` payload). Drift is already prevented by a compile-time assertion in `preload.ts`, the `keyof ApplicationService & keyof typeof IPC_CHANNELS` constraint in `main.ts`, and `bridge-commands.test.ts`. Merging would also have to be unpicked when V4 moves `HarnessRuntime` into a utility process and its getters become asynchronous.

The reasoning is recorded where the next reader will look before touching it: [`architecture/protocol-and-ipc.md`](../architecture/protocol-and-ipc.md) → *Three command declarations, deliberately not merged*. `bootstrap.ts` may still be split by concern later, but that is a separate, smaller question than the interface.

This leaves the runtime session cluster as the only remaining structural item.

## Acceptance gates

Behaviour-preserving refactors need behavioural proof, not just a green typecheck:

- `bun run typecheck`, `bun run lint`, `bun test` clean at every step;
- `bun run test:desktop` after each cluster move — per AGENTS.md, unit tests alone are insufficient for renderer/IPC-adjacent change;
- `HarnessRuntime`'s public surface diffed and shown unchanged;
- no step lands as a partial duplicate of the runtime graph.

Evidence for the 2026-08-28 extractions: `bun run typecheck` clean across all 11 packages; `bun run lint` 0 errors (8 pre-existing hook warnings); `bun test packages/protocol/test packages/runtime/test packages/ui/test packages/application/test` — 845 pass, 0 fail; `bun run test:desktop` — 31 passed. The `HarnessRuntime` literal's 55 method names were extracted from `HEAD` and from the working tree and diffed after each step: identical.

## Sequencing

Steps are individually promotable and individually abandonable. Each step 1 extraction stands on its own — it removes shared mutable state and lands a tested module — and together they unblock steps 2–4. Do not run this concurrently with a resumed V4 Milestone 2.

## Related

- [`version/v4/implementation-plan.md`](../version/v4/implementation-plan.md) — owns runtime-process extraction; held.
- [`architecture/runtime-and-data.md`](../architecture/runtime-and-data.md) — accepted runtime boundaries this must preserve.
- [`2026-08-27-defect-unwired-protocol-and-ripgrep-guards.md`](./2026-08-27-defect-unwired-protocol-and-ripgrep-guards.md) — defects surfaced by the same pass.
