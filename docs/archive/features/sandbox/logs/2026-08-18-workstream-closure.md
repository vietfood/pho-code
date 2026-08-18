# Agent-tool sandbox workstream closure

Status: archived  
Owner: archive/features/sandbox  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`2026-08-17-acceptance-review.md`](./2026-08-17-acceptance-review.md)

## Intent

Close the sandbox add-on workstream after owner acceptance. The capability stays in the product; the docs move with v3-style numbered-version archives so `docs/features/` holds only open add-ons.

## Contracts and files

- Product: [`../product.md`](../product.md)
- Plan: [`../implementation-plan.md`](../implementation-plan.md)
- Living behavior: [`../../../../architecture/overview.md`](../../../../architecture/overview.md), [`../../../../architecture/extension-model.md`](../../../../architecture/extension-model.md), [`../../../../current-state.md`](../../../../current-state.md)
- Stub: [`../../../../features/sandbox.md`](../../../../features/sandbox.md)

## Changes and decisions

The owner asked to archive sandbox on 2026-08-18. The 2026-08-17 acceptance review left the folder under `docs/features/sandbox/` because accepted add-ons stayed there while current. That routing is superseded: an accepted add-on may move to `docs/archive/features/` when the owner closes the workstream.

`git mv docs/features/sandbox docs/archive/features/sandbox`. Relative links and living summaries were updated. Old logs were not rewritten; their “do not archive” sentences remain historical.

## Verification

- Documentation only. `git diff --check` on this slice.
- Code, desktop, and packaged checks were not re-run; acceptance evidence stays in [`2026-08-17-acceptance-review.md`](./2026-08-17-acceptance-review.md).

## Mistakes and corrections

The acceptance review said the folder would not move. The owner later closed the workstream. This log records that change instead of editing the review.

## Owner feedback

Archive sandbox features, then read plan-agent before implementing it.

## UI impact

None. Settings Sandbox chrome is unchanged.

## Blockers and handoff

Next open add-on work is [`../../../../features/terminal`](../../../../features/terminal/README.md). Plan/Agent later closed as [`../../../../archive/features/plan-agent`](../../../../archive/features/plan-agent/README.md).
