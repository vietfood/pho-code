# Plan rail is settled chat markdown

Kind: feedback
Status: implemented; not accepted
Surface: Plan document panel
Owner: features/plan-agent (product); ui/conversation chrome (host rules only)
Owning plan: [`../../archive/features/plan-agent/implementation-plan.md`](../../archive/features/plan-agent/implementation-plan.md)
Related logs: [`2026-08-16-feedback-plan-chip.md`](./2026-08-16-feedback-plan-chip.md), [`2026-08-16-change-plan-todos-chrome.md`](./2026-08-16-change-plan-todos-chrome.md), [`2026-08-16-feedback-plan-comment-icons.md`](./2026-08-16-feedback-plan-comment-icons.md), [`../../archive/features/plan-agent/logs/2026-08-16-m1-plan-agent.md`](../../archive/features/plan-agent/logs/2026-08-16-m1-plan-agent.md)

## Intended change

Stop splitting the Plan into per-heading description fields. Render the document with the same settled markdown pipeline as chat (GFM, KaTeX, mermaid, Shiki, fenced SVG). Put todos under the document. Refine via Edit of the source or one comment box, not a note on each label.

## Expected / actual (before)

Expected: a readable plan with diagrams and math, todos at the end, one place to comment.
Actual: headings became labels with separate textareas; mermaid/KaTeX could not render in the idle editor; todos sat above the document.

## Changes and decisions

- Idle and Execute views use `ConservativeMarkdown` without `streaming`, so KaTeX/mermaid/Shiki match the chatbox.
- Edit toggles a single source textarea; Save writes the JSONL document and returns to the rendered view.
- One comment field at the bottom. Refine sends that text as a Plan-mode prompt. Empty Refine focuses the comment box.
- Session todos render after the document.
- Removed `plan-document-sections.ts` (trashed).

## Verification

- `bun run typecheck` passed. `bun run lint` — 0 errors; remaining exhaustive-deps warnings are pre-existing in App.tsx / context-prompt-dialog.tsx.
- Desktop: not verified. Restart `bun run dev` to see the rail.

## Owner feedback

2026-08-16: this is not the plan anymore; want full rendered markdown including mermaid and KaTeX like chat; todos at the end; edit the plan or add one comment box.

## Handoff

Product contract updated in [`../../archive/features/plan-agent/product.md`](../../archive/features/plan-agent/product.md). Restart `bun run dev` to see the rail.
