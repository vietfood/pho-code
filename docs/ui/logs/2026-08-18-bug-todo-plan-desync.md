# Bug: Plan todos did not match the transcript checklist

Kind: bug
Status: implemented; not accepted
Surface: Plan right-sidebar checklist; transcript `todo` tool row
Owner: features/plan-agent (product); ui/conversation chrome (host rules only)
Owning plan: [`../../features/plan-agent/implementation-plan.md`](../../features/plan-agent/implementation-plan.md)
Related logs: [`2026-08-16-change-plan-todos-chrome.md`](./2026-08-16-change-plan-todos-chrome.md), [`../../features/plan-agent/logs/2026-08-16-m2-todos.md`](../../features/plan-agent/logs/2026-08-16-m2-todos.md), [`../../features/plan-agent/logs/2026-08-18-bug-todo-plan-desync.md`](../../features/plan-agent/logs/2026-08-18-bug-todo-plan-desync.md)

## Expected / actual

Expected: Agent, Plan, and the latest transcript `todo` card show the same session list.

Actual: during Execute the transcript card showed 3/4 with verify in progress while the Plan rail still showed inspect complete and grouping in progress.

## Reproduction / evidence

Owner screenshot, 2026-08-18: live `todo` tool row vs Plan `Todos` section in the same chat.

## Changes and decisions

The transcript row reads that call’s input. Plan read `snapshot.plan.todos` reconstructed from Pi JSONL before the result was appended. Live `todo` tool events now write that same list onto `snapshot.plan.todos`; the runtime keeps a matching in-memory cache for later snapshots.

## Verification

Unit/typecheck/lint recorded on [`../../features/plan-agent/logs/2026-08-18-bug-todo-plan-desync.md`](../../features/plan-agent/logs/2026-08-18-bug-todo-plan-desync.md). Desktop Execute journey not verified in this slice.

## Owner feedback

The two lists were not in sync.

## Handoff

Product semantics remain in [`../../features/plan-agent/product.md`](../../features/plan-agent/product.md). Restart Electron if it was running before this slice.
