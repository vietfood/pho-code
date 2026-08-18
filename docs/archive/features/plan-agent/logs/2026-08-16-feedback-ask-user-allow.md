# Ask-user, plan, and todo stay off the permission dock

Status: implemented (add-on not accepted)
Owner: features/plan-agent
Plan: [`../implementation-plan.md`](../implementation-plan.md)
Related logs: [`2026-08-16-m0-ask-back.md`](./2026-08-16-m0-ask-back.md), [`2026-08-16-m2-todos.md`](./2026-08-16-m2-todos.md), [`../../../../ui/logs/2026-08-16-bug-ask-user-type-shortcut.md`](../../../../ui/logs/2026-08-16-bug-ask-user-type-shortcut.md)

## Intent

The owner does not want a permission prompt for `ask_user_question`. Treat it the same as `update_plan_document` and `todo`. Also let `web_search` through; only `fetch_content` should ask.

## Contracts and files

- Product: [`../product.md`](../product.md) ask-user contract
- Architecture: [`../../../../architecture/extension-model.md`](../../../../architecture/extension-model.md) managed permission templates
- Runtime: `packages/runtime/src/permission-presets.ts`, `permission-settings.ts` (`syncHarnessPermissionPolicy`), `pi-runtime.ts`

## Changes and decisions

- Presets already listed `ask_user_question: allow`. Settings detection injected missing harness allows for profile matching only, so an older on-disk managed file still applied `"*": "ask"`.
- Runtime start now writes `ask_user_question` / `update_plan_document` / `todo` as `allow` onto existing permission objects (including Custom). Managed profiles also get `web_search: allow` and `fetch_content: ask`.
- Preset version 4. Developer no longer asks for search and allows fetch; that pair is inverted on every managed template.
- Recognition of v2 Guarded/Balanced files is unchanged. Read-only Settings snapshots still do not rewrite the file.

## Verification

- Unit verified: `bun test packages/runtime/test/permission-settings.test.ts packages/ui/test/ask-user-card-state.test.ts` — 15 pass.
- `bun run typecheck` passed. `bun run lint` — 0 errors; remaining exhaustive-deps warnings are pre-existing in App.tsx / context-prompt-dialog.tsx.
- Desktop/packaged: not verified. Restart `bun run dev` so the live permission file is synced.

## Mistakes and corrections

M0 said “permission presets allow `ask_user_question`.” That was true of the template, not of an already-written `config.json` that Settings still labeled as a managed profile.

## Owner feedback

Same as plan and todo: do not ask for permission. Search through; only fetch needs permission.

## UI impact

None on chrome. The questionnaire card is the ask-user UI; the permission dock must not appear first. Letter-shortcut typing is a separate UI bug log.

## Blockers and handoff

Re-selecting a profile in Settings also writes the current template. Sync on boot is what fixes an already-selected managed profile without that click.
