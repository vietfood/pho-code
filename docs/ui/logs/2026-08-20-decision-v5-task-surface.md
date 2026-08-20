# V5 Task surface decision

Date: 2026-08-20
Kind: decision
Status: proposed under V5; not implemented
Surface: Pho Code right-sidebar host
Owner: [`V5 — Pho Agent Foundation`](../../version/v5/README.md)
Owning plan: [`V5 implementation plan`](../../version/v5/implementation-plan.md)

## Intent

Select the minimal Pho Code UI adapter for the headless V5 Task Brief, evidence-pack, verification-ledger, and completion contracts without making Pho Code's layout part of `pho-agent`.

## Decision

- Add one **Task** surface to the existing right-sidebar host.
- The surface contains Brief, Evidence, and Verification sections rather than three rail icons or a new dashboard.
- Re-clicking Task hides the sidebar, matching Changes, Context prompt, and Plan.
- Task state belongs to the owning session. Switching chats restores the selected session's authoritative state and never moves background state into the visible chat.
- Brief owner edits are idle-only and revision-checked. During a live run, the surface is inspect-only.
- Evidence and verification text is untrusted and bounded. Detail is fetched by validated identifiers where necessary.
- Conversation remains primary; the surface uses the accepted resizable host and does not create an editor architecture.
- `pho-agent` contains no React/right-sidebar knowledge. Pho Research is free to render the same protocol differently.

## Relationships

- Plan remains a separate surface and authority: Task Brief says what success means; Plan says how to work; todo says what is in progress.
- Changes remains the V3 review/Approve/Undo surface. Task Verification may reference bounded review state but does not duplicate diffs or recovery controls.
- Context prompt remains system-prompt configuration. Evidence packs do not edit it.
- Proposed Terminal remains a separate owner-facing PTY surface.
- Context compaction continues to use the composer usage popover and transcript boundary, not Task.

## Verification

Documentation decision only. No UI, unit, Electron, accessibility, reduced-motion, background-session, or packaged check ran.

## Handoff

Implement the surface only in the V5 milestone that first exposes Task Brief state. Add focused UI and Electron evidence then, preserve the existing exhaustive surface/toggle behavior, and update accepted renderer architecture only after V5 acceptance.
