# Milestone 5 code review

Date: 2026-08-13

## Verdict

Milestone 5 is accepted, and the personal v1 is complete. Pho Code now has a self-contained unsigned macOS application bundle, app-owned mutable Pi data, immutable packaged feature lookup, an in-app API-key path, and a packaged permission-dialog proof that does not require Pi CLI or user-global Pi packages.

This acceptance applies to the personal Apple Silicon macOS build. It does not claim a signed/notarized public release, verified Linux support, production sandboxing, automatic updates, or exhaustive supply-chain/license auditing.

## Reviewed boundaries

- `apps/desktop/electron/main.ts` selects `process.resourcesPath` for packaged feature loading and keeps the resource override development-only.
- `packages/runtime/src/resource-locator.ts` fails closed when a packaged feature is absent or has the wrong package identity.
- `packages/runtime/src/features.ts` now rejects a packaged permission feature whose version is not the pinned `24.0.0`.
- `scripts/stage-app-resources.ts` stages the permission extension, its selected runtime dependencies/assets, and license material.
- `scripts/package-mac.ts` builds a self-contained Electron application with production dependencies, baked feature resources, and notices.
- `packages/runtime/src/credentials.ts` imports supported API keys through Pi without returning stored secret values.
- `apps/desktop/tests/packaged.spec.ts` launches the packaged application with isolated data and a PATH without `pi`, then exercises the baked permission dialog.

## Review corrections

The packaged composition root previously honored `PHO_CODE_RESOURCES_DIR`, a development seam that could replace baked feature code in the application bundle. Packaged runs now always use `process.resourcesPath`; the override remains available only to source development and tests.

The runtime previously trusted the manifest identity but reported the expected permission-feature version without checking the staged package version. Feature resolution now rejects a mismatched version with a named diagnostic.

## Acceptance evidence

The implementing pass recorded 100 unit/integration checks, eight Electron journeys, the macOS package build, and the packaged smoke lane as passing. This acceptance review reran the risk-focused subset rather than duplicating every prior check:

```text
bun run typecheck     PASS
bun run lint          PASS
focused package/runtime checks  8/8 PASS
bun run package:mac   PASS — regenerated unsigned Apple Silicon app
bun run test:packaged PASS — packaged permission feature with no Pi CLI
```

The inspected artifact is `Pho Code.app` for Apple Silicon, has bundle identifier `dev.vietfood.phocode`, uses app-owned Pi data at `userData/pi-agent`, and contains the baked permission feature and third-party notices under `Contents/Resources`.

## v1 closure

The v1 critical path ends here. Further MCP-backed capabilities, additional baked skills/extensions, session archive/delete UI, Linux/public distribution, signing/notarization, isolation, and other production work belong to the active [next-version roadmap](../../../roadmap-vnext.md). They are not incomplete v1 milestones.
