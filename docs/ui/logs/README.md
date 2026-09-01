# UI logs

Dated records for conversation chrome and related desktop UI. One file per bounded change, defect, regression, feedback thread, mistake, or decision:

```text
YYYY-MM-DD-<kind>-<short-slug>.md
```

Kinds in use: `change`, `bug`, `regression`, `feedback`, `mistake`, `decision`, `fix`.

Each record names the surface, status and verification class, the owning plan, expected versus actual behaviour with evidence, the fix, and any handoff. Product semantics stay with the owning workstream — this folder carries the UI evidence, not the contract:

- transcript, composer, sidebar chrome, and the shared right-sidebar host → [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
- Changes, Approve, conflict, and Undo → archived [`v3`](../../archive/v3/README.md)
- PTY and Terminal product behaviour → [`../../features/terminal/README.md`](../../features/terminal/README.md)
- Plan / Agent and the Plan document → archived [`plan-agent`](../../archive/features/plan-agent/README.md)
- Pho-created child activity and the Agents surface → [`../../features/subagents/README.md`](../../features/subagents/README.md)
- backend-neutral and external-backend surfaces → [`../../version/v5/README.md`](../../version/v5/README.md)

When a change touches a shared surface owned elsewhere, cross-link both records. Do not rewrite an earlier log after learning more; write a new dated record and link the correction.

Unapproved interaction ideas belong in [`../ideas/README.md`](../ideas/README.md), not here.
