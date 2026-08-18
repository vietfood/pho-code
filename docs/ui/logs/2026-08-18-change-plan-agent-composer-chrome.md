# Composer Plan/Agent chrome matches the owner UI

Kind: change  
Status: implemented  
Surface: composer footer; composer meta strip; Plan document panel; ask-user dock  
Owner: conversation UI track (chrome); archive/features/plan-agent (product meaning)  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-18-change-composer-meta-strip.md`](./2026-08-18-change-composer-meta-strip.md), [`2026-08-18-feedback-composer-usage-meter-button.md`](./2026-08-18-feedback-composer-usage-meter-button.md), [`2026-08-16-feedback-plan-chip.md`](./2026-08-16-feedback-plan-chip.md), [`2026-08-16-feedback-plan-comment-icons.md`](./2026-08-16-feedback-plan-comment-icons.md), [`2026-08-16-change-plan-todos-chrome.md`](./2026-08-16-change-plan-todos-chrome.md), [`../../archive/features/plan-agent/logs/2026-08-18-acceptance-review.md`](../../archive/features/plan-agent/logs/2026-08-18-acceptance-review.md)

## Intent

Living docs still described a plus glyph, a labeled Plan/Agent chip, a composer `n/m` todo chip, and a paperclip attach control. The owner-tuned chrome in source is different. Update living contracts to match the UI.

## Expected / actual (docs before)

Expected: docs describe what the owner sees.

Actual:

- Mode lives on `ComposerContextButton`: Bot icon in Agent (red), ListTree icon in Plan (blue). The open menu is Mode (Agent / Plan) plus Attach (`Images…`). There is no plus glyph and no labeled footer chip. Unused `SessionModeChip` and its CSS were removed.
- Footer row is `[mode icon] model thinking [send]` (Steer / Follow-up / Stop while a run is live).
- Meta strip is workspace folder plus the clickable context percent+ring. Todos are not in that strip.
- Session todos show on the `todo` tool row and on the Plan rail under the document.
- Plan surface: pen edit, comment box with send/Enter, Execute footer. No Stay or Refine.
- Honesty copy is the Plan option `title`: “Explore and write a plan. File writes are off. Shell is not sandboxed.”

## Changes and decisions

Documentation plus removal of unused `SessionModeChip` / `.composer-mode-chip` CSS. Source matches the owner UI. Product user-visible rows in [`../../archive/features/plan-agent/product.md`](../../archive/features/plan-agent/product.md) now describe that chrome. Dated Plan/Agent logs stay as written.

## Verification

Source inspection of `composer.tsx`, `composer-context-button.tsx`, `composer-meta-strip.tsx`, `composer-usage.tsx`, `plan-document-panel.tsx`, `session-todo-list.tsx`, `ask-user-card.tsx`. Unit tests already assert no plus glyph, no `composer-meta-todo`, and no usage Info icon.

Desktop: not re-run in this docs slice. Prior desktop/packaged Plan/Agent evidence remains in the archived M3 log.

## Owner feedback

2026-08-18: owner asked whether docs match the current UI after their chrome changes, and to update the docs.

## Handoff

Living summaries: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../current-state.md`](../../current-state.md), [`../../development.md`](../../development.md), [`../../architecture/renderer-and-ui.md`](../../architecture/renderer-and-ui.md).
