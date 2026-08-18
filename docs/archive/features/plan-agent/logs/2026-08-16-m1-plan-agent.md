# Milestone 1: Plan / Agent modes and Plan document

Status: in progress (not accepted)
Owner: features/plan-agent
Plan: [`../implementation-plan.md#milestone-1-full-plan-mode-and-agent-mode-hardest`](../implementation-plan.md#milestone-1-full-plan-mode-and-agent-mode-hardest)
Related logs: [`2026-08-16-m0-ask-back.md`](./2026-08-16-m0-ask-back.md), [`2026-08-16-feedback-plan-rendered-markdown.md`](./2026-08-16-feedback-plan-rendered-markdown.md), [`../../../../ui/logs/2026-08-16-change-plan-sidebar.md`](../../../../ui/logs/2026-08-16-change-plan-sidebar.md), [`../../../../ui/logs/2026-08-16-decision-plan-sidebar-surface.md`](../../../../ui/logs/2026-08-16-decision-plan-sidebar-surface.md), [`../../../../ui/logs/2026-08-16-feedback-plan-chip.md`](../../../../ui/logs/2026-08-16-feedback-plan-chip.md)

## Intent

Ship per-chat Plan vs Agent, write-tool policy (including under YOLO), a Plan sidebar document, and Execute / Stay / Refine. Ask-back from Milestone 0 stays. Session todos wait for Milestone 2.

## Contracts and files

- Product: [`../product.md`](../product.md)
- Protocol: `setSessionMode`, `updateSessionPlanDocument`, `executeSessionPlan`, snapshot `plan`
- Runtime: `plan-agent-state.ts`, `plan-agent-feature.ts` (`update_plan_document`, `before_agent_start`, `tool_call` backstop), `pi-runtime.ts` tool intersection
- UI: composer Plan/Agent control, `plan-document-panel.tsx`, right-sidebar surface `"plan"`

## Changes and decisions

- New chats stay Agent. Toggle is composer-footer, idle-only, persisted as Pi custom entry `pho-code.plan-agent`.
- Plan drops `write` / `edit` / `move_to_trash` and `cursor` / `cursor_*` tools. YOLO does not restore them. Context-prompt disabled tools stay disabled. `ask_user_question` stays available.
- `update_plan_document` writes the sidebar document. No `Plan:` regex.
- Execute sets `executing`, restores Agent tools, injects the document as a hidden turn context, and starts a turn. Stay is UI no-op (remain Plan). Refine focuses the composer.
- Honesty copy: “Writes are off in Plan. Shell is not sandboxed.”
- Todos still empty on the snapshot (`remainingCount: 0`) until Milestone 2.

## Verification

- Unit verified: `bun test packages/protocol/test/plan-agent.test.ts packages/runtime/test/plan-agent-state.test.ts packages/ui/test/right-sidebar.test.ts packages/runtime/test/tool-display.test.ts` — typecheck passed 2026-08-16; one expected-order assertion was later aligned with registered-tool order during Milestone 2.
- `bun run typecheck` — passed 2026-08-16.
- `bun run lint` — passed 2026-08-16 with existing unrelated react-hooks warnings.
- Desktop: not verified in this slice (owner asked not to focus on tests). Next check is an Electron journey: toggle Plan, no write tools, save a document, Execute, V3 row, ask-back still opens.
- Packaged: not verified.

## Mistakes and corrections

None yet in this slice.

## Owner feedback

None yet.

## UI impact

Composer Plan/Agent select plus “Writes off” mark. Right-sidebar Plan surface with re-click collapse. Reciprocal UI log: [`../../../../ui/logs/2026-08-16-change-plan-sidebar.md`](../../../../ui/logs/2026-08-16-change-plan-sidebar.md).

## Blockers and handoff

Milestone 1 is in source and not accepted. Restart `bun run dev` if Electron was started before this slice. Next is owner try-out, then Milestone 2 session todos.
