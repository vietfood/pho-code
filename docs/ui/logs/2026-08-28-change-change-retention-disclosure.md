# Change-ledger retention honesty behind an information control

Date: 2026-08-28
Kind: change
Status: in source; unit and desktop verified
Surface: Changes review toolbar (shared right-sidebar tile)
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Product owner for Changes semantics: archived [`v3`](../../archive/v3/README.md)
Related defect: [`../../urgent/2026-08-27-defect-unwired-protocol-and-ripgrep-guards.md`](../../urgent/2026-08-27-defect-unwired-protocol-and-ripgrep-guards.md)
Precedent: [`2026-08-26-change-settings-disclosure-info.md`](./2026-08-26-change-settings-disclosure-info.md)

## Owner feedback

The change-ledger retention disclosure had to come back — the retention behaviour it described never went away when the string was deleted — but the owner asked not to dump the paragraph on the user: "hide it in (i) button as other disclosure".

## Change

- Restored `CHANGE_LEDGER_DISCLOSURE` in `@pho-code/protocol`, after re-checking each claim against current source. One claim was corrected: the copy no longer scopes "not encrypted at rest" to personal v3, because the behaviour is not version-scoped.
- Placed it behind the same collapsed `details`/`summary` Info control the Sandbox and Skills disclosures use, at the head of the Changes review toolbar. Nothing occupies the review layout until the owner opens it.
- Renamed the shared control `SettingsDisclosure` → `InfoDisclosure` (`settings-disclosure.tsx` → `info-disclosure.tsx`). It is no longer Settings-only, and a Settings-named control in the Changes toolbar would misdescribe itself. Both existing call sites, their labels, and their test IDs are unchanged.
- Placed the control at the **leading** edge of the toolbar deliberately: `.change-window` sets `overflow: hidden`, so the panel's `left-0` overlay would be clipped by the tile if the trigger sat at the trailing edge.

## Verification

- `packages/protocol/test/change-review.test.ts`, `packages/ui/test/change-review-window.test.ts`, `packages/ui/test/sandbox-settings.test.ts`, `packages/ui/test/skills-settings.test.ts` — 14 passed, 0 failed (unit verified). The protocol test asserts the copy's "250 MiB" against `MAX_CHANGE_LEDGER_BYTES`, so changing the budget without changing the disclosure now fails the lane.
- `bunx playwright test tests/change-review.spec.ts` — 3 passed (desktop verified). The existing first scenario was extended rather than duplicated: it asserts the panel starts hidden, opens with the retention text on click, and closes again.
- `@pho-code/ui` and `@pho-code/protocol` typecheck — passed.

The UI test asserts substrings rather than the whole constant: the copy contains an apostrophe, which `renderToStaticMarkup` escapes to `&#x27;`. The first version of that assertion compared the raw constant and failed for exactly that reason.

## Handoff

The other gaps in the related defect note are decided but deliberately unfixed, each with a named owner. Nothing here touches Approve, Undo, conflict, or ledger behaviour — only how retention is disclosed.
