# Approval modes research and promotion

Date: 2026-09-01  
Owner: features/approval-modes  
Status: Complete (research and documentation only; implementation not started)  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related: [`../../../archive/features/sandbox/product.md`](../../../archive/features/sandbox/product.md), [`../../../archive/v3/product.md`](../../../archive/v3/product.md), [`../../../version/v5/logs/2026-08-26-codex-owner-interactions.md`](../../../version/v5/logs/2026-08-26-codex-owner-interactions.md), [`../../../version/v5/logs/2026-08-26-acp-permission-interactions.md`](../../../version/v5/logs/2026-08-26-acp-permission-interactions.md)

## Objective

Research modern automatic-approval systems and promote a final-product Pho Code
contract that replaces the owner-facing permission-profile/YOLO combination
with three clear execution modes:

- **Ask for approval**;
- **Approve for me**;
- **Full access**.

The owner explicitly rejected a deliberately small first version. The product
and implementation plan therefore specify the complete lifecycle, policy,
reviewer, migration, backend, UI, observability, evaluation, and acceptance
contracts even though delivery remains milestone-based.

## Evidence examined

### Pho Code source and accepted contracts

- Current managed policy templates and permanent-removal, privilege, secret,
  destructive-Git, web, tool, and harness-tool decisions in
  `packages/runtime/src/permission-presets.ts`.
- Current permission settings, custom-policy preservation, YOLO, project-rule
  trust, and public permission authorizer chain in
  `packages/runtime/src/permission-settings.ts` and
  `packages/runtime/src/sandbox-permission.ts`.
- Current protocol settings and interaction shapes in
  `packages/protocol/src/settings.ts` and
  `packages/pho-agent/packages/protocol/src/interaction.ts`.
- Current Codex `workspace-write` + `on-request` startup and approval forwarding
  in `packages/pho-agent/packages/backend-codex/src/adapter.ts`.
- Current ACP `session/request_permission` forwarding in
  `packages/pho-agent/packages/backend-acp/src/adapter.ts`.
- Accepted [agent-tool sandbox](../../../archive/features/sandbox/product.md),
  [Plan/Agent](../../../archive/features/plan-agent/product.md), and
  [V3 change-review](../../../archive/v3/product.md) contracts.
- Existing UI decisions for the
  [three-option permission dock](../../../ui/logs/2026-08-16-feedback-permission-dialog-options.md),
  [quiet permission chrome](../../../ui/logs/2026-08-16-feedback-permission-dialog-chrome.md),
  [Sandbox Settings](../../../ui/logs/2026-08-16-change-sandbox-settings.md),
  [Plan/Agent composer control](../../../ui/logs/2026-08-18-change-plan-agent-composer-chrome.md),
  and [V3 Changes host](../../../ui/logs/2026-08-15-change-v3-right-sidebar.md).
- Active V5 records for
  [Codex owner interactions](../../../version/v5/logs/2026-08-26-codex-owner-interactions.md),
  [ACP permissions](../../../version/v5/logs/2026-08-26-acp-permission-interactions.md),
  and [external backend ownership](../../../version/v5/logs/2026-08-27-external-backend-ownership.md).

### External primary sources

- OpenAI [permission modes](https://learn.chatgpt.com/docs/permission-modes),
  [Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review), and
  [permission profiles](https://learn.chatgpt.com/docs/permissions).
- Anthropic [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes)
  and [permission rules](https://code.claude.com/docs/en/permissions).
- [`czottmann/pi-automode`](https://github.com/czottmann/pi-automode), including
  its [classifier flow](https://github.com/czottmann/pi-automode/blob/main/docs/automode-classifier-flow.md)
  and [configuration model](https://github.com/czottmann/pi-automode/blob/main/docs/configuration.md).
- [`manuelschipper/nah`](https://github.com/manuelschipper/nah).
- [`mics8128/pi-approval-guardian`](https://github.com/mics8128/pi-approval-guardian).
- Owner-provided essay: [Pi Guardian](https://benanderson.work/blog/pi-guardian/).
  The page was not reliably retrievable through the research tooling, so no
  factual product claim in this contract depends on unverified details from it.

## Findings

1. **Current Pho Code profiles and modern approval modes are different axes.**
   A profile or sandbox defines the authority boundary. A mode decides whether
   a human, an automatic reviewer, or no reviewer resolves eligible crossings.
2. **Current YOLO is not Approve for me.** It mechanically converts asks while
   keeping explicit denies. It does not perform an independent, action-scoped
   safety review.
3. **Current YOLO is not Full access.** The sandbox, path policy, permanent
   removal, privilege, destructive-Git, secret-path, and tool-specific controls
   still constrain it.
4. **OpenAI's separation is the clearest product model.** Ask and automatic
   review keep the same workspace boundary; only the reviewer changes. Full
   access is a separate, explicitly risky boundary change.
5. **Claude validates the same layered idea.** Modes choose interaction posture;
   allow/ask/deny rules remain a separate policy layer, and Auto uses a separate
   classifier rather than blanket approval.
6. **Pi Automode contributes implementation discipline:** deterministic checks
   first, exact pending action, a separate bounded reviewer context, fail-closed
   model errors, protected safety controls, and observable decisions.
7. **Nah is valuable as a deterministic floor, not as the approval system.** Its
   strongest property is that it can only block or delegate; it never expands
   authority. Pho Code should adopt that monotonic rule without taking a runtime
   dependency or copying its implementation.
8. **Approval Guardian contributes exact-input locking, isolated reviewer
   sessions, strict failure handling, and explicit authorization provenance.**
   Its review-every-bash default is too noisy for Pho Code's healthy workspace
   sandbox, where routine in-boundary work should stay on the deterministic fast
   path.
9. **Backend ownership must stay honest.** Pi can use a Pho-owned reviewer.
   Codex and ACP/Claude own their native loops and permissions. Pho Code may map
   only characterized native capabilities; it must not auto-select an external
   backend's “allow” option and call that native automatic review.

## Product decisions

- Promote a standalone `approval-modes` add-on with final-product scope.
- Use exactly three owner-facing modes: Ask for approval, Approve for me, and
  Full access. Plan/Agent remains an independent axis.
- Make Ask and Approve for me share the same contained workspace boundary.
- Implement Approve for me as a separate reviewer for eligible escalation
  requests, never as `yoloMode: true`.
- Keep a deterministic, non-bypassable product-invariant layer in every mode.
- Make Full access an explicit per-chat, visibly dangerous bypass of routine
  sandbox and approval routing; it is never inferred during migration.
- Keep normal in-boundary actions off the reviewer path.
- Fail closed: reviewer failure pauses for the owner; it never becomes allow.
- Freeze and revalidate the exact tool input and grant before dispatch.
- Let project policy strengthen the global floor but never select a mode,
  reviewer, or broader authority.
- Preserve current custom permission configuration until the owner explicitly
  migrates it; never silently overwrite or broaden it.
- Rename the V3 owner-facing post-change action from **Approve** to
  **Mark reviewed** while keeping its accepted ledger meaning and internal state.
- Use backend capability negotiation. Unsupported modes are absent or disabled
  with an explanation; they are never emulated by blind approval.

## Documents changed

- Added [`../README.md`](../README.md).
- Added [`../product.md`](../product.md).
- Added [`../implementation-plan.md`](../implementation-plan.md).
- Added this log and [`README.md`](./README.md).
- Added the add-on to [`../../README.md`](../../README.md).
- Recorded the promoted workstream in [`../../../current-state.md`](../../../current-state.md).

## Verification

- Documentation/source inspection: complete for the evidence listed above.
- External research: current primary sources opened on 2026-09-01, except for
  the explicitly noted owner-provided essay.
- Runtime, unit, integration, desktop, and packaged checks: not run; this slice
  changes documentation only and implements no behavior.
- Documentation diff, whitespace, and local-link checks: recorded after the
  final documentation verification pass. `git diff --check` passed for the new
  feature, feature index, and current-state update; a local Markdown-link audit
  reported no missing targets; the scoped diff and full repository status were
  inspected. Existing unrelated source/compaction changes remain untouched.

## Mistakes and corrections

- The first proposal framed a small initial delivery. The owner corrected the
  scope to the final product. The product contract now covers the whole system;
  milestones are delivery order, not scope reduction.
- Early terminology risked treating automatic review as a more permissive
  profile. The contract now separates containment, deterministic policy, and
  reviewer ownership explicitly.

## Owner feedback

2026-09-01: The existing permission rules are not the same thing as modern
Ask/Auto/Full execution modes. Pivot toward Codex/Claude-style “Approve for me.”

2026-09-01: Do not aim for a small version. Document the final product in the
same comprehensive feature shape as compaction and terminal.

## UI impact

Planned only:

- one compact approval-mode control below the composer;
- an automatic-review state in tool activity without a second dashboard;
- typed Settings for mode availability, new-chat default, reviewer model, and
  redacted decision history;
- persistent high-risk chrome while Full access is active;
- **Mark reviewed** replacing the ambiguous V3 **Approve** label.

## Blockers and handoff

- No implementation has started.
- Milestone 0 must characterize the pinned permission-system authorizer payload,
  the current sandbox engine's exact-grant options, and each external backend's
  real mode/configuration capability before protocol code lands.
- External Codex/ACP mode mapping belongs to the backend adapter ownership
  already promoted under V5. That milestone remains gated while V5 is blocked;
  the Pi-owned milestones may proceed independently.
