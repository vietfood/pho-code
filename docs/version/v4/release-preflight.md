# V4 Milestone 0 release preflight

Owner-recorded freeze for public identity, distribution rights, signing, platform floor, and website origins. This is not a public release candidate and does not accept V4.

**Pending (2026-08-20):** the owner cannot enroll in the Apple Developer Program, so Developer ID, notarization, Gatekeeper, stapler, and clean-user launch evidence remain unverified. Do not treat the fail-closed proof packager as a completed Milestone 0. See the [hold record](./logs/2026-08-20-hold-pending-apple-developer.md).

## Identity freeze

| Field | Value |
| --- | --- |
| Public product name | `Pho Code` |
| Technical slug | `pho-code` |
| Bundle identifier / Keychain / application-data identity | `dev.vietfood.phocode` |
| Public version line | `4.0.0-beta.N` (not used by the Milestone 0 proof artifact) |
| macOS build number | monotonic positive integer from `PHO_CODE_BUILD_NUMBER` |
| Channel | `beta` |
| Architecture | Apple Silicon `arm64` only |
| Minimum macOS | 14.0 |
| Proof artifact label | `m0-proof` — never `4.0.0-beta` |

Source of truth: [`scripts/release-identity.ts`](../../../scripts/release-identity.ts). Changing the bundle identifier after a public build would require a data/Keychain migration log before source changes.

## Public-name review

Completed as an owner-facing records search, not a paid trademark opinion:

- ASCII `Pho Code` remains the executable and bundle name. Unicode `Phở` must not appear in paths, environment variables, or bundle identifiers.
- [phocode.com](https://phocode.com/) hosts an archived personal Vietnamese programming blog titled Phở Code (about page: Long, started January 2016). The domain and blog name are a residual confusion and clearance risk, not evidence that this desktop app owns that mark.
- [Phoenix Code](https://phcode.io/) / [phcode.dev](https://phcode.dev/) is a distinct code editor. Pho Code must not use those hosts as download, privacy, or update origins.
- No USPTO or Vietnam NOIP registration for this product was located during this pass. Residual risk remains until the owner records legal clearance or a rename-plus-migration.

If the public name or bundle id changes, stop and write a separate identity/data migration log before modifying source.

## License and distribution rights

| Item | Right / note |
| --- | --- |
| Pho Code source | MIT, [`LICENSE`](../../../LICENSE) |
| Signed desktop binary | MIT plus [`EULA.md`](../../../EULA.md) beta terms (trusted workspaces, no warranty, no hostile-workspace claim) |
| Pi SDK and most copied/adapted TypeScript | MIT; see [`docs/references-and-attribution.md`](../../references-and-attribution.md) |
| `@anthropic-ai/sandbox-runtime` | Apache-2.0 |
| Bundled `rg` | Unlicense OR MIT |
| GitHub MCP server binary | MIT (`github/github-mcp-server` `v1.9.0`) |
| Provider / GitHub / Simple Icons marks | identification use only; not standalone redistributable brand kits |
| Recursive shipped-notice closure | **incomplete** until Milestone 3/4; `docs/third-party-notices.md` remains a selected inventory |

A public candidate must not ship until the owner confirms this MIT/EULA pair (or replaces it) and Milestone 4 completes notices.

## Apple signing authority

Secrets stay out of git and logs. The proof packager reads:

| Mechanism | Environment |
| --- | --- |
| Developer ID identity name | `PHO_CODE_CODESIGN_IDENTITY` or `CSC_NAME` |
| PKCS#12 alternative | `CSC_LINK` + `CSC_KEY_PASSWORD` |
| Notarization (API key) | `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |
| Notarization (Apple ID) | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

Template: [`.env.example`](../../../.env.example). Missing credentials fail before electron-builder and write no `release-proof` artifact. Team name, certificate files, and notarization passwords are owner-held.

## Website / release origins

Exact HTTPS locations are **named placeholders** until the separate website work publishes them ([`scripts/release-origins.ts`](../../../scripts/release-origins.ts)):

- download, release notes, privacy, security contact, update feed, and payload host under `https://website-pending.pho-code.invalid`
- TLS, feed publication, artifact replacement, and revocation are owned by that website/release host, not this repository
- no wildcard host policy; the renderer cannot edit these values

## Hardened-runtime entitlements

Committed under `apps/desktop/build/`:

- `com.apple.security.cs.allow-jit` — Chromium/V8
- `com.apple.security.cs.allow-unsigned-executable-memory` — Electron helper requirement

Forbidden unless a later owner-accepted exception is evidenced: `get-task-allow`, `disable-library-validation`, DYLD environment, unsigned-library loading, and `disable-executable-page-protection`.
