# UI documentation

Conversation chrome and related desktop UI. This is not the add-on tracker (`features/`) and not a numbered product version (`version/`).

| Folder | Use |
| --- | --- |
| [`implementation/`](./implementation/conversation-ui.md) | The live conversation-UI track: what is in source, slices, verification |
| [`ideas/`](./ideas/README.md) | UI ideas that are not yet an implementation slice |
| [`logs/`](./logs/README.md) | UI changes, defects, regressions, feedback, mistakes, decisions, and handoffs |

Keep the conversation primary. Right-rail Terminal product work lives in [`features/terminal`](../features/terminal/README.md); Plan/Agent and the Plan document live in [`features/plan-agent`](../features/plan-agent/README.md); this folder only owns the rail host and transcript/composer chrome. Launch “Loading…” that blocks the window on Pi boot is owned by [`urgent/window-first-pi-core`](../urgent/window-first-pi-core/README.md) with a UI defect log. Composer Stop that does not cancel a stuck run is owned by [`urgent/agent-stop`](../urgent/agent-stop/README.md) with a UI defect log.

Versioned and add-on work may write UI records here while retaining product ownership in their own plan. Cross-link both workstream logs whenever a shared surface changes.
