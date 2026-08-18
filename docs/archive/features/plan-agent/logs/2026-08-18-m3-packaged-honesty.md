# Milestone 3: packaged honesty

Status: accepted  
Owner: features/plan-agent  
Plan: [`../implementation-plan.md#milestone-3-packaged-honesty-docs-architecture`](../implementation-plan.md#milestone-3-packaged-honesty-docs-architecture)  
Related logs: [`2026-08-16-m0-ask-back.md`](./2026-08-16-m0-ask-back.md), [`2026-08-16-m1-plan-agent.md`](./2026-08-16-m1-plan-agent.md), [`2026-08-16-m2-todos.md`](./2026-08-16-m2-todos.md), [`2026-08-16-feedback-ask-user-allow.md`](./2026-08-16-feedback-ask-user-allow.md), [`2026-08-18-bug-todo-plan-desync.md`](./2026-08-18-bug-todo-plan-desync.md), [`2026-08-18-acceptance-review.md`](./2026-08-18-acceptance-review.md), [`../../../../ui/logs/2026-08-18-change-composer-meta-strip.md`](../../../../ui/logs/2026-08-18-change-composer-meta-strip.md)

## Intent

Ship unsigned macOS evidence that the Pho-owned plan-agent factory is in the `.app`, juicesharp/`pi-tui` are not baked, ask-back / Plan write-off / Execute / Agent todos work, and architecture plus notices match that behavior.

## Contracts and files

- Product: [`../product.md`](../product.md)
- Plan: [`../implementation-plan.md`](../implementation-plan.md)
- Notices: `scripts/stage-app-resources.ts` `generateThirdPartyNotices()`
- Packaged journey: `apps/desktop/tests/packaged.spec.ts`
- Lint fences: `eslint.config.js` (`pi-tui`, juicesharp); `apps/desktop/tests/unit/package-boundaries.test.ts`

## Changes and decisions

- Deterministic model gained `USE_TODO`, `USE_PLAN_DOC`, and Execute-prompt matching. Plan-mode injected `[PLAN MODE ACTIVE]` context is skipped so `USE_WRITE` / `USE_PLAN_DOC` still route.
- Composer Plan/Agent lives on `ComposerContextButton` (`+` menu). Plan option title is “Explore and write a plan. File writes are off. Shell is not sandboxed.”
- Packaged smoke: diagnostics `plan-agent 0.1.0 · loaded`; questionnaire card (not Pending approval); Plan write is refused (`write not found` from tool intersection); Execute writes `agent-note.txt` and V3 shows “hello from agent”; Agent `todo` list appears in transcript and Plan rail.
- Notices include a juicesharp adapted-source MIT section. Heading is not `## @juicesharp`. `@earendil-works/pi-tui` is not a notices package heading.
- Isolated first-launch with `PHO_CODE_TEST_FEATURES=1` can still show Allow once for `update_plan_document` / Execute `write` / `todo` because `syncHarnessPermissionPolicy` no-ops until a permission file exists. The packaged journey dismisses that dock. Owner live data was already synced.

## Verification

macOS arm64, isolated temp userData/workspace, 2026-08-18:

- **unit verified:** `bun run typecheck` — pass. `bun run lint` — 0 errors (5 pre-existing `react-hooks/exhaustive-deps` warnings). `bun test apps/desktop/tests/unit/package-boundaries.test.ts scripts/stage-app-resources.test.ts packages/runtime/test/plan-agent-state.test.ts` — 18 pass. `bun test packages/ui/test/composer-context-button.test.ts` — 2 pass.
- **unit / integration verified:** `bun test` — 668 pass, 2 fail. Failures are pre-existing `CHANGE_REVIEW_COPY` empty-string asserts in `packages/protocol/test/change-review.test.ts` (V3 copy, not this add-on).
- **desktop verified:** `bun run test:desktop` — 22 pass, including `ask-user.spec.ts`.
- **packaged verified:** `bun run build` — pass. `bun run package:mac` — unsigned `.app`. `bun run test:packaged` — 6 pass, including the Plan/Agent journey.

**owner-verified:** 2026-08-18 live app. `ask_user_question`, Plan mode, and todos.

## Mistakes and corrections

- `eslint.config.js` briefly dropped `piSdkPattern` while adding juicesharp/`pi-tui` path fences; restored.
- Packaged test first looked for unused `session-mode-selector`. Actual control is `composer-context-button`.
- Test-model treated Plan context as the last user prompt and replied “Hello from the test model” instead of `USE_WRITE`. Skip `[PLAN MODE ACTIVE]`.
- Plan write-off in the packaged app is “Tool write not found” (tool intersection), not the `tool_call` backstop sentence. Both mean writes are off.
- Re-clicking `right-sidebar-surface-plan` collapses an already-open Plan rail. Auto-open on first document is enough.
- Hidden Execute kickoff does not always add a fourth work-log toggle. Wait for the file, then the latest `tool-open-review`.

## Owner feedback

Ask-back, Plan mode, and todos are good. Do not restore the composer `n/m` chip. Stay/Refine buttons are already gone (comment box + pen edit). Focus Milestone 3, then archive the workstream.

## UI impact

Plan honesty title on the `+` mode option. No composer chip restore.

## Blockers and handoff

Milestone 3 evidence is complete. Acceptance review: [`2026-08-18-acceptance-review.md`](./2026-08-18-acceptance-review.md).
