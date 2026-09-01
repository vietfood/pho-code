# Approval modes handoff — owner test guide

Date: 2026-09-01
Status: Pi Milestones 0–3 implemented and machine-verified; **real-provider and owner desktop verification are the remaining acceptance gates.**
Plan: [`implementation-plan.md`](./implementation-plan.md) · Product: [`product.md`](./product.md) · Evidence: [`logs/2026-09-01-m0-m3-pi-implementation.md`](./logs/2026-09-01-m0-m3-pi-implementation.md)

## What was built

| Slice | What you get |
| --- | --- |
| Foundation | Pho Agent exact-input fingerprints, one controller per chat, ordered policy/revalidation, once/session grants, cancellation, reviewer lifecycle, circuit breaker, and Pi whole-action interception. |
| Ask for approval | Routine contained work runs directly. Eligible boundary crossings show the owner the exact action with once/session/deny-plus-reason choices. |
| Approve for me | The same contained boundary uses a separate tool-less reviewer. Sensitive categories still require the owner; malformed, timed-out, cancelled, or unavailable review fails closed. |
| Full access | Explicit per-chat bypass of routine containment/review after a process warning. Permanent removal, privilege escalation, destructive Git recovery bypass, and safety-control invariants still deny. |
| Lifecycle and data | Ask/Auto persist per chat; Full and grants do not. Migration is explicit. Redacted decision history is bounded and loaded only on request. Archive revokes live grants and resets Full. |
| Desktop UI | Composer mode control, exact approval card, review activity, Full warning, grant revoke, typed Settings, history viewer, privacy/cost copy, and V3 **Mark reviewed** wording. |

Codex and Claude ACP remain Ask-only. Their native Auto/Full mapping belongs to
held V5 work and was deliberately not emulated around an incomplete action
stream.

## Setup

```bash
bun install
bun run stage:ripgrep
env -u ELECTRON_RUN_AS_NODE bun run dev
```

Use an isolated test workspace with no valuable uncommitted work. Keep Settings
→ Sandbox enabled and healthy; inspect its effective state under Settings →
Permissions → Active boundary. Use a real authenticated Pi model for the agent.
For Auto, choose a separate authenticated reviewer model explicitly; automatic
model selection is intentionally unavailable until its release evaluation is
complete.

If Settings shows a legacy Custom/shared-root migration notice, read it and use
**Review and migrate** only when you intend to replace that compatibility
policy. Until migration, the chat honestly stays Ask-only. A shared
`PHO_CODE_AGENT_DIR` needs its separate acknowledgement.

## Test 1 — Ask routine work and one exact elevation

1. Create a Pi chat and leave the composer mode on **Ask**.
2. Ask it to inspect and edit an ordinary file inside the test workspace, then
   run a routine test/build command.
   - Expect: contained work runs without an approval card.
   - Sandboxed shell rows show the normal shield; this claims only the agent
     bash call was wrapped.
3. Ask it to read one harmless fixture outside the workspace or perform one
   bounded public fetch that is not already allowed by policy.
   - Expect: a compact approval card appears before execution.
   - Expand the exact input. Confirm the tool, command/path/destination, working
     directory, and JSON match the requested action without truncation.
4. Choose **Allow once**.
   - Expect: only that exact action executes. A changed target/input must ask
     again.
5. Repeat with **Allow for this session**, then make a matching request.
   - Expect: the normalized matching capability is reused without granting an
     unrelated tool/path/destination.
6. Open the mode menu and choose **Revoke session approvals**.
   - Expect: the next matching boundary crossing asks again.
7. Deny a request with a short reason.
   - Expect: the action does not execute and the agent receives the reason
     without a suggestion to work around policy.

## Test 2 — Product invariants in Ask

In the disposable workspace, ask the model to propose each action below. Do not
manually run them:

- permanent removal (`rm -rf` or `/bin/rm`);
- privilege escalation (`sudo` or `doas`);
- destructive Git recovery (`git reset --hard`, `git clean -fd`, or broad
  `git restore`);
- editing active approval/sandbox control files;
- weakening TLS/authentication or installing startup persistence.

Expect a deterministic denial, not an approval card. The action must not reach
the owning tool. The safe removal path remains the application-owned Trash tool.

## Test 3 — Approve for me

1. In Settings → Permissions, enable **Approve for me**.
2. Enter an authenticated reviewer provider ID and model ID, click **Use this
   model**, and confirm the Effective line names it as available.
3. Keep the main chat on another model if practical. Change the composer mode to
   **Auto**.
4. Repeat the harmless elevation from Test 1.
   - Expect: **Reviewing access…** appears, then an automatic allow or bounded
     denial. No reviewer prompt, hidden reasoning, raw transcript, or raw policy
     appears in the conversation.
5. Request secret/private-data access or a production/publish/payment/IAM/
   durable-persistence effect.
   - Expect: policy requires the owner before any reviewer can silently allow
     it. A background chat enters attention rather than stealing navigation.
6. Stop the main run while a review is pending.
   - Expect: the reviewer cancels, no late decision executes, and the chat
     returns to a usable state.
7. Cause three consecutive automatic denials in one run, or ten denials among
   fifty decisions if practical.
   - Expect: the automatic-review circuit opens and remaining/pending work
     requires the owner; there is no denial loop.
8. On an eligible automatic denial choose **Review exact retry** and have the
   agent propose the same action again in the same active run.
   - Expect: the UI says **Exact retry ready** and the next matching proposal is
     reviewed again. Pho Code does not secretly redispatch the denied tool.
   - Change the tool/input/run and confirm the marker does not match.

Reviewer context is sent to the selected provider and may add latency, usage,
and cost. Automatic review is a probabilistic judgment, not a security proof.

## Test 4 — Reviewer failure and owner fallback

1. Configure a nonexistent/unauthenticated reviewer model, or interrupt its
   provider during an eligible review.
2. Request an elevation in Auto.
   - Expect: no action executes from a malformed, timed-out, cancelled, or
     unavailable result.
   - An interactive chat presents the owner card; a background chat shows
     attention.
3. Restore the model and repeat.
   - Expect: a new request can proceed; stale output from the failed review
     cannot settle it.

## Test 5 — Full access and process acknowledgement

Use only the disposable workspace.

1. In Settings enable **Full access**. Confirm new-chat default still offers only
   Ask or Auto—never Full.
2. Select Full in the composer.
   - Expect: a blocking warning names filesystem, network, credentials, prompt
     injection, data loss, and external side-effect risk, and states the
     invariants that remain.
3. Cancel once.
   - Expect: the prior mode remains.
4. Select again and confirm.
   - Expect: the composer shows a persistent high-risk **Full** indicator.
5. Run a safe inspection outside the contained boundary.
   - Expect: no Pho approval card and no sandbox shield for the Full call.
6. Repeat the invariant proposals from Test 2.
   - Expect: every invariant still denies.
7. Open a second chat and choose Full.
   - Expect: the process warning is not repeated after the first acknowledgement,
     but Full must still be selected per chat.
8. Switch chats and back.
   - Expect: the live resident chat keeps Full.
9. Archive/restore the Full chat, then restart the application.
   - Expect: Full resets to Ask. No Full state or session grant survives restart.

The automated Electron journey already covered enablement persistence, the Full
warning, safe shell execution, an invariant denial, and recoverable Trash.

## Test 6 — Settings, migration, history, and privacy

1. Set new chats to Ask, create a chat, then set the default to Auto and create
   another after Auto is available.
   - Expect: defaults apply only to new chats; existing chat modes do not change.
2. Archive and restore Ask/Auto chats.
   - Expect: their contained mode returns. Full never does.
3. Use **View** under Recent approval decisions.
   - Expect: the page loads only on demand and shows redacted action title,
     summary, mode/outcome, rationale, and time—not raw reviewer input/output,
     secrets, or full transcript.
4. Disable **Keep decision history**, make a decision, and inspect again.
   - Expect: the new decision is not appended. Existing bounded local records
     remain readable.
5. Inspect application data if desired:
   - `approval-modes.json` contains typed settings only;
   - `approval-decisions/v1/history.json` contains at most 1,000 redacted
     records;
   - application metadata version 8 stores only Ask/Auto per-chat choice.

These local records are not encrypted at rest. Provider credentials remain in
the existing credential store and never enter the approval history.

## Test 7 — Plan, V3, background work, and accessibility

1. Toggle Plan/Agent while leaving approval mode unchanged; Execute a Plan under
   Ask, then Auto.
   - Expect: Plan never grants authority. Execute uses the chat's current
     approval mode.
2. Make a Pi `write`/`edit`, open Changes, and use **Mark reviewed**.
   - Expect: it closes the already-applied V3 ledger item. It does not authorize
     a future action, stage, commit, or write.
3. Run two chats and trigger an approval/review in the background chat.
   - Expect: activity and attention stay attributed to the owning chat without
     replacing the selected transcript.
4. Check keyboard operation, visible focus, Escape dismissal, a narrow window,
   light/dark palettes, and reduced motion for the mode menu, exact request card,
   Full warning, Settings, and history viewer.

## Automated evidence already run

```text
Pho Agent approval foundation                    22 pass, 0 fail
Pho Code protocol/runtime/application/UI matrix  88 pass, 0 fail
macOS sandbox/permission compatibility            22 pass, 0 fail
workspace typecheck                               pass
approval-owned ESLint                             pass
production build                                  pass
Electron Full journey                              1 pass
repository test sweep                           1131 pass, 1 unrelated UI failure
```

Focused re-runs:

```bash
cd packages/pho-agent
bun test packages/protocol/test/approval.test.ts \
  packages/runtime/test/approval-controller.test.ts \
  packages/runtime/test/approval-feature.test.ts \
  packages/runtime/test/approval-reviewer.test.ts --timeout 20000

cd ../..
bun test packages/protocol/test/approval-modes.test.ts \
  packages/runtime/test/approval-modes-runtime.test.ts \
  packages/runtime/test/approval-policy.test.ts \
  packages/runtime/test/approval-permission.test.ts \
  packages/ui/test/approval-modes-ui.test.ts --timeout 20000

cd apps/desktop
bunx playwright test tests/developer.spec.ts
```

## Known limitations before acceptance

- No real provider was available during implementation. Reviewer judgment,
  model compatibility, provider cancellation, cost, and latency are unverified.
- Automatic reviewer selection has no evaluated release model policy yet; use
  one explicit authenticated model for owner testing.
- The pinned macOS sandbox can switch one call between contained and elevated/
  Full execution, but cannot encode every arbitrary path/domain request as a
  reusable fine-grained OS capability.
- Unknown arbitrary interpreter behavior stays conservative review; the
  invariant classifier must not be described as complete semantic shell
  analysis.
- The exact retry control arms a matching next proposal in the same active run;
  it does not itself re-run the denied tool.
- External backends are Ask-only, packaged approval verification was not run,
  and Linux desktop behavior was not exercised.
- Repository-wide lint has one unrelated concurrent Pho Agent Task type-import
  error. The full test sweep has one unrelated appearance-theme width assertion.

Record owner observations as new dated logs. Do not edit this guide into an
acceptance review; acceptance gets its own immutable record when the checks pass.
