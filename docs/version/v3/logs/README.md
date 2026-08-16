# V3 work logs

Dated execution records for [`V3 — Change Control and Recovery`](../product.md). The product and implementation plan are contracts; these files carry implementation evidence, corrections, feedback, and handoffs.

Create one file per bounded slice:

```text
YYYY-MM-DD-<milestone>-<short-slug>.md
```

Use this shape:

```markdown
# <Outcome>

Status: in progress | blocked | ready for review | accepted | abandoned
Owner: version/v3
Plan: ../implementation-plan.md#<milestone>
Related logs: <relative links or none>

## Intent
## Contracts and files
## Changes and decisions
## Verification
## Mistakes and corrections
## Owner feedback
## UI impact
## Blockers and handoff
```

Use the repository verification vocabulary and record only checks that ran. When a v3 change touches shared protocol, Electron, accepted architecture, or the right-sidebar host, scan and cross-link related logs under `../../../features/*/logs/` and `../../../ui/logs/`.
