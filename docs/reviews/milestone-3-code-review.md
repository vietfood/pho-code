# Milestone 3 code and UX review

Date: 2026-08-13

## Decision

Milestone 3 is accepted. The application now composes a source-controlled feature manifest, loads `@gotgenes/pi-permission-system` `24.0.0` without inheriting arbitrary user/project Pi features, presents its RPC permission flow in the desktop UI, keeps the active session visible immediately, and has removed the former Resources product surface. The revised conversation UI is materially more usable, but visual refinement remains independent of the harness milestone gate.

Milestone 4 is active. It adds settings for the behavior of already-baked features, beginning with appearance and permission policy. This does not reopen feature composition: users still cannot install, remove, enable, disable, or point the harness at arbitrary extensions, skills, prompts, or MCP servers.

## Evidence inspected

- `packages/runtime/src/features.ts` owns the immutable feature manifest and pins the permission feature ID/version.
- `packages/runtime/src/pi-runtime.ts` sets `noExtensions`, `noSkills`, `noPromptTemplates`, and `noThemes`, then supplies only flattened manifest paths/factories.
- `packages/runtime/src/extension-host.ts` transports confirm/select/input requests, notifications, cancellation, timeout, replacement, and disposal through one request lifecycle.
- `packages/ui/src/host-dialog.tsx` renders inline approval/input UI with Escape handling and focus containment/restoration.
- `packages/runtime/src/pi-runtime.ts` merges the active session into session listings, fixing the Milestone 2 state-precedence defect.
- `packages/ui/src/app-sidebar.tsx` contains projects/sessions and diagnostics without a Resources route or package controls.
- `apps/desktop/tests/permission.spec.ts` exercises the actual pinned permission package in Electron.
- `packages/runtime/test/pi-runtime.test.ts` covers ambient-feature isolation, context preservation, dialog rebind, permission selection, and disposal with a pending request.

The owner previously supplied real-provider chat evidence. This review ran only `bun run typecheck` and `bun run lint`; both passed. It did not repeat the already-recorded unit, Electron, or build lanes.

## What is working well

The feature boundary is now a product boundary rather than a catalog abstraction. `HarnessFeatureManifest` is small, source-controlled, and flattened only in the privileged runtime. The renderer sees health/version data, never executable factories or mutable resource controls.

The permission integration uses the package as a real Pi extension rather than copying its policy engine. The host owns transport and presentation while the extension owns the meaning of Approve, Approve for session, Deny, and Deny with reason. Unsupported custom TUI surfaces throw a useful `Error`, so the previous `[object Object]` failure mode is gone.

The renderer remains shell-neutral. Model/thinking selection, host dialogs, session navigation, transcript state, and feature diagnostics cross narrow JSON-safe commands/events; Electron and Node stay outside the React/UI packages.

## Carryover findings

### M3-001 — P1 before packaging — Baked resource lookup is still development-layout dependent

`packages/runtime/src/features.ts:28-38` resolves the permission package through the installed `node_modules` graph, and `packages/runtime/src/resource-locator.ts` implements that lookup with `require.resolve`. This is correct for the current source/dev build but does not prove that the extension source, schema/assets, native dependencies, and license will exist at those paths in an installed application.

Required change: when installer work begins, add a packaged `ResourceLocator` backed by `process.resourcesPath`, stage the exact package and runtime dependencies outside immutable/executable-hostile ASAR locations as required, and smoke-test the installed macOS artifact. This is not a Milestone 4 blocker because packaging remains deferred.

### M3-002 — P2 — Feature health can report an unloaded feature as loaded

`packages/runtime/src/resources.ts:47-74` determines load success only from loaded extensions and returns `loaded` when no matching extension and no matching diagnostic exists. A skill-only/prompt-only future feature would therefore report loaded without examining skills/prompts; an extension missing silently from the loader can also become a false positive.

Required change: make manifest entries declare their expected resource counts/kinds and project health from the corresponding Pi loader results. Until that exists, do not use the feature status as an authorization or readiness decision. Fix this in Milestone 4 before settings displays feature health as authoritative.

### M3-003 — P2 — Permission status is discarded

`packages/runtime/src/extension-host.ts:188-203` emits notifications but implements `setStatus` as a no-op. The permission package uses status for runtime configuration signals such as YOLO mode. A settings page that saves policy without showing the active/effective state could therefore mislead the user.

Required change: project the small, named status values required by baked features, or expose the same state through the explicit permission-settings snapshot. Do not create a generic extension-widget/status renderer.

### M3-004 — P2 — Dialog results should be validated against the pending request

`packages/runtime/src/extension-host.ts:104-145` remembers only the dialog kind. A forged or defective renderer payload can resolve a select request with a string that was not one of the offered options, or provide fields for the wrong dialog kind. The local renderer is constrained and trusted, but the privileged boundary should still validate the decision it applies.

Required change: retain the offered options with the pending request and accept exactly one result shape for its kind. Unknown request IDs should remain harmless. This is a small Milestone 4 reliability fix, not a reason to reopen the working Milestone 3 permission path.

## Milestone 4 product decision

The feature set remains immutable; feature behavior may be configurable. The distinction is:

- source/build time chooses which extensions, skills, prompts, and MCP integrations exist;
- runtime settings adjust only documented behavior exposed by those named features;
- the UI contains no generic schema renderer, JSON key/value editor, package control, path picker, or arbitrary server form;
- every settings section is application-owned, typed, validated, and deliberately designed for its feature.

“Permission strictness” is not one scalar in `pi-permission-system`. Its policy is a rule set with `allow`, `ask`, and `deny` decisions across tool, path, external-directory, bash, skill, and MCP surfaces. Milestone 4 should therefore expose named, versioned presets and a separate explicit YOLO control rather than a slider whose security meaning is unclear.

## Milestone 4 representative settings design

### Settings contract

Use explicit commands rather than a generic `setSetting(key, value)` bridge:

```ts
type ThemePreference = "system" | "light" | "dark";
type PermissionProfileId = "guarded" | "balanced" | "custom";

interface HarnessSettingsSnapshot {
  appearance: {
    theme: ThemePreference;
  };
  permission: {
    profile: PermissionProfileId;
    yoloMode: boolean;
    permissionReviewLog: boolean;
    projectOverridePresent: boolean;
    appliesToSharedPiAgentDir: true;
  };
}

interface UpdateAppearanceSettingsInput {
  theme: ThemePreference;
}

interface UpdatePermissionSettingsInput {
  profile?: Exclude<PermissionProfileId, "custom">;
  yoloMode?: boolean;
  permissionReviewLog?: boolean;
}
```

`DesktopBridge` should expose `getSettings`, `updateAppearanceSettings`, and `updatePermissionSettings`. The application layer validates commands and coordinates persistence/reload. The runtime owns the permission adapter because it knows the Pi agent directory and active session lifecycle. The renderer never receives filesystem paths for writing or arbitrary config objects.

### Storage and scope

Appearance is application metadata under Electron `userData`; migrate metadata explicitly when adding the field. Permission policy belongs in the exact global file consumed by the pinned feature: `<agentDir>/extensions/pi-permission-system/config.json`.

That global file is shared with normal Pi processes using the same agent directory. The Settings UI must say so before saving. Milestone 4 edits global policy only. If `<workspace>/.pi/extensions/pi-permission-system/config.json` exists, show a read-only “workspace override present” notice because the package may merge it for a trusted workspace; do not claim that the displayed global preset is the effective policy.

The permission adapter owns this package-version-specific integration in one file. It should parse before writing, preserve fields not owned by the simple UI, patch only the selected preset plus `yoloMode`/`permissionReviewLog`, validate the resulting supported shape, and use a same-directory temporary file plus atomic rename. An invalid or unrecognized existing config must fail closed with a useful message rather than being overwritten.

### Permission profiles

Profiles are application-owned templates whose exact generated policy is reviewed in source and versioned with the adapter:

- **Guarded (recommended):** ask by default, ask for workspace reads and mutations, ask for external-directory access, and deny selected sensitive path patterns.
- **Balanced:** allow ordinary read/search/list operations inside the workspace; ask for write/edit/bash, skills, MCP calls, and external-directory access; deny selected sensitive path patterns.
- **Custom:** shown when the existing file does not exactly match a managed preset. Unrelated settings changes preserve its policy. The user must explicitly choose Guarded or Balanced before the harness replaces the policy section.

The Milestone 4 version-1 templates are:

```ts
const GUARDED_PERMISSION = {
  "*": "ask",
  path: {
    "*": "ask",
    "*.env": "deny",
    "*.env.*": "deny",
    "*.env.example": "ask",
    "~/.ssh/*": "deny",
  },
  external_directory: "ask",
} as const;

const BALANCED_PERMISSION = {
  "*": "ask",
  path: {
    "*": "allow",
    "*.env": "deny",
    "*.env.*": "deny",
    "*.env.example": "allow",
    "~/.ssh/*": "deny",
  },
  read: "allow",
  find: "allow",
  grep: "allow",
  ls: "allow",
  write: "ask",
  edit: "ask",
  bash: "ask",
  skill: "ask",
  mcp: "ask",
  external_directory: "ask",
} as const;
```

Preserve the written order of each pattern map because the permission package uses last-matching-rule wins; do not alphabetically sort those keys during serialization. Preset detection compares the policy semantically while retaining pattern order. The adapter owns a preset version so future policy changes are explicit migrations rather than silently changing the meaning of an existing saved choice.

YOLO mode remains separate because the package rewrites `ask` decisions to `allow` while preserving explicit denies. Enabling it requires a warning and a second confirmation, and the conversation chrome must show a persistent visible indicator while it is active. `doublePressToConfirm` should not appear in this desktop settings page because the pinned package documents it as TUI-only; RPC/frontend dialogs are unaffected.

### Apply behavior

Settings are editable only while the active session is idle. On Save and Apply:

1. validate and atomically persist the relevant store;
2. reload the active Pi session resources through the existing runtime operation;
3. let the existing session replacement/rebind path cancel stale dialogs and bind the permission host again;
4. publish a fresh settings/feature snapshot;
5. retain the previous on-disk state when validation or persistence fails; if persistence succeeds but live reload fails, report “saved; restart required” instead of pretending the active session changed.

There is no general feature Reload button. The reload is an internal consequence of applying a supported setting.

## Milestone 4 exit checks

- Settings is reachable without an active workspace and does not displace the conversation as the primary surface.
- System/light/dark theme persists across relaunch.
- Guarded and Balanced map to reviewed exact policies; an unmatched existing policy is displayed as Custom and is not overwritten by unrelated changes.
- Permission writes preserve unowned valid fields and refuse to replace invalid/unrecognized configuration.
- The UI discloses that global permission settings affect other Pi processes using the same agent directory and indicates when a workspace override is present.
- YOLO enablement requires explicit confirmation and remains visibly indicated until disabled.
- Save and Apply is disabled during a run; an idle apply reloads/rebinds cleanly and the next gated tool call follows the new policy.
- Feature composition remains unchanged: no package/resource/MCP install, enable, disable, path, or discovery controls exist.
- M3-002, M3-003, and M3-004 are resolved.
- Verification stays proportional: focused pure checks for preset/config patching and one Electron settings-to-permission journey, plus typecheck/lint/build. Do not create a large generic settings test matrix.
