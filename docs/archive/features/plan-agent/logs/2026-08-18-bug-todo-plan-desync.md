# Bug: Plan todos lagged the transcript checklist

Status: in progress (not accepted)
Owner: features/plan-agent
Plan: [`../implementation-plan.md#milestone-2-cursor-style-todo-tool`](../implementation-plan.md#milestone-2-cursor-style-todo-tool)
Related logs: [`2026-08-16-m2-todos.md`](./2026-08-16-m2-todos.md), [`../../../../ui/logs/2026-08-16-change-plan-todos-chrome.md`](../../../../ui/logs/2026-08-16-change-plan-todos-chrome.md), [`../../../../ui/logs/2026-08-18-bug-todo-plan-desync.md`](../../../../ui/logs/2026-08-18-bug-todo-plan-desync.md)

## Intent

Keep the Plan rail (and any other `snapshot.plan.todos` chrome) on the same live session list the transcript `todo` card already shows, including during Execute.

## Contracts and files

- Product: [`../product.md`](../product.md) Session todos — one list in Agent, Plan, and transcript
- Runtime: `todo-tool.ts` args/result parse; `pi-runtime.ts` live `planTodos` cache
- Protocol: `parsePlanTodosFromToolPreview` / `withLivePlanTodos`; `applyRuntimeEvent` updates `plan.todos` from a live `todo` tool event
- UI: Plan panel already binds `snapshot.plan.todos`; no second checklist

## Changes and decisions

Pi appends tool-result JSONL on `message_end`, after `tool_execution_end` listeners run. Reconstructing from `getBranch()` at end-of-tool therefore returned the previous list. The transcript card uses that call’s arguments, so Plan lagged by one or more steps mid-run. Overlapping `await buildSnapshot()` could also emit an older reconstruct after a newer one.

Fix: cache the parsed `todo` args/result on the live session, project that cache into `snapshot.plan.todos`, and apply the same args onto the renderer snapshot in the `toolEvent` that paints the transcript card. Resume still reconstructs from branch details.

The composer `n/m` chip is not restored here. The 2026-08-18 meta-strip pass currently omits it.

## Verification

- Unit verified: `bun test packages/protocol/test/protocol.test.ts packages/protocol/test/plan-agent.test.ts packages/runtime/test/todo-tool.test.ts packages/runtime/test/plan-agent-state.test.ts packages/ui/test/tool-row.test.ts` — 50 pass.
- `bun run typecheck` — passed.
- `bun run lint` — passed with existing unrelated react-hooks warnings in App.tsx / context-prompt-dialog.tsx.
- Desktop: not verified in this slice. Next check is an Electron Execute run with the Plan rail open: each `todo` card must match the Plan checklist in the same moment.
- Packaged: not verified.

## Mistakes and corrections

Milestone 2 treated branch reconstruct as live state. Pi’s own todo example keeps an in-memory list and only reconstructs on session start/tree.

## Owner feedback

2026-08-18: transcript todo card showed 3/4 while the Plan rail still showed inspect complete / grouping in progress.

## UI impact

Plan rail checklist should track the latest `todo` call as soon as that card appears. Reciprocal UI log: [`../../../../ui/logs/2026-08-18-bug-todo-plan-desync.md`](../../../../ui/logs/2026-08-18-bug-todo-plan-desync.md).

## Blockers and handoff

Restart `bun run dev` if Electron was started before this slice. Desktop Execute journey still not verified.
