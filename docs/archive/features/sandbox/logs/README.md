# Agent-tool sandbox work logs

Dated execution records for the [`agent-tool sandbox`](../product.md) add-on. The product and implementation plan are contracts; these files carry implementation evidence, corrections, feedback, and handoffs.

Create one file per bounded slice:

```text
YYYY-MM-DD-<milestone>-<short-slug>.md
```

Use this shape:

```markdown
# <Outcome>

Status: in progress | blocked | ready for review | accepted | abandoned
Owner: features/sandbox
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

Use the repository verification vocabulary and record only checks that ran. When sandbox work touches shared protocol, Electron, accepted architecture, permission settings, or Settings chrome, scan and cross-link related logs under `../../../../version/*/logs/`, `../../../../ui/logs/`, `../../../../urgent/*/logs/`, and `../../../../features/terminal/logs/`.
