# Plan / Agent and ask-user acceptance review

Status: accepted  
Owner: features/plan-agent  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`2026-08-16-m0-ask-back.md`](./2026-08-16-m0-ask-back.md), [`2026-08-16-m1-plan-agent.md`](./2026-08-16-m1-plan-agent.md), [`2026-08-16-m2-todos.md`](./2026-08-16-m2-todos.md), [`2026-08-16-feedback-ask-user-allow.md`](./2026-08-16-feedback-ask-user-allow.md), [`2026-08-16-feedback-execute-hidden-or-tool.md`](./2026-08-16-feedback-execute-hidden-or-tool.md), [`2026-08-18-bug-todo-plan-desync.md`](./2026-08-18-bug-todo-plan-desync.md), [`2026-08-18-m3-packaged-honesty.md`](./2026-08-18-m3-packaged-honesty.md), [`../../../../ui/logs/2026-08-16-change-ask-user-card.md`](../../../../ui/logs/2026-08-16-change-ask-user-card.md), [`../../../../ui/logs/2026-08-16-feedback-plan-chip.md`](../../../../ui/logs/2026-08-16-feedback-plan-chip.md), [`../../../../ui/logs/2026-08-16-feedback-plan-comment-icons.md`](../../../../ui/logs/2026-08-16-feedback-plan-comment-icons.md), [`../../../../ui/logs/2026-08-18-change-composer-meta-strip.md`](../../../../ui/logs/2026-08-18-change-composer-meta-strip.md)

## Decision

The owner accepted Plan / Agent on 2026-08-18 after live `ask_user_question`, Plan mode, and todos, plus Milestone 3 packaged evidence. This review does **not** by itself move the folder; the owner asked to archive the workstream in the same session.

## Accepted boundary

- Pho-owned inline factory `plan-agent` `0.1.0`. `@juicesharp/rpiv-ask-user-question` and `@earendil-works/pi-tui` are not dependencies of protocol, application, runtime, UI, or desktop. Renderer lint forbids those imports. `ctx.ui.custom` and `ctx.ui.editor` still throw.
- Agent is the default. Plan is a write-tool policy, not a sandbox: `write` / `edit` / `move_to_trash` / Cursor SDK tools stay off even under YOLO; shell is not boxed. Honesty copy: “File writes are off. Shell is not sandboxed.”
- `ask_user_question` is a structured `questionnaire` host dialog (A/B/C or Type something), distinct from permission. Cancel is a tool decline.
- One session `todo` list in Agent and Plan. Transcript checklist and Plan rail share it. Composer `n/m` chip is **not** shipped (2026-08-18 meta-strip).
- Plan document on the right sidebar; Execute is the Plan footer **or** `execute_plan`. Kickoff is hidden. Execute writes are V3-tracked. Stay/Refine buttons are **not** shipped; comment box + pen edit remain.
- `ask_user_question`, `update_plan_document`, `todo`, and `execute_plan` are permission-allow-listed. Isolated first-launch can still show Allow once until a permission file exists for `syncHarnessPermissionPolicy`.

Not this add-on: Cursor Ask as a third mode; live canvases; subagents; OS sandbox of Plan-mode bash (accepted sandbox add-on wraps bash independently).

## Acceptance evidence

Milestone 0: [`2026-08-16-m0-ask-back.md`](./2026-08-16-m0-ask-back.md).  
Milestone 1: [`2026-08-16-m1-plan-agent.md`](./2026-08-16-m1-plan-agent.md).  
Milestone 2: [`2026-08-16-m2-todos.md`](./2026-08-16-m2-todos.md).  
Milestone 3: [`2026-08-18-m3-packaged-honesty.md`](./2026-08-18-m3-packaged-honesty.md).

Acceptance-gate checks, macOS arm64, 2026-08-18, isolated temp userData/workspace:

- **unit verified:** `bun run typecheck` — pass. `bun run lint` — 0 errors (5 pre-existing `react-hooks/exhaustive-deps` warnings). `git diff --check` — recorded with the documentation slice.
- **unit / integration verified:** `bun test` — 668 pass, 2 fail (`CHANGE_REVIEW_COPY` empty-string asserts in `packages/protocol/test/change-review.test.ts`; V3, pre-existing). YOLO-does-not-restore-writes is covered in `packages/runtime/test/plan-agent-state.test.ts`.
- **desktop verified:** `bun run test:desktop` — 22 pass, including ask-back vs permission chrome.
- **packaged verified:** `bun run build` — pass. `bun run package:mac` — unsigned `.app`. `bun run test:packaged` — 6 pass (no juicesharp feature tree; juicesharp adapted notices; plan-agent loaded; questionnaire; Plan write-off; Execute write + V3; Agent todos).

**owner-verified:** 2026-08-18 live app for ask-back, Plan, and todos.

## Residual limits

- Composer mode control is the `+` context button, not a labeled Agent/Plan chip. Hover title on the Plan option carries honesty.
- Isolated packaged first-launch may still prompt Allow once for plan/todo/write until permission config exists.
- Linux packaged verification remains deferred.
- Implementation-plan M1 still mentions Stay/Refine; product chrome is comment + pen. Do not rewrite that old plan text; this review supersedes it.

## Architecture promotion

Questionnaire host dialogs, Plan/Agent tool intersection, session `todo`, Plan document + Execute, and packaged factory staging are current architecture. `custom` / `editor` remain unsupported.

## Handoff

No remaining plan-agent milestone. Later expansions (Ask mode, canvases, subagents) need a new promotion.
