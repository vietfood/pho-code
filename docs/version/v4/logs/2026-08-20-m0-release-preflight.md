# V4 Milestone 0 — release preflight and packaging proof

Date: 2026-08-20
Status: implemented in source; signed/notarized artifact **not verified**
Owner: repository owner
Plan: V4 Milestone 0
Related: [promotion and planning](./2026-08-20-promotion-and-planning.md), [release preflight freeze](../release-preflight.md)

## Intent

Close identity, license, signing, platform, and origin decisions in source, and add a fail-closed hardened-runtime packaging proof that cannot emit an unsigned artifact labeled releasable.

## Changes

- Frozen identity and placeholder HTTPS origins in `scripts/release-identity.ts` and `scripts/release-origins.ts`.
- MIT `LICENSE` plus binary `EULA.md`; entitlements under `apps/desktop/build/` without library-validation exceptions.
- `bun run package:mac` remains the unsigned local `dir` target.
- `bun run package:mac:proof` requires Developer ID + notarization credentials, sets `forceCodeSigning`, hardened runtime, DMG/ZIP, `m0-proof` artifact names, and writes only to `apps/desktop/release-proof`.
- Packaging unit tests cover local-vs-proof configuration and missing-credential failure.

## Verification

| Check | Result |
| --- | --- |
| `bun test scripts/mac-packaging-config.test.ts scripts/package-mac.test.ts` | **unit verified** — 10 pass |
| `bun run typecheck` | PASS |
| `bun run lint` | PASS (8 pre-existing react-hooks warnings, 0 errors) |
| `env -u CSC_* -u PHO_CODE_CODESIGN_IDENTITY -u APPLE_* bun run package:mac:proof` | **unit/script verified** — exits 1 with `No releasable artifact was written`; no `apps/desktop/release-proof` directory |
| `bun run package:mac:proof` with signing credentials | **not verified** |
| `codesign --verify --deep --strict --verbose=2` | **not verified** |
| `spctl --assess --type execute --verbose` | **not verified** |
| `xcrun stapler validate` | **not verified** |
| Packaged journeys against a hardened proof `.app` | **not verified** |
| Clean-user quarantined launch | **not verified** (owner) |

Unsigned `package:mac` / `test:packaged` were not required to prove the fail-closed proof config and were not treated as release evidence.

## Stop conditions still open

Do not build a public V4 beta until the owner records legal name clearance (or a rename/migration), Apple Developer Team use in the release environment, and real HTTPS origins replacing `.invalid` placeholders. Nested native load under hardened runtime is unproven until a signed proof artifact exists.

## Handoff

Keep Milestone 1 off `0.0.0` public versions until this proof artifact is actually signed, notarized, stapled, and exercised. Local unsigned packaging remains the development contract.
