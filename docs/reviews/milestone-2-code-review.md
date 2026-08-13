# Milestone 2 code and UX review

> Historical acceptance record. Later decisions supersede its forward-looking scope; use [`../current-state.md`](../current-state.md), [`milestone-3-code-review.md`](./milestone-3-code-review.md), and [`../implementation-plan.md`](../implementation-plan.md) for the active product model.

Reviewed on 2026-08-13 against the current source tree, the owner-provided real-provider screenshot, the existing focused verification records, and a lightweight lint/typecheck recheck.

## Verdict

Milestone 2 is accepted as an internal integration proof, with one product correction from the owner: the Resources surface is not the intended product. The useful result is the Pi resource-loader/host-UI seam, structured Electron command results, persistent shell, session replacement/rebind, and baked-resource injection point. The user-facing catalog, reload controls, extension commands, project/global feature discovery, and future enable/install behavior are superseded. Milestone 3 must turn the seam into a fixed harness feature set.

Milestone 1 is also accepted for the personal application. M1-001 is closed by the run-supersession reducer and second-prompt coverage. For M1-006, the owner-provided screenshot and explicit report demonstrate a real `deepseek/deepseek-v4-flash` multi-turn session with thinking, failed/completed tools, and continued assistant output. Session reopening remains supported by the existing deterministic Electron path; it was not independently repeated during this review. This distinction is recorded rather than representing the screenshot as automated evidence.

Milestone 3 is active. Its first architectural task is to replace configurable resource composition with a source-controlled feature manifest, then bake in the permission system and its decision dialogs. Theme is the only user-facing customization; model credentials, workspace/session history, and permission decisions are operational state rather than installable features.

## What is working well

- `packages/runtime/src/resources.ts` proved that Pi can project loaded feature diagnostics without walking resource directories independently; this becomes an internal diagnostic, not a store/catalog.
- Project-resource approval remains process-lifetime and passes through Pi's public trust resolver.
- `packages/runtime/src/extension-host.ts` binds Pi extensions in RPC host mode, cancels pending dialogs during replacement/disposal, and rebinds after session replacement.
- The resource fixture proves a trusted project skill, extension diagnostic, reload, confirm dialog, notification, and a second command after replacement with one coherent setup.
- Expected IPC failures now cross as JSON-safe command results and are reconstructed in preload, closing M1-002.
- The renderer has a viewport-owning sidebar/main frame, internal transcript scrolling, an anchored compact composer, Resources navigation, and contextual diagnostics.
- M1-001 is correctly fixed: authoritative snapshots/admissions can supersede terminal runs while late incremental events remain stale.
- Pi-web-derived shell, composer, transcript, and token work is recorded in the attribution log. No Beautiful UI or T3 Code source has been copied into the product.

## Findings carried into Milestone 3

### M2-001 — P2 — A new active session can be absent from the sidebar

`apps/desktop/src/App.tsx:127` gives `workspace.sessions` precedence over the newer `snapshot.sessions`. The workspace projection may still contain the pre-session empty list while run settlement has already updated the authoritative session snapshot. The screenshot shows the consequence: an active multi-turn conversation alongside “No saved sessions yet.”

Required change: derive the sidebar list from the active snapshot when one exists, or update workspace and conversation through one small state transition whenever a session snapshot arrives. Avoid adding a state library; this is a source-precedence correction.

### M2-002 — P2 — Unsupported extension UI is thrown as data and becomes `[object Object]`

`packages/runtime/src/extension-host.ts:68-79` records a compatibility diagnostic and throws the plain `HarnessError` record returned by `createHarnessError`. The installed `@gotgenes/pi-permission-system` catches that value and formats it with `String(error)`, producing the screenshot's `[object Object]` reason. Its RPC path calls `ctx.ui.select` for the permission decision and may call `ctx.ui.input` for a denial reason; both are currently unsupported at `extension-host.ts:145-147` and later in the same UI context.

Required change: implement protocol/UI support for `select` and `input` as the first Milestone 3 slice, using the same request-ID, abort, timeout, settle, replacement, and disposal lifecycle as confirm. Unsupported in-process UI methods must throw an actual `Error` with a useful message while recording the structured compatibility diagnostic separately. Arbitrary `ctx.ui.custom` remains unsupported.

This is not a Milestone 2 blocker because that milestone deliberately promised one representative confirm path. It is a daily-usability priority because the owner's configured permission extension otherwise blocks commands fail-closed.

### M2-003 — Superseded product direction — Remove the Resources catalog

`packages/ui/src/resources-view.tsx` presents discovered skills/extensions and executable extension commands as if the harness were a configurable Pi host. The owner explicitly does not want that product. Extensions, skills, and later MCP integrations are named application features selected in source and shipped with the harness.

Required change: remove the Resources destination and product commands. Retain only an internal About/Diagnostics projection of baked feature IDs, versions, and load failures if it helps debugging. Disable ordinary global/project extension, skill, and prompt discovery while passing the curated paths/factories explicitly to Pi. Keep repository context files such as `AGENTS.md`; they are workspace instructions, not installable features.

### M2-004 — P2 — The confirm dialog does not trap focus

`packages/ui/src/confirm-dialog.tsx` moves initial focus and supports Escape, but Tab can leave the modal. The product requirements already call for focus trapping.

Required change: use the smallest accessible dialog primitive or a two-control focus loop, restore focus to the invoking control, and share that behavior with the new select/input dialogs.

### M2-005 — P3 — The UI still exposes diagnostic density and raw tool payloads

The shell is structurally better, but the screenshot still reads as an engineering surface: runtime/version diagnostics remain expanded in the sidebar, workspace paths dominate, thinking is long italic text, and tool cards expose large raw payloads. The failed permission message is technically accurate but visually noisy.

Required change: collapse diagnostics by default, truncate secondary paths, collapse completed tool details, keep failures legible, and render assistant Markdown/code conservatively. Establish hierarchy before changing colors or adding animation.

### M2-006 — Repository hygiene — T3 Code is an undocumented reference

`refs/t3code` is now a clean MIT-licensed gitlink at `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5`, but the reference inventory and contribution rules still name only pi-gui and pi-web. No product source currently attributes adaptation from T3 Code.

Required change: classify it explicitly as a read-only UI/product reference and add an attribution row only if code or structure is later copied or materially adapted. Do not introduce a runtime dependency on the reference.

## Milestone 3 calibrated scope

Implement in this order:

1. Define one source-controlled feature manifest and configure Pi with ordinary extension/skill/prompt discovery disabled plus only the manifest's explicit factories/paths.
2. Pin and bundle `@gotgenes/pi-permission-system` `24.0.0` as the first feature; do not rely on the owner's global `npm:` settings entry.
3. Implement its RPC permission flow: `select`, optional `input`, notification/status support, useful unsupported-capability errors, and clean allow/deny/cancel settlement. Arbitrary `ctx.ui.custom` remains unsupported.
4. Remove the Resources store/catalog navigation; expose baked feature health only in internal diagnostics when useful.
5. Correct shell state: show the active/new session immediately, restore focus after dialogs, and make transient notifications dismissible.
6. Improve conversation readability: conservative Markdown/code, collapsed tool details, clearer thinking/running/failure states, and reliable scroll-to-latest behavior.
7. Add model and thinking selectors only through Pi's session APIs and persisted session state.
8. Refine spacing, typography, responsive sidebar behavior, light/dark/system theme, and reduced motion. Theme is the only user-facing customization. Beautiful UI, pi-web, or T3 Code may supply small interaction patterns, but every material adaptation must be recorded.

Defer image attachments, virtualization, broad shortcut systems, terminal UI emulation, arbitrary extension renderers, packaging, and MCP unless measured daily use or a separate user request makes them necessary.

## Milestone 3 exit evidence

- A newly created active session appears in the sidebar without relaunch.
- The owner's permission extension can present its select flow and approve one safe tool call; denial and cancellation also settle cleanly.
- Confirm/select/input dialogs keep focus inside, support Escape, restore focus, and are cancelled on session replacement/quit.
- Pi does not load unspecified global/project extensions, skills, or prompts; only the source-controlled feature manifest is active.
- The Resources catalog and extension-command launcher are absent from the normal product UI; baked feature failures remain diagnosable.
- Real-provider conversation shows readable Markdown/code and compact expandable tool activity.
- The existing deterministic chat/resource lanes remain green; add only the smallest focused checks for the new host-UI variants and session-list regression.
- Attribution is current for every adapted component.

## Verification performed in this review

| Check | Result |
| --- | --- |
| `bun run lint` | Passed |
| `bun run typecheck` | Passed for protocol, UI, runtime, application, and desktop |
| Owner real-provider screenshot | Demonstrates two prompts, real model output, thinking, and failed/completed tool projection |
| Existing agent verification records | Report focused runtime/resource and five Electron paths as passing |

This review intentionally did not rerun the unit suite, Electron suite, or production build. Those checks were already recorded by the implementing agents, the user requested a lightweight review, and the inspected change did not require another duplicate run to identify the carried issues above.
