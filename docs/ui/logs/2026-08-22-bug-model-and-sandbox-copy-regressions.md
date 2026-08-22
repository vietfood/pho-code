# Model-switch and sandbox copy regressions from the copy trim

Kind: bug
Status: in source
Surface: change-model dialog, cursor model warning, Settings sandbox
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)

## Intent

`bun run dev` failed to bundle, and the trim in `fb65320` ("streamline trust and model copy") had cut more than the sentences it meant to.

## Expected / actual (before)

- **Dev build:** expected the renderer to bundle. Actual: rollup stopped on `"sessionPromptPreview" is not exported by packages/protocol/src/index.ts`, imported by `packages/runtime/src/transcript.ts`. `sessionCatalogCopy`, `sessionTitleSeed`, and `generateSessionTitle` were missing the same way, and `@pho-code/runtime` did not typecheck.
- **Change model dialog:** expected "Switch from Echo to GPT Test." Actual, whenever a current model was known — the common mid-chat case — "Switch from Echo to " and nothing after it. `fb65320` deleted the `{nextLabel}` span along with the trailing sentence it sat next to, so the dialog never named the model being switched to. The cache bullet was also left ending on a bare `;` where the removed clause used to continue.
- **Settings sandbox:** expected no disclosure paragraph. Actual: `SANDBOX_DISCLOSURE` became `""` but `sandbox-settings.tsx` still rendered `<p>{sandbox.disclosure}</p>` unconditionally, leaving an empty styled paragraph under the heading.

## Changes and decisions

- The missing exports were not a pho-code defect. `@pho-agent` gained `protocol/src/session-title.ts` and `runtime/src/session-title.ts` in `cd804eb`/`627c693`; the submodule gitlink was behind. Fast-forwarded `packages/pho-agent` `ad74a1a` → `627c693`. `packages/protocol/src/index.ts` already re-exports `@pho-agent/protocol` wholesale, so all three helpers resolve with no pho-code source change.
- Restored `{nextLabel}` in the change-model dialog's current-model branch and closed the cache bullet with a period. The shortened copy stays shortened — only the model name came back.
- `SANDBOX_DISCLOSURE` gained its missing semicolon, and the Settings paragraph now renders only when the disclosure is non-empty. The field stays on the wire so the protocol shape is unchanged.
- Tests updated for the copy that was deliberately removed: `cold prefix` and `JSONL transcript` assertions dropped from the two dialog tests, and the sandbox test now asserts the disclosure is empty. The `GPT Test` assertion was kept — it was the assertion that caught the missing model name.

## Stale tool-name assertions in the runtime suite

`packages/runtime/test/pi-runtime.test.ts` failed two `ask_user_question` cases with an empty `outputPreview`. Not a functional regression — the assertions were stale.

`db51873` deliberately moved display naming out of the runtime: `transcript.ts` dropped `displayToolName(part.name)` for plain `part.name`, so transcript blocks now carry the canonical Pi id and the UI maps the label. The old map rendered `ask_user_question` as `"ask user"`, which is what both tests still searched for. The `.find()` therefore matched nothing, `tool` was `undefined`, and every assertion below it ran against the `""` fallback in `tool && "outputPreview" in tool ? tool.outputPreview : ""`.

- Both lookups now match `ask_user_question`.
- Each test gained an `expect(tool).toBeDefined()` before the preview assertions. Without it the `""` fallback silently absorbs a missing block — which is why the sibling `not.toContain(ASK_USER_DECLINE_MESSAGE)` at the top of the first test kept passing for the wrong reason while its own file was broken.
- Swept the rest of the suites for the retired labels (`ask user`, `web search`, `fetch`, `move to trash`, `read skill`, `plan document`, the `FFF *` forms). Only these two sites asserted on transcript block names; the `tool-row` and `web-source` tests pass both canonical and display forms on purpose, because those UI helpers accept either.

My first read of this called it a live defect in the tool-preview work. That was wrong — the preview pipeline is fine.

## Verification

- **typecheck:** `bun run typecheck` — all 8 packages clean, including `@pho-code/runtime`, which did not compile before.
- **unit verified:** `bun test packages/ui/test/ packages/protocol/test/ packages/application/test/ packages/runtime/test/` — 691 pass, 0 fail.
- **lint:** `eslint packages/protocol/src packages/ui/src` — 0 errors, 2 pre-existing hook-deps warnings.
- **desktop:** not verified here; the owner runs `bun run dev`.
- **packaged:** not verified.

## Owner feedback

2026-08-22: reported the `sessionPromptPreview` bundle failure and asked for the outstanding breakage to be fixed; then pushed the submodule commits that carry the helpers.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
