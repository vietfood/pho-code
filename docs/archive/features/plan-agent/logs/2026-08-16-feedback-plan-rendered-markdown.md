# Plan document renders like chat

Status: implemented (add-on not accepted)
Owner: features/plan-agent
Plan: [`../implementation-plan.md#milestone-1-full-plan-mode-and-agent-mode-hardest`](../implementation-plan.md#milestone-1-full-plan-mode-and-agent-mode-hardest)
Related logs: [`2026-08-16-m1-plan-agent.md`](./2026-08-16-m1-plan-agent.md), [`../../../../ui/logs/2026-08-16-feedback-plan-rendered-markdown.md`](../../../../ui/logs/2026-08-16-feedback-plan-rendered-markdown.md), [`../../../../ui/logs/2026-08-16-feedback-plan-chip.md`](../../../../ui/logs/2026-08-16-feedback-plan-chip.md)

## Intent

Replace per-heading Plan fields with a full rendered document (same settled markdown as chat, including KaTeX and mermaid), todos at the end, and Refine via source Edit or one comment box.

## Contracts and files

- Product: [`../product.md`](../product.md) Plan document / user-visible contract
- UI: `packages/ui/src/plan-document-panel.tsx`, `theme.css`
- Desktop: `apps/desktop/src/App.tsx` Refine sends `sendPrompt` with the comment

## Changes and decisions

- Headings-as-labels was a previous owner request; this supersedes it.
- Refine no longer only focuses the composer. A comment on the Plan surface is the follow-up. Edit still saves the document without starting a turn.
- Stay / Execute unchanged.

## Verification

- `bun run typecheck` passed. `bun run lint` — 0 errors; remaining exhaustive-deps warnings are pre-existing in App.tsx / context-prompt-dialog.tsx.
- Desktop: not verified. Restart `bun run dev`.

## Owner feedback

Full rendered markdown (mermaid, KaTeX) like the chatbox; todos at the end; one comment box, not per-label notes.

## Blockers and handoff

Restart `bun run dev`. Packaged honesty remains Milestone 3.
