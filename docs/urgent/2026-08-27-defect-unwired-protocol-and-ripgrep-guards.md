# Defect — gaps left behind by validators and disclosures that were never called

**Kind:** defect
**Status:** Closed 2026-08-28 — gaps 2 and 3 implemented, gaps 4 and 5 answered, gap 1 deferred to V4 by decision and recorded in its plan

A deslop pass on 2026-08-27 found eight exports that were correct, tested, and called from nowhere. The owner directed that they be deleted rather than wired ("remove unwired guards/disclosures too"), and they are now gone from source.

**This note exists because deleting the code did not close the gaps it named.** A guard that nothing called was already not protecting anything; removing it changed the source, not the behaviour. Each gap below is still open, and each is cheaper to fix deliberately than to rediscover.

## Open gaps

### 1. The protocol version is stamped but never validated — `defect`

`protocolVersion` is written onto every envelope (`packages/application/src/bootstrap.ts:385`) and no code path checks it on receipt. `isSupportedProtocolVersion` was the only implementation of that check; it is removed.

Low risk while the renderer and main process always ship together. It becomes real the moment a stale packaged renderer can meet a newer main process — which is exactly what V4's update path introduces. Decide the fail-closed behaviour when V4 resumes, not after.

**Deferred to V4 by decision, 2026-08-28, and recorded in V4's own plan so a resume cannot miss it.** V4 is Pending, and its update path is what creates the mismatch this guard would catch; re-adding a validator now would be another unwired guard. Resuming V4 must handle it alongside the Milestone 0 constants listed in [`version/v4/logs/2026-08-27-remove-m0-source-freeze.md`](../version/v4/logs/2026-08-27-remove-m0-source-freeze.md).

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

**Correction 2026-08-28:** the first paragraph and reason 1 above incorrectly grouped local retrieval with the sandbox's ripgrep resource. Retrieval was FFF-native and never called `resolveRipgrepPath`; only the sandbox engine uses that binary. Canonical FFF-backed `find`/`grep` and the correction evidence are recorded in [Canonical FFF retrieval](../archive/urgent/2026-08-28-defect-canonical-fff-retrieval.md). The original wording remains visible here so the dated record does not hide the mistake.

Recorded where the next reader will look: [`architecture/overview.md`](../architecture/overview.md) sandbox section. The stale `main.ts` claim of a "staged `rg` PATH prepend" in [`architecture/codebase-map.md`](../architecture/codebase-map.md) — which described the deleted helper and had survived it — was corrected in the same change.

### 4. Permission presets are not versioned on disk — `prerequisite`

`PERMISSION_PRESET_VERSION = 4` was read by nothing and is removed. Stored permission settings carry no version field anywhere in the tree, so a user's stored settings cannot be detected as predating the shipped preset.

The preset is on its fourth revision with no migration signal. Confirm how stored settings merge with the shipped preset **before** the next revision.

**Answered 2026-08-28: they do not merge — they are recognised, and a version number was the wrong mechanism.**

Reading `permission-settings.ts` end to end:

- a stored config is never rewritten wholesale. `syncHarnessPermissionPolicy` overlays exactly two things onto whatever is on disk — the harness allow-list always, and the managed web pair only when the profile is not Custom — and writes only if something actually changed;
- the profile label is **derived, not stored**. `detectPermissionProfile` compares the stored policy, with those managed overlays applied, against each preset's `current` snapshot and an optional `legacy` one;
- `legacy` *is* the migration mechanism. A v2-era file still recognises as guarded or balanced without being rewritten, exactly as its comment says: "Recognition-only snapshots preserve existing v2 files without rewriting their decisions";
- anything unrecognised is Custom, preserved verbatim and never overlaid with the managed web pair.

So a stored version number would not have protected anything a shape comparison does not already protect. The real rule a preset revision must follow is: **keep the outgoing snapshot as a `legacy` entry**, or every config written under the old preset silently re-labels itself Custom and Settings stops offering the owner their own profile.

That rule was already guarded by tests, but only incidentally — the fixtures existed under names describing their mechanics ("treats string catch-alls as equivalent to a `*` map"). `permission-settings.test.ts` now states it directly in `keeps recognising configs written under superseded presets`, so the next reviser meets the reason rather than inferring it.

### 5. Protocol values cross the boundary unvalidated — `defect` (low)

Removed, each called only by its own test: `isSandboxStatus`, `isWebSourceRecord`, `isFontFamilyName`, `isContextPromptSectionKind`.

These are shapes that cross the IPC seam, where AGENTS.md expects JSON-safe validated data. Individually low-risk; together they show validation was written and never adopted. If any of these values can originate anywhere but trusted first-party code, validation has to come back at the parse site.

**Answered 2026-08-28: there is no parse site, so a validator would be unwired by construction.**

Each of the four shapes is *constructed* by first-party main-process code, never deserialised whole from a foreign payload — checked rather than assumed. The interesting case is `WebSourceRecord`, whose fields come off the open internet: `web-client.ts:213` builds it field by field as `{ title, url, provider }` from already-parsed values, so the record's *shape* never leaves first-party control even though its *content* is untrusted. Content is a sanitisation concern, and AGENTS.md already routes it — tool inputs and outputs render as untrusted data.

Validation belongs at a parse site, when a parse site appears. Adding it now would recreate exactly the problem this note documents.

## Related

- [`2026-08-27-prerequisite-runtime-and-renderer-decomposition.md`](./2026-08-27-prerequisite-runtime-and-renderer-decomposition.md) — structural finding from the same pass.
- [`version/v4/logs/2026-08-27-remove-m0-source-freeze.md`](../version/v4/logs/2026-08-27-remove-m0-source-freeze.md) — the V4 scaffolding removed in the same pass, and what resuming V4 must restore.
