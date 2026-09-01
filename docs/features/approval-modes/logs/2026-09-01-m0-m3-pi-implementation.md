# Pi approval modes Milestones 0–3 implementation

Date: 2026-09-01
Owner: features/approval-modes
Status: Complete implementation slice; feature acceptance pending
Plan: [`../implementation-plan.md`](../implementation-plan.md)
Related: [`../handoff.md`](../handoff.md),
[`../../../version/v5/logs/2026-09-01-related-approval-foundation.md`](../../../version/v5/logs/2026-09-01-related-approval-foundation.md),
[`../../../ui/logs/2026-09-01-change-approval-modes-ui.md`](../../../ui/logs/2026-09-01-change-approval-modes-ui.md)

## Objective

Implement the approved Pi path end to end without a real provider: place the
reusable foundation in Pho Agent, integrate Pho Code policy and sandbox
ownership, expose named product contracts through Electron, render the owner
surfaces, and leave a real-model handoff rather than claiming acceptance.
The owner explicitly requested end-to-end implementation and machine testing
before later personal verification, so implementation crossed the milestone
sequence while every acceptance gate remains honestly open.

Milestone 4 external-backend mappings were not started because V5 remains held.
Milestone 5 provider evaluation and owner verification remain open.

## Evidence and changes

### Pho Agent foundation

`@pho-agent/protocol` now owns the backend-neutral approval vocabulary, strict
decision validation, bounded canonical JSON input, and SHA-256 fingerprints.
`@pho-agent/runtime` now owns:

- one controller per session with `ask`, `auto`, and `full` modes;
- ordered policy, reviewer/owner settlement, and final pre-dispatch
  revalidation;
- exact one-use grants, normalized memory-only session grants, revocation, and
  lifecycle generation invalidation;
- invariant and explicit project-deny precedence over Full;
- exact retry markers that authorize one matching proposal to be reviewed
  again without bypassing policy;
- a separate tool-less, history-less reviewer call with strict versioned JSON
  output, cancellation, a process-wide concurrency pool, malformed-response
  failure, and denial circuit breakers;
- whole-action Pi tool-call interception, including calls the permission
  package did not capture.

This foundation imports neither Pho Code nor Electron/React. The related V5
record explains why the ownership change does not advance held V5 slices.

### Pho Code product integration

The product runtime now owns the parts that are intentionally not generic:

- deterministic permanent-removal, privilege, destructive-Git,
  safety-control, persistence/startup, and TLS/auth weakening invariants;
- contained workspace and sandbox policy, sensitive owner-only categories,
  trusted project strengthening, and permission-package ask/deny evidence;
- a named approval permission authorizer without treating a package ask as the
  whole-action dispatch authority;
- contained, elevated, and Full execution selection without rewriting durable
  Sandbox settings;
- one process-wide Full acknowledgement and per-chat Full state that resets on
  restart/replacement/archive/policy incompatibility;
- explicit reviewer-model selection, bounded provenance-tagged evidence, a
  two-review process pool, background attention, cancellation, and fail-closed
  unavailability;
- typed application-data settings in `approval-modes.json` and at most 1,000
  redacted decision records in `approval-decisions/v1/history.json`;
- explicit legacy Custom/shared-root migration and managed-policy coexistence;
- Ask-only external-backend projections while their native mappings are held.

Protocol version 8 adds authoritative session/settings projections, bounded
approval requests/history, named commands, and keyed mode/review/request/grant/
Full-reset events. Application, main, IPC, preload, and renderer command lists
remain compile-time/test aligned. Application metadata version 8 persists only
Ask/Auto per-chat choices; Full is never durable.

### Owner UI

The renderer now has:

- a compact composer mode menu showing only authoritative supported modes;
- an exact-input owner approval card with once/session/deny-plus-reason;
- automatic review activity and exact-retry readiness;
- a blocking first-use Full warning and persistent high-risk mode treatment;
- typed Settings for new-chat default, Auto, explicit reviewer model, redacted
  history, Full enablement, migration, and the active boundary;
- session-grant revoke and on-demand decision-history inspection;
- privacy/cost disclosure for reviewer context and local unencrypted metadata;
- **Mark reviewed** wording for V3 post-change ledger closure, with no change to
  its accepted behavior.

The reciprocal UI record owns the shared composer/Settings evidence.

## Corrections made during implementation

- Permission-package prompts are retained only as bounded policy evidence;
  every actual Pi tool call still crosses the whole-action broker.
- The circuit-opening denial itself now terminates and cancels other pending
  reviews instead of opening the circuit only for a later call.
- Exact retry matching accepts a new Pi tool-call ID only when run, controller
  generation, tool, and frozen fingerprint still match.
- Reviewer output changed from permissive object parsing to an exact versioned
  schema with non-empty rationale and no extra fields.
- Policy is re-evaluated at the owning dispatch seam so a change while review is
  pending makes the result stale.
- Reviewer concurrency moved from per-session admission to a process-wide pool
  of two.
- Full acknowledgement moved from controller-local state to application-process
  state.
- Window-first Settings and offline Archive behavior were restored: an
  unattached runtime does not block metadata-only work; a live approval session
  still revokes grants and resets Full before archive.
- Managed permission presets now explicitly allow the safe `/dev/null` sink so
  sandboxed network-denial commands do not open a legacy path prompt. Prior
  managed preset shapes remain recognized.
- Deterministic Electron tests opt in through
  `PHO_CODE_TEST_APPROVAL_MODES=1`; production remains enabled by default, while
  legacy deterministic tests keep their prior permission behavior.

## Verification

All paths used isolated temporary application, agent, and workspace roots.

```text
bun test packages/protocol/test/approval.test.ts \
  packages/runtime/test/approval-controller.test.ts \
  packages/runtime/test/approval-feature.test.ts \
  packages/runtime/test/approval-reviewer.test.ts --timeout 20000
  # packages/pho-agent: 22 pass, 0 fail

bun test packages/protocol/test/approval-modes.test.ts \
  packages/runtime/test/approval-modes-runtime.test.ts \
  packages/runtime/test/approval-policy.test.ts \
  packages/runtime/test/approval-permission.test.ts \
  packages/application/test/bootstrap.test.ts \
  packages/application/test/settings.test.ts \
  packages/application/test/session-lifecycle.test.ts \
  packages/application/test/session-catalog.test.ts \
  packages/application/test/runtime-host.test.ts \
  packages/ui/test/approval-modes-ui.test.ts --timeout 20000
  # 88 pass, 0 fail

bun test packages/runtime/test/permission-settings.test.ts \
  packages/runtime/test/sandbox-permission.test.ts \
  packages/runtime/test/sandbox-settings-runtime.test.ts --timeout 20000
  # macOS Seatbelt lane: 22 pass, 0 fail

bun run typecheck
  # pass, all workspace packages

bunx eslint <approval-owned files>
  # pass, 0 errors

bun run test
  # 1131 pass, 1 unrelated existing appearance-theme assertion failure

bun run build
  # pass

cd apps/desktop && bunx playwright test tests/developer.spec.ts
  # 1 pass: Full enable/persistence, warning, safe run, invariant denial, Trash
```

Repository-wide `bun run lint` is not green: concurrent Pho Agent Task work at
`packages/pho-agent/packages/runtime/src/runtime.ts:64` has one
`consistent-type-imports` error. Nine hook warnings are also reported. The
approval-owned targeted lint lane is green.

The repository-wide test residual is the pre-existing UI assertion expecting a
42 rem empty-session width while current CSS uses 48 rem. A separate Settings
Electron attempt also reached and settled its permission journey but its final
test locator found both live and settled copies of the same tool card; that is a
test/UI projection issue outside this approval slice.

## Acceptance limits and handoff

- No real provider/model was available. Reviewer quality, cost, latency,
  provider cancellation, and owner comprehension are not verified.
- Automatic reviewer selection deliberately reports unavailable until a
  release-owned model policy is evaluated. The owner can select one explicit
  authenticated provider/model for verification.
- Auto's exact denial override arms the next matching proposal in the current
  active run; it does not redispatch a tool behind the agent's back.
- Current Seatbelt integration can choose contained versus one-call elevated/
  Full execution, but the pinned sandbox package cannot express every arbitrary
  path/domain capability as a durable fine-grained OS grant.
- Scripted product invariants cover characterized wrappers and effects; unknown
  arbitrary interpreter behavior remains conservative review rather than being
  falsely classified as safe.
- No packaged approval journey or Linux desktop run was performed.
- Codex and ACP remain Ask-only until the V5 hold lifts and native adapter
  contracts are characterized.

Use [`../handoff.md`](../handoff.md) for the remaining owner checks. Do not mark
the add-on accepted or archive it from this record.
