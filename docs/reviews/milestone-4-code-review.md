# Milestone 4 code review

Date: 2026-08-13

## Decision

Milestone 4 is accepted and Milestone 5 is active.

The application now has a compact typed Settings surface for application appearance and the supported behavior of the baked permission feature. Feature composition remains fixed: no extension, skill, prompt, package, or MCP installation/configuration surface was introduced.

One adapter-validation defect found during this review was corrected before acceptance. The application previously accepted a top-level permission deny-with-reason object and loose `shellTools` entries that `@gotgenes/pi-permission-system` `24.0.0` rejects. The adapter now follows that pinned schema for those shapes and has focused regression coverage.

## Evidence inspected

- `packages/protocol/src/settings.ts` defines explicit appearance and permission snapshots/patches rather than a generic key/value settings protocol.
- `packages/application/src/bootstrap.ts` validates settings commands and keeps appearance metadata independent from permission configuration.
- `packages/runtime/src/permission-settings.ts` owns the package-version-specific policy presets, Custom detection, strict config validation, field preservation, project-override detection, and atomic write.
- `packages/runtime/src/pi-runtime.ts` refuses permission changes during an active run and reloads/rebinds the active Pi session after an idle write.
- `packages/runtime/src/extension-host.ts` validates dialog result shapes/options and projects the permission feature's YOLO status.
- `packages/runtime/src/resources.ts` computes health from declared expected resources instead of treating a silent miss as loaded.
- `packages/ui/src/settings-view.tsx` provides theme selection, Guarded/Balanced presets, Custom preservation notice, review-log control, shared-scope/project-override disclosure, and a two-step YOLO warning.
- `packages/ui/src/chat-header.tsx` keeps YOLO visibly indicated while active.
- `apps/desktop/tests/settings.spec.ts` records the representative Electron journey: persist appearance, apply Guarded, relaunch, and complete a gated tool call.

## Verification performed in this review

```text
bun test packages/runtime/test/permission-settings.test.ts \
  packages/runtime/test/resources.test.ts \
  packages/application/test/settings.test.ts       PASS (12/12)
bun run typecheck                                  PASS
bun run lint                                       PASS
bun run build                                      PASS
```

This review deliberately did not repeat the full unit or Electron lanes. The implementing pass records 91 unit/integration tests and seven Electron specs as passing. Those records are supporting evidence, not checks independently rerun here. The production build was rerun and passed, with a non-blocking Node deprecation warning originating in the build toolchain.

## Product-boundary result

The current documentation is aligned with the owner's core philosophy: Pi is the embedded agent engine, while executable capabilities come only from the source-controlled baked-feature manifest. The application does not inherit extension/skill/prompt/package composition from another Pi installation and does not ask the user to install those features separately.

The shared Pi agent directory was a separate operational-data decision. The owner resolved it at the start of Milestone 5: Pho Code now defaults to app-owned Pi data under Electron `userData/pi-agent`; `PHO_CODE_AGENT_DIR` remains an explicit external/shared override. This changes auth/model/session/permission state location without changing the baked-feature boundary.

## Milestone 5 transition

Milestone 5 remains the correct next milestone. Before creating artifacts, settle product identity and data locations because both affect package names, IPC namespaces, environment variables, Electron `userData`, mutable Pi state, and migration behavior.

Confirmed identity:

- display name: `Pho Code`;
- repository/package slug: `pho-code`;
- workspace package scope: `@pho-code/*`;
- environment prefix: `PHO_CODE_*`;
- IPC namespace: `pho-code:v1:*`;
- bundle identifier: `dev.vietfood.phocode`;
- keep generic architecture names such as `HarnessRuntime` and `HarnessFeatureManifest`, because they describe roles rather than the old brand.

Use ASCII `Pho Code` in executable, package, filesystem, and protocol identifiers. A future visual mark may use `Phở`, but Unicode should not leak into paths, environment variables, bundle identifiers, or shell commands.

Naming caveat: `phocode.com` already hosts an archived Vietnamese programming blog called `Phở Code`. That is not a blocker for this personal application, but it means the name is not a clean unique public brand and this recommendation is not trademark/domain clearance. Revisit naming before any public distribution.

Because no public build exists, the rename was applied at the start of Milestone 5 before packaging creates compatibility obligations. This is an intentional pre-release clean break: old application metadata and shared Pi operational data are not migrated automatically.

After those two decisions, Milestone 5 should proceed in this order:

1. add the packaged `ResourceLocator` and stage the pinned permission feature plus dependencies/licenses;
2. add a credential path that does not require Pi CLI;
3. build and smoke an unsigned macOS artifact outside the repository with no global Pi feature packages.

Packaging hardening, signing/notarization, automated auditing, containers, updates, and verified Linux artifacts remain deferred.
