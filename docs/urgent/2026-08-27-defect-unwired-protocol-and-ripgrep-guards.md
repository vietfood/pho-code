# Defect — gaps left behind by validators and disclosures that were never called

**Kind:** defect
**Status:** Partly closed 2026-08-28 — gaps 2 and 3 decided and implemented; gaps 1, 4, and 5 have named owners and remain open

A deslop pass on 2026-08-27 found eight exports that were correct, tested, and called from nowhere. The owner directed that they be deleted rather than wired ("remove unwired guards/disclosures too"), and they are now gone from source.

**This note exists because deleting the code did not close the gaps it named.** A guard that nothing called was already not protecting anything; removing it changed the source, not the behaviour. Each gap below is still open, and each is cheaper to fix deliberately than to rediscover.

## Open gaps

### 1. The protocol version is stamped but never validated — `defect`

`protocolVersion` is written onto every envelope (`packages/application/src/bootstrap.ts:385`) and no code path checks it on receipt. `isSupportedProtocolVersion` was the only implementation of that check; it is removed.

Low risk while the renderer and main process always ship together. It becomes real the moment a stale packaged renderer can meet a newer main process — which is exactly what V4's update path introduces. Decide the fail-closed behaviour when V4 resumes, not after.

**Owner 2026-08-28: V4.** Left open deliberately. V4 is Pending, and its update path is what creates the mismatch this guard would catch; re-adding a validator now would be another unwired guard. Resuming V4 must handle it alongside the Milestone 0 constants listed in [`version/v4/logs/2026-08-27-remove-m0-source-freeze.md`](../version/v4/logs/2026-08-27-remove-m0-source-freeze.md).

### 2. No user-facing disclosure of change-ledger retention — `safety honesty` — **CLOSED 2026-08-28**

`CHANGE_LEDGER_DISCLOSURE` stated where change data lives, a 250 MiB cap, and Approve/Undo semantics. Only a test ever read it; it was removed on 2026-08-27.

Every claim in the removed copy was re-checked against current source before restoring it, and one was corrected:

| Claim | Evidence |
| --- | --- |
| Stored in application data | `pi-runtime.ts` composes the store at `applicationDataDir/change-ledger/v1` |
| Not encrypted at rest | no encryption on the store; "in personal v3" dropped from the copy, since the behaviour is not version-scoped |
| Not in the Pi transcript or Git history | the ledger is a separate app-data store; Pi JSONL is untouched |
| Kept until Approve or Undo; records retained | no `unlink`/prune path exists anywhere in `change-ledger-store.ts` or `change-review.ts` |
| 250 MiB budget → snapshots marked unavailable | `ledgerBudgetExceeded` (`MAX_CHANGE_LEDGER_BYTES`) returns `capture-failed`, which sets file status `unavailable` in `change-capture.ts` |

The owner directed that it must not be dumped into the layout. It is now behind the same small `(i)` control the Sandbox and Skills disclosures use, at the head of the Changes review toolbar. The shared control was renamed `SettingsDisclosure` → `InfoDisclosure` (`packages/ui/src/info-disclosure.tsx`) because it is no longer Settings-only; both existing call sites and their test IDs are unchanged.

A protocol test ties the copy to `MAX_CHANGE_LEDGER_BYTES`, so changing the budget without changing the disclosure fails the lane.

### 3. The bundled ripgrep is not on `PATH` for agent `bash` — `defect` (narrow) — **DECIDED 2026-08-28: intended**

Scope this correctly. `resolveRipgrepPath` **is** wired (`apps/desktop/electron/main.ts:528`, `packages/runtime/src/sandbox-runtime.ts:243`), so the pinned bundled binary is found by absolute path and local-retrieval tools work. Only the `PATH` convenience was unwired, and `prependRipgrepDirectoryToPath` / `resolveRipgrepDirectory` are removed.

A bare `rg` typed inside agent `bash` therefore resolves against the owner's own `PATH`, or fails when there is none. **That is now the intended behaviour**, for three reasons:

1. the standalone-product guarantee is already met where it matters — `fffind` / `ffgrep` / `fff-multi-grep` and the sandbox engine use the pinned binary by absolute path, so no product capability depends on the user installing ripgrep;
2. agent `bash` runs inside the pinned sandbox engine, which owns the child environment. `SandboxRuntimeConfig` exposes network, filesystem, and `ripgrep.command` — there is no `PATH` injection knob, so restoring the prepend would mean changing accepted, archived sandbox behaviour for a convenience;
3. silently resolving the owner's `rg` to a different pinned build is a surprise, not a service. A shell command typed in `bash` should behave like a shell command.

Recorded where the next reader will look: [`architecture/overview.md`](../architecture/overview.md) sandbox section. The stale `main.ts` claim of a "staged `rg` PATH prepend" in [`architecture/codebase-map.md`](../architecture/codebase-map.md) — which described the deleted helper and had survived it — was corrected in the same change.

### 4. Permission presets are not versioned on disk — `prerequisite`

`PERMISSION_PRESET_VERSION = 4` was read by nothing and is removed. Stored permission settings carry no version field anywhere in the tree, so a user's stored settings cannot be detected as predating the shipped preset.

The preset is on its fourth revision with no migration signal. Confirm how stored settings merge with the shipped preset **before** the next revision.

**Owner 2026-08-28: the next preset change.** Still open. This is cheap to answer while nothing is changing and expensive to answer during a revision, but it needs the merge semantics decided rather than a version number re-added — a number that nothing reads would repeat the original mistake.

### 5. Protocol values cross the boundary unvalidated — `defect` (low)

Removed, each called only by its own test: `isSandboxStatus`, `isWebSourceRecord`, `isFontFamilyName`, `isContextPromptSectionKind`.

These are shapes that cross the IPC seam, where AGENTS.md expects JSON-safe validated data. Individually low-risk; together they show validation was written and never adopted. If any of these values can originate anywhere but trusted first-party code, validation has to come back at the parse site.

**Owner 2026-08-28: whichever slice next admits one of these from outside first-party code.** Still open, deliberately unfixed. All four currently originate in first-party main-process code, so adding validators today would recreate exactly the unwired-guard problem this note documents. Validation belongs at the parse site when a parse site appears.

## Related

- [`2026-08-27-prerequisite-runtime-and-renderer-decomposition.md`](./2026-08-27-prerequisite-runtime-and-renderer-decomposition.md) — structural finding from the same pass.
- [`version/v4/logs/2026-08-27-remove-m0-source-freeze.md`](../version/v4/logs/2026-08-27-remove-m0-source-freeze.md) — the V4 scaffolding removed in the same pass, and what resuming V4 must restore.
