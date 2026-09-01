# Approval modes implementation logs

This directory holds dated execution evidence for the active
[approval-modes add-on](../product.md). The product boundary lives in
[`../product.md`](../product.md); the read-mostly implementation contract lives
in [`../implementation-plan.md`](../implementation-plan.md).

Create one log per bounded implementation slice, issue, or owner-feedback
thread. Record observed behavior, exact verification, failures, corrections,
and remaining handoff. Do not turn logs into a second mutable implementation
plan.

## Index

| Date | Record | Status |
| --- | --- | --- |
| 2026-09-01 | [`2026-09-01-research-and-promotion.md`](./2026-09-01-research-and-promotion.md) | Research complete; add-on promoted; implementation not started |

## Entry template

```markdown
# <bounded slice or issue>

Date: YYYY-MM-DD
Owner: features/approval-modes
Status: In progress | Blocked | Complete
Plan: ../implementation-plan.md#<milestone>
Related: <links>

## Objective

## Evidence and changes

## Verification

## Mistakes and corrections

## Owner feedback

## UI impact

## Blockers and handoff
```

