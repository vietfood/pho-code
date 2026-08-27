# UI work and feedback logs

Record UI changes, defects, regressions, owner feedback, agent mistakes, and durable design decisions that should outlive a chat. Use one dated file per coherent item so parallel agents do not append to the same document.

Filename:

```text
YYYY-MM-DD-<kind>-<short-slug>.md
```

Kinds are `change`, `bug`, `regression`, `feedback`, `mistake`, or `decision`.

Every record states:

- status, surface, owner, and owning plan;
- related version/feature/UI logs;
- expected and actual behavior or intended change;
- reproduction/evidence when applicable;
- changes and decisions;
- verification actually run;
- mistakes/corrections and owner feedback;
- fix or handoff.

Link the owning contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), a feature plan, or a numbered-version plan/archive. A Terminal-panel defect can live here while remaining owned by `features/terminal`; an Approve/Undo defect can live here while referring to the accepted `archive/v3` contract.

When changing the shared right-sidebar host, scan active logs under `../../version/*/logs/`, `../../features/*/logs/`, and `../../urgent/*/logs/` and add reciprocal links.

Current external-backend streaming/model-picker correction: [`2026-08-27-bug-external-streaming-caret.md`](./2026-08-27-bug-external-streaming-caret.md).

External reasoning/Fast controls and live tool updates: [`2026-08-27-change-external-reasoning-and-fast.md`](./2026-08-27-change-external-reasoning-and-fast.md).
