# Plan / Agent workstream closure

Status: archived  
Owner: archive/features/plan-agent  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`2026-08-18-acceptance-review.md`](./2026-08-18-acceptance-review.md)

## Intent

Close the Plan / Agent add-on workstream after owner acceptance and Milestone 3 packaged evidence. The capability stays in the product; the docs move so `docs/features/` holds only open add-ons.

## Contracts and files

- Product: [`../product.md`](../product.md)
- Plan: [`../implementation-plan.md`](../implementation-plan.md)
- Living behavior: [`../../../../architecture/overview.md`](../../../../architecture/overview.md), [`../../../../architecture/extension-model.md`](../../../../architecture/extension-model.md), [`../../../../current-state.md`](../../../../current-state.md)
- Stub: [`../../../../features/plan-agent.md`](../../../../features/plan-agent.md)

## Changes and decisions

The owner asked to archive plan-agent on 2026-08-18 after live ask-back, Plan mode, and todos, plus packaged Milestone 3. `git mv docs/features/plan-agent docs/archive/features/plan-agent`. Relative links and living summaries were updated. Old logs were not rewritten; their “not accepted” sentences remain historical.

## Verification

- Documentation slice. `git diff --check` on this archive.
- Code, desktop, and packaged checks are recorded in [`2026-08-18-acceptance-review.md`](./2026-08-18-acceptance-review.md) and [`2026-08-18-m3-packaged-honesty.md`](./2026-08-18-m3-packaged-honesty.md).

## Mistakes and corrections

The archive lift missed `logs/2026-08-16-promotion.md`'s stub link (`../../plan-agent.md`). Corrected to [`../../../../features/plan-agent.md`](../../../../features/plan-agent.md). Living-doc labels that still said `features/plan-agent` while pointing at the archive were aligned. [`runtime-and-data.md`](../../../../architecture/runtime-and-data.md) now lists the accepted factory. Acceptance already recorded product chrome drifts (no Stay/Refine, no composer `n/m` chip, mode on the `+` button).

## Owner feedback

Archive plan-agent after Milestone 3.

## UI impact

None. Composer `+` Plan/Agent and the Plan rail stay in the app.

## Blockers and handoff

No remaining plan-agent milestone. The remaining open add-on is [`../../../../features/terminal`](../../../../features/terminal/README.md).
