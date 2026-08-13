# Milestone 1 code and UX review

> Historical acceptance record. Current product philosophy and forward sequencing live in [`../current-state.md`](../current-state.md), [`../product-v1.md`](../product-v1.md), and [`../implementation-plan.md`](../implementation-plan.md).

Reviewed on 2026-08-13 against the current source tree, the pinned Pi SDK `0.84.1`, the focused verification commands, and the two owner-provided macOS screenshots.

## Verdict

Milestone 1 is a real Pi vertical slice, not a façade. The application owns a narrow Electron bridge, creates persistent Pi sessions, projects JSONL history, publishes sequenced run events, renders text/thinking/tool activity, supports abort, and restores a session after relaunch. The package boundaries are proportionate and should be preserved.

Milestone 1 was accepted on 2026-08-13 after its closure items were reviewed. M1-001 is fixed in source and covered by the focused reducer/second-prompt paths. M1-006 is owner-validated by the later `deepseek/deepseek-v4-flash` multi-turn screenshot and explicit report that the app works; deterministic Electron verification remains the evidence for quit/reopen. See the [Milestone 2 code and UX review](./milestone-2-code-review.md) for the acceptance record and the distinction between owner-provided and directly rerun evidence.

The owner calibration result is clear: the behavior is useful enough to continue, while the current UI is only a functional scaffold. The next milestone should establish the desktop shell and navigation before adding the resource catalog.

## What is working well

- `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` are pinned exactly at `0.84.1`; Electron `43.4.0` embeds Node `24.18.1`, satisfying Pi's Node requirement.
- `packages/runtime` is the only product package that imports Pi. The renderer remains free of Electron, Node, and Pi imports.
- The runtime uses `AgentSessionRuntime`, `SessionManager`, `ModelRuntime`, Pi's project-trust resolver, and Pi JSONL rather than recreating the agent loop or transcript store.
- Native picker approval is process-lifetime only. Reopening a remembered workspace does not silently persist a new Pi trust decision.
- Prompt admission, sequenced events, abort, runtime disposal, deterministic model injection, and session reopening are implemented as concrete behavior.
- The preload exposes named methods and a subscription wrapper rather than raw `ipcRenderer`.
- The Electron smoke path proves renderer isolation, CSP/navigation/permission guards, bounded shutdown, deterministic tool streaming, and transcript restoration.
- No copied or materially adapted reference or Beautiful UI component is currently recorded, which matches the source reviewed here.

## Findings

### M1-001 — P1 — A valid second run is discarded as stale

`packages/protocol/src/events.ts:77-80` rejects every event whose `runId` differs from the run ID retained in the current snapshot. A settled, failed, or cancelled snapshot intentionally retains its run ID. When the user submits a second prompt, the new authoritative `sessionSnapshot`, `runAdmitted`, deltas, and settlement all carry the new run ID, so the reducer advances `lastSequence` while ignoring the entire run. The runtime can execute the second prompt, but the renderer remains visually stuck on the first result.

Required change: distinguish events that establish a new current run from incremental events that belong to an existing run. An authoritative session snapshot and a valid new admission after a terminal state must be able to replace the prior run ID; stale filtering should apply to deltas/tool/failure/settlement records only after the current run has been established. Keep this as one reducer rule and one focused regression example: settle run A, admit and stream run B, then prove a late run-A delta cannot overwrite run B.

This finding blocks Milestone 1 acceptance because the product is a conversation loop, not a one-shot prompt viewer.

### M1-002 — P2 — Structured command errors are lost at the Electron boundary

`apps/desktop/electron/main.ts:122-126` converts a `HarnessError` into a plain `Error`. Electron preserves the message for a rejected `invoke`, but the renderer cannot recover `code`, `recoverable`, `operation`, or safe details, even though `apps/desktop/src/App.tsx:209-216` tries to recognize a `HarnessError`.

Required change during early Milestone 2 protocol work: return a JSON-safe result envelope for expected command failures, or reconstruct a validated `HarnessError` in preload. Keep unexpected exceptions as generic failures and do not send stacks or arbitrary error objects to the renderer. This does not block the deterministic Milestone 1 flow because the visible message survives.

### M1-003 — P2 — The renderer has screens but no application navigation

`apps/desktop/src/App.tsx:105-197` renders exactly one of the workspace picker, session list, or conversation based on local state. Once a conversation is open, there is no visible action to change workspace, return to sessions, or open another session. The screenshots confirm that the desktop window has no persistent app navigation.

Required change as the first Milestone 2 UI slice: introduce one small shell that keeps workspace identity, recent sessions, conversation, and Resources reachable. Do not build a general router. A simple view state plus a compact sidebar or rail is enough for this personal application.

### M1-004 — P2 — The current layout produces a document-sized form instead of a desktop workspace

The UI centers every screen at `52rem` while the conversation also forces `height: calc(100vh - 5rem)` inside a padded grid (`apps/desktop/src/styles.css:16-43`). On a large desktop window this creates excessive unused space, and in the conversation screenshot it produces a page scrollbar around a composer that should remain anchored. The full-width debug strip and raw workspace path further emphasize implementation state over the current task.

Required change in the Milestone 2 shell pass:

- make the app frame own the viewport and keep scrolling inside the transcript or active panel;
- keep the composer visually anchored to the conversation, with a compact empty state near it;
- use the available width for navigation plus readable conversation content rather than a single narrow centered form;
- move protocol/Node/SDK strings to an About or diagnostics surface;
- display workspace paths as secondary, truncatable information;
- define a restrained surface, spacing, type, border, focus, and interaction hierarchy before adding more screens.

The underlying tokens are a useful start. The problem is composition and hierarchy, so importing more components before fixing the shell would not solve it.

### M1-005 — P3 — The chat surface still exposes scaffold language and browser-form behavior

Labels such as `vertical-slice`, the permanent runtime status strip, the large empty transcript, a manually resizable four-row textarea, and default-looking controls make the application read as a diagnostic prototype. The model/status line is useful but has no affordance or hierarchy, and the session/workspace screens provide little context beyond headings and raw paths.

Required change: remove internal milestone vocabulary from the product UI, make empty/loading/running/failed states intentional, and give primary/secondary/destructive actions distinct but quiet treatments. Preserve visible focus and reduced-motion behavior. This is a visual foundation pass, not a request for a broad design system.

### M1-006 — Evidence gate — Closed by owner validation

The earlier screenshot showed only model discovery. The later owner-provided screenshot demonstrates a real `deepseek/deepseek-v4-flash` multi-turn response with thinking and tool projection, and the owner explicitly reports that the application works. The deterministic Electron lane remains the evidence for transcript reopening.

Accepted evidence: owner validation for the real provider path plus the existing isolated Electron reopen path. No credentials or sensitive provider data were recorded.

## UX direction for Milestone 2

The screenshots are aesthetically rough, but the more important issue is that the current screens do not yet form a desktop product. Milestone 2 should begin with a representative workspace shell rather than a cosmetic reskin.

Use this hierarchy:

1. A compact navigation area exposes the current workspace, recent sessions, New session, and Resources.
2. The main area owns either the conversation or resource catalog.
3. Conversation chrome shows the session title and model quietly; transcript and composer remain the dominant hierarchy.
4. Diagnostics are contextual. A resource load failure belongs beside Resources; runtime/version details belong in a small diagnostics surface, not a permanent footer.
5. Narrow windows may collapse navigation into a drawer. Mac and Linux should share the same renderer layout; only native window chrome differs.

Beautiful UI may be used later for a prompt bar, streaming state, thinking indicator, or tool presentation. Copy only the units that materially improve the experience, convert them to repository tokens and protocol props, and add the source/date to `docs/references-and-attribution.md`. No Beautiful UI code is present in the reviewed milestone.

## Milestone 2 representative slice

After closing M1-001 and recording M1-006, implement one coherent slice before expanding host UI:

1. Add the viewport-owning shell and navigation described above.
2. Project the active workspace's skills, extensions, trust state, and loader diagnostics through the existing runtime/application/protocol layers.
3. Render a compact read-only Resources view with Reload. No enable/disable, installation, marketplace, or MCP configuration is required.
4. Bind one basic extension dialog through the pinned SDK and prove that session replacement rebinds the extension host.
5. Add empty named injection points for future built-in factories and skill paths without shipping unspecified resources.

Keep the evidence lane small: one isolated fixture can contain the representative skill, extension, diagnostic, and dialog. One runtime integration check and one Electron path are enough when they prove different boundaries.

## Verification performed

On 2026-08-13:

| Check | Result |
| --- | --- |
| `bun run lint` | Passed |
| `bun run typecheck` | Passed for all four workspace packages and desktop |
| `bun run build` | Passed for main, preload, and renderer |
| `bun test` | 45 of 46 passed in the managed sandbox; the only failure was macOS Trash permission denial |
| focused Trash test with normal macOS permissions | 7 passed |
| `bun run test:desktop` with normal macOS permissions | 4 passed: chat, security, shutdown, smoke |

The managed-sandbox Trash failure was environmental: the identical focused test passed when `/usr/bin/trash` had normal macOS access. No packaged installer or Linux run was checked. At the time of this original review, M1-006 was outstanding; it was later closed by the owner evidence recorded below and in the Milestone 2 review.

## Closure progress (2026-08-13 follow-up)

- **M1-001:** closed in source. `applyRuntimeEvent` now lets an authoritative `sessionSnapshot` or `runAdmitted` replace a terminal run ID; incremental text/thinking/tool/failure/settlement events with a mismatched run ID remain stale. Covered by the protocol regression and the second prompt in `apps/desktop/tests/chat.spec.ts`.
- **M1-002:** closed in source. Expected command failures cross Electron as a JSON-safe `{ ok, value | error }` result and are reconstructed in preload.
- **M1-003 / M1-004 / M1-005:** addressed in the Milestone 2 shell pass: viewport-owning sidebar, compact composer, contextual diagnostics, and pi-web visual tokens. No marketplace, settings, or plugin-management surface was added.
- **M1-006:** closed by owner-provided real-provider multi-turn evidence; deterministic Electron verification remains the reopen evidence.

## Closure checklist

- [x] Fix M1-001 and run its focused reducer example.
- [x] Confirm two consecutive prompts update the real renderer.
- [x] Record the M1-006 real-provider evidence and retain the deterministic reopen record.
- [x] Mark Milestone 1 accepted and proceed through the Milestone 2 representative slice.
- [x] Begin the Milestone 2 representative shell/resource slice; do not start a broad settings or plugin-management surface.
