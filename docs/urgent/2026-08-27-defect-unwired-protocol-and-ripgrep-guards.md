# Defect — gaps left behind by validators and disclosures that were never called

**Kind:** defect
**Status:** Proposed — symbols removed 2026-08-27; the underlying gaps are **not** fixed

A deslop pass on 2026-08-27 found eight exports that were correct, tested, and called from nowhere. The owner directed that they be deleted rather than wired ("remove unwired guards/disclosures too"), and they are now gone from source.

**This note exists because deleting the code did not close the gaps it named.** A guard that nothing called was already not protecting anything; removing it changed the source, not the behaviour. Each gap below is still open, and each is cheaper to fix deliberately than to rediscover.

## Open gaps

### 1. The protocol version is stamped but never validated — `defect`

`protocolVersion` is written onto every envelope (`packages/application/src/bootstrap.ts:385`) and no code path checks it on receipt. `isSupportedProtocolVersion` was the only implementation of that check; it is removed.

Low risk while the renderer and main process always ship together. It becomes real the moment a stale packaged renderer can meet a newer main process — which is exactly what V4's update path introduces. Decide the fail-closed behaviour when V4 resumes, not after.

### 2. No user-facing disclosure of change-ledger retention — `safety honesty`

`CHANGE_LEDGER_DISCLOSURE` stated where change data lives, a 250 MiB cap, and Approve/Undo semantics. Only a test ever read it; it is removed.

The retention behaviour it described **still exists** — the ledger still writes to application data and still caps. AGENTS.md requires the product to be honest about what it retains, and there is now no string anywhere that says so. Either surface this where change review or Settings explains retention, or accept explicitly that the cap is undocumented.

### 3. The bundled ripgrep is not on `PATH` for agent `bash` — `defect` (narrow)

Scope this correctly. `resolveRipgrepPath` **is** wired (`apps/desktop/electron/main.ts:528`, `packages/runtime/src/sandbox-runtime.ts:243`), so the pinned bundled binary is found by absolute path and local-retrieval tools work. Only the `PATH` convenience was unwired, and `prependRipgrepDirectoryToPath` / `resolveRipgrepDirectory` are removed.

Remaining effect: a bare `rg` typed inside agent `bash` resolves against the user's system `PATH`, or fails when there is none, instead of using the pinned build. Acceptable if intended; it should be intended rather than accidental.

### 4. Permission presets are not versioned on disk — `prerequisite`

`PERMISSION_PRESET_VERSION = 4` was read by nothing and is removed. Stored permission settings carry no version field anywhere in the tree, so a user's stored settings cannot be detected as predating the shipped preset.

The preset is on its fourth revision with no migration signal. Confirm how stored settings merge with the shipped preset **before** the next revision.

### 5. Protocol values cross the boundary unvalidated — `defect` (low)

Removed, each called only by its own test: `isSandboxStatus`, `isWebSourceRecord`, `isFontFamilyName`, `isContextPromptSectionKind`.

These are shapes that cross the IPC seam, where AGENTS.md expects JSON-safe validated data. Individually low-risk; together they show validation was written and never adopted. If any of these values can originate anywhere but trusted first-party code, validation has to come back at the parse site.

## Related

- [`2026-08-27-prerequisite-runtime-and-renderer-decomposition.md`](./2026-08-27-prerequisite-runtime-and-renderer-decomposition.md) — structural finding from the same pass.
- [`version/v4/logs/2026-08-27-remove-m0-source-freeze.md`](../version/v4/logs/2026-08-27-remove-m0-source-freeze.md) — the V4 scaffolding removed in the same pass, and what resuming V4 must restore.
