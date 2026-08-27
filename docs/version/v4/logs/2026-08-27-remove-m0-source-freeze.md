# 2026-08-27 — Milestone 0 source-freeze constants removed while V4 is held

**Owner decision.** During a repository-wide deslop pass the owner directed that V4's unreferenced Milestone 0 scaffolding be removed now and re-established when V4 resumes ("remove v4 deadcode, we do that later"). This log exists so the removal is not mistaken later for scaffolding that never existed.

V4 remains **Pending**. This changes no V4 acceptance state, no gate, and no milestone status.

## Removed

| Path | Why | Consumers at removal |
| --- | --- | --- |
| `scripts/release-origins.ts` (whole file) | Placeholder website/update origins for website work that has not started | `mac-packaging-config.test.ts` only |
| `scripts/mac-nested-code.ts` (whole file) | Nested-code inventory patterns for signing that is not implemented | `mac-packaging-config.test.ts` only |
| `release-identity.ts`: `TECHNICAL_SLUG`, `PUBLIC_VERSION_LINE`, `RELEASE_CHANNEL`, `APPLICATION_DATA_IDENTITY`, `IDENTITY_FREEZE` | Frozen identity notes with no reader | none / test only |

The matching `describe` blocks in `scripts/mac-packaging-config.test.ts` were removed with them.

## Deliberately kept

- **The fail-closed proof packager.** `scripts/mac-packaging-config.ts` and `scripts/package-mac.ts` stay, including `requireProofSigningInputs` — the live gate that refuses to package without Developer ID and notarization credentials.
- **The unsigned-fallback proof.** `assertProofConfigCannotFallbackUnsigned` was production code called only by a test. Rather than delete it and lose the assertion, its body moved into `scripts/mac-packaging-config.test.ts` as `assertCannotFallbackUnsigned`. The proof-flavor test still asserts `forceCodeSigning`, `hardenedRuntime`, `notarize`, and a non-null identity. **The gate is not weakened.**
- **Identity constants the packager reads:** `PUBLIC_PRODUCT_NAME`, `BUNDLE_IDENTIFIER`, `STAGED_APP_PACKAGE_NAME`, `RELEASE_ARCHITECTURE`, `MINIMUM_MACOS_VERSION`, `BUILD_NUMBER_ENV`, `CODESIGN_IDENTITY_ENV`, `PROOF_ARTIFACT_LABEL`, `COPYRIGHT`, `APP_CATEGORY`.

## What resuming V4 must re-establish

The values themselves are not lost — [`release-preflight.md`](../release-preflight.md) still records the channel, version line, architecture, minimum macOS, artifact label, public-name review, and the placeholder origin table. Milestone 0 must restore them as source constants, plus the nested-code inventory, before signing work proceeds. Treat the preflight document, not git history, as the reference.

The bundle identifier `dev.vietfood.phocode` is unchanged, so no application-data or Keychain migration is implied.

## Verification

`bun run typecheck` 0 errors · `bun run lint` 0 errors · `bun test scripts` 12 pass / 0 fail. Not packaged-verified: `package:mac` was not run, because the removal touches no code path the packager executes. Next check if that is wanted: `bun run package:mac`.
