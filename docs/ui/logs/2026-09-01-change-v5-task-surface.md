# V5 Task surface

Date: 2026-09-01
Status: Implemented and machine-verified; owner real-model review pending
Surface: shared right-sidebar Task tile
Owner: [`../../version/v5/`](../../version/v5/README.md)
Evidence: [`../../version/v5/logs/2026-09-01-m1-m4-task-intelligence-implementation.md`](../../version/v5/logs/2026-09-01-m1-m4-task-intelligence-implementation.md)

## Change

The shared right-sidebar rail now includes Task as a fourth tile beside Changes, Context prompt, and Plan. It uses the existing tiling/tray host. A dot marks sessions with a brief, and the tile opens automatically when a brief first appears.

Task contains four authoritative sections:

- Brief: idle-only owner editor for outcome/criteria/constraints/assumptions/questions/non-goals, plus reset and reopen;
- Evidence: selected sanitized excerpts with source, freshness, selection reason, token/character budget, omissions, and provider failures;
- Verification: source-linked records plus an explicit owner-only observation form;
- Completion: exact criterion outcomes, disclosed gaps, and owner acceptance only for unverified—not failed—criteria.

During a live run, the full Task state stays visible but edit/record/accept controls are disabled. Session selection, reload, and relaunch take authoritative snapshot state; the renderer does not reconstruct Task from transcript prose.

## Verification

- `bun test packages/ui/test/task-panel.test.ts packages/ui/test/right-sidebar.test.ts --timeout 20000` — PASS.
- `cd apps/desktop && bunx playwright test task.spec.ts` — PASS, including relaunch.
- isolated packaged Task smoke — PASS.

Owner review follows [`../../version/v5/handoff.md`](../../version/v5/handoff.md). This log records UI implementation, not V5 product acceptance.
