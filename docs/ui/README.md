# UI documentation

Conversation chrome and related desktop UI. This is not the add-on tracker (`features/`) and not a numbered product version (`version/`).

| Folder | Use |
| --- | --- |
| [`implementation/`](./implementation/conversation-ui.md) | The live conversation-UI track: what is in source, slices, verification |
| [`ideas/`](./ideas/README.md) | UI ideas that are not yet an implementation slice |
| [`logs/`](./logs/README.md) | UI changes, defects, regressions, feedback, mistakes, decisions, and handoffs |

Keep the conversation primary. Right-rail Terminal product work lives in [`features/terminal`](../features/terminal/README.md); Plan/Agent and the Plan document live in [`archive/features/plan-agent`](../archive/features/plan-agent/README.md); this folder only owns the rail host and transcript/composer chrome. Accepted window-first launch and Pi startup state are owned by archived [`window-first-pi-core`](../archive/urgent/window-first-pi-core/README.md), with reciprocal defect/change logs here. Accepted bounded Stop/Stop-all behavior is owned by archived [`agent-stop`](../archive/urgent/agent-stop/README.md) with its fixed UI defect/change logs here.

Versioned and add-on work may write UI records here while retaining product ownership in their own plan. Cross-link both workstream logs whenever a shared surface changes.
