# Execute button and chat `execute_plan`

Status: implemented (add-on not accepted)
Owner: features/plan-agent
Plan: [`../implementation-plan.md`](../implementation-plan.md)
Related logs: [`2026-08-16-m1-plan-agent.md`](./2026-08-16-m1-plan-agent.md), [`../../../ui/logs/2026-08-16-feedback-execute-hidden-prompt.md`](../../../ui/logs/2026-08-16-feedback-execute-hidden-prompt.md), [`../../../ui/logs/2026-08-16-feedback-plan-comment-icons.md`](../../../ui/logs/2026-08-16-feedback-plan-comment-icons.md)

## Intent

Keep the Plan footer **Execute** button. Also let the owner tell the agent to execute in chat (go ahead / implement this). Do not show the injected “Execute the plan in the hidden plan document…” user bubble.

## Contracts and files

- Product: [`../product.md`](../product.md) Execute decision, modes, lifecycle
- Protocol: `EXECUTE_PLAN_TOOL_NAME`
- Runtime: `plan-agent-feature.ts`, `plan-agent-state.ts`, `pi-runtime.ts` (`sendCustomMessage` hidden kickoff), permission allow-list, tool display
- Transcript: hide the old visible Execute prompt if it is already in JSONL

## Changes and decisions

- Execute button still sets `executing=true`, restores Agent tools, and starts a turn. The kickoff is a `display: false` custom message (`pho-code.plan-execute`), not a user prompt. `before_agent_start` still injects remaining todos.
- New Plan-only tool `execute_plan`. When the owner asks in chat, the model calls it; that persist + tool-policy path is the same Execute. The user’s “go ahead” stays visible. Composer Plan → Agent still does not start work.
- `execute_plan` is permission-allow-listed with ask-user / plan document / todo. It is not in the Agent tool set.
- Existing chats that already stored the old Execute user prompt omit that bubble from projection and session preview.

## Verification

- Unit verified: `bun test packages/runtime/test/plan-agent-state.test.ts packages/runtime/test/transcript-tool-display.test.ts packages/runtime/test/tool-display.test.ts packages/runtime/test/permission-settings.test.ts packages/protocol/test/plan-agent.test.ts packages/ui/test/tool-row.test.ts` — 35 pass.
- `bun run typecheck` passed. `bun run lint` — 0 errors; remaining exhaustive-deps warnings are pre-existing.
- Desktop/packaged: not verified. Restart `bun run dev`.

## Owner feedback

2026-08-16: keep both abilities — click Execute, or tell the agent to execute.

## Handoff

Restart `bun run dev`. Desktop/packaged not verified in this slice.
