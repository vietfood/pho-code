# Plan / Agent work logs

Dated execution records for the [`Plan / Agent and ask-user`](../product.md) add-on. The product and implementation plan are contracts; these files carry implementation evidence, corrections, feedback, and handoffs.

Create one file per bounded slice:

```text
YYYY-MM-DD-<milestone>-<short-slug>.md
```

Use this shape:

```markdown
# <Outcome>

Status: in progress | blocked | ready for review | accepted | abandoned
Owner: features/plan-agent
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

Use the repository verification vocabulary and record only checks that ran. When this work touches shared protocol, Electron, accepted architecture, host dialogs, or the right-sidebar host, scan and cross-link related logs under `../../../../version/*/logs/`, `../../../../ui/logs/`, `../../../../features/terminal/logs/`, and `../../../sandbox/logs/`.
