# Hide Execute kickoff in the transcript

Kind: feedback
Status: implemented; not accepted
Surface: conversation transcript; Plan Execute
Owner: features/plan-agent (Execute semantics); ui/conversation chrome (transcript projection)
Owning plan: [`../../archive/features/plan-agent/implementation-plan.md`](../../archive/features/plan-agent/implementation-plan.md)
Related logs: [`../../archive/features/plan-agent/logs/2026-08-16-feedback-execute-hidden-or-tool.md`](../../archive/features/plan-agent/logs/2026-08-16-feedback-execute-hidden-or-tool.md), [`2026-08-16-feedback-plan-comment-icons.md`](./2026-08-16-feedback-plan-comment-icons.md)

## Intended change

Execute should not insert a gray user pill with the hidden-plan kickoff copy. The owner can still click Execute, or say go ahead in chat.

## Expected / actual (before)

Expected: Cursor-style hidden Execute context; the owner’s chat text stays visible.
Actual: Clicking Execute sent a visible user message: “Execute the plan in the hidden plan document…”

## Changes and decisions

- New Execute turns use a hidden custom message, not `sendPrompt`.
- Transcript projection skips the old kickoff string if it is already in JSONL.
- Chat `execute_plan` is the other Execute path; that user message remains in the thread.

## Verification

- Unit verified: `bun test packages/runtime/test/plan-agent-state.test.ts packages/runtime/test/transcript-tool-display.test.ts packages/runtime/test/tool-display.test.ts packages/runtime/test/permission-settings.test.ts packages/protocol/test/plan-agent.test.ts packages/ui/test/tool-row.test.ts` — 35 pass.
- `bun run typecheck` passed. `bun run lint` — 0 errors; remaining exhaustive-deps warnings are pre-existing.
- Desktop: not verified. Restart `bun run dev`.

## Owner feedback

2026-08-16: keep both click Execute and tell-the-agent-to-execute; do not show the injected prompt.

## Handoff

Product contract in [`../../archive/features/plan-agent/product.md`](../../archive/features/plan-agent/product.md). Restart `bun run dev`.
