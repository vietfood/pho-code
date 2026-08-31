# Narrative work phases in the transcript

Kind: change
Status: implemented
Surface: transcript work log (settled turns and live run tail)
Owner: ui/conversation chrome
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-thinking-shimmer-prompt-bar.md`](./2026-08-22-change-thinking-shimmer-prompt-bar.md), [`2026-08-22-change-tool-display-headings.md`](./2026-08-22-change-tool-display-headings.md), [`2026-08-22-change-claude-changes-overlay.md`](./2026-08-22-change-claude-changes-overlay.md)

## Intended change

Owner request (2026-08-31, with a target-app screenshot): the transcript should read as a described story — work entries group under the assistant's narration ("search …", "editing tokens") with the think/tool entries indented beneath each heading — instead of one flat list of think/tool rows with narration as bordered quote children. Scope chosen by the owner: settled turns **and** the live tail (including the small protocol addition).

## Expected / actual (before)

Expected:

```text
search …
   think A
   tool B
   tool C
editing tokens
   tool D
   tool E
```

Actual: the work log rendered a flat sequence — narration text appeared as a bordered 12px quote (`WorkNarration`) at the same level as think/tool rows, and live runs could never show narration above a later tool because `RunWorkEntry` had no text variant and `streamingText` only appended.

## Changes and decisions

- `packages/protocol/src/conversation.ts`: `RunWorkEntry` gains a `{ type: "text"; text: string }` variant — pre-tool narration committed when a new tool starts. The post-last-tool answer tail stays in `RunState.streamingText`. JSON-safe (strings only).
- `packages/protocol/src/events.ts`: new `commitNarrationBeforeTool(run, callId)` used by both the high-frequency `applyLiveRunDelta` and the snapshot `applyRuntimeEvent` tool-event reducers. A `toolEvent` for a **new** callId commits pending non-blank `streamingText` as a narration entry and clears it; tool **updates** (known callId) never commit, so text that streams while a tool runs keeps its chronology; whitespace-only text commits nothing. `mergeLiveRun` and `appendThinkingDelta` needed no behavior change.
- `packages/runtime/src/backend-conversation.ts`: the external-backend (Codex/ACP) live projection splits the in-flight assistant message the same way — text blocks before the last tool become narration work entries, text after it is the streaming tail — so all backends share one narration rule.
- `packages/ui/src/lib/work-log.ts`: new `groupWorkPhases` (settled blocks; output text excluded via the existing `isTurnOutputText`) and `groupLiveWorkPhases` (live work; every text entry is narration). Each narration opens a phase; the contiguous thinking tail of the previous phase moves under it (that thinking produced the narration); work before the first narration keeps an unlabeled phase; consecutive narrations yield an empty-entry phase.
- `packages/ui/src/transcript.tsx`: new `WorkPhaseView` — narration renders as ordinary prose (`chat-text`, foreground; no longer a bordered dense quote) with the phase's think/tool entries indented under a hairline left guide. Settled `AssistantTurn` and the live tail both render phases inside the unchanged `WorkLogToggle` disclosure (settled collapsed, live expanded). `WorkEntryView`'s prop type is tightened to thinking|tool so a narration entry can never reach `ToolRow`. Copy/rewrite/answer contracts are untouched (`turnOutputTextBlocks` still reads only post-tool text).
- Attribution: no third-party code copied; the hierarchy is inspired by the owner's target-UI screenshot, noted in a source comment. The existing T3/Codex/Beautiful UI attributions are unaffected.
- Assumption flagged for the owner: phase headings are the assistant's own narration sentences (the only faithful data available). If the target's terse gerund labels ("search …", "editing tokens") should instead be derived from tool kinds, that is a follow-up heuristic layer on top of the same phase structure.

## Follow-up iterations (2026-08-31 evening)

Owner review of the first implementation ("doesn't feel like the image") produced two refinements, both decided explicitly by the owner:

- **Streaming-text shimmer sweep** (owner-selected from the feel-fix options): `packages/ui/src/theme.css` gains `.streaming-shimmer` — the same Beautiful UI `background-clip: text` sweep as `working-shimmer`, tuned slower (1.8s) for multi-line body prose, with a reduced-motion fallback to plain foreground text. `LiveRunTail` applies it to the streaming tail only while the run is live; settled/cancelled tails render plain. Recorded here because it is the same screenshot-derived change thread; it is presentation-only (no protocol or structure change).
- **Tool-derived summary labels** (owner decisions: narration stays as a full prose paragraph **and** the group gets a terse label; the label is derived from the phase's tools, not truncated narration): `packages/ui/src/lib/work-log.ts` gains `workPhaseSummary(entries)` — dominant activity gerund by icon mapping (most frequent, ties to earliest; edit/write/read → editing/writing/reading, bash → running, grep/find → searching, web_search → "searching the web", fetch → fetching, fallback "working"), plus a target when the dominant activity is file/command/search-ish: the single distinct target (`editing theme.css`, `running npm test…` truncated at 32 chars) or a family count (`editing 3 files` — a write counts toward an editing phase's files). `WorkPhaseView` renders narration prose, then the quiet 12px `work-phase-summary` label, then the indented entries; the label also heads phases without narration (lead-in work). The turn-level `WorkLogToggle` collapse is unchanged. `conciseChipText` is now exported from `tool-presentation.ts` for the target text.

## Verification

- Unit verified: `bun test packages/protocol/test/protocol.test.ts packages/ui/test/work-log.test.ts packages/ui/test/conversation.test.ts packages/ui/test/thinking-block.test.ts packages/ui/test/live-run-store.test.ts --timeout 20000` — 71 pass, 0 fail (new: narration commit on new tool, no commit on update/blank text, live-delta commit; phase grouping: thinking-tail absorption, unlabeled first phase, consecutive narrations, live text-is-always-narration; live phase markup with prose heading above indented entries and the streaming tail below). `bun test packages/runtime/test/backend-conversation.test.ts --timeout 20000` — 4 pass, 0 fail (updated projection expectation + post-tool tail case).
- Full unit suite: `bun run test` — 957 pass, 2 fail, both pre-existing and unrelated (`baked feature staging › notices…` and `workspace package dependency graph › agent package manifests…`; they fail identically with this change stashed, and correlate with the owner's uncommitted `packages/pho-agent` gitlink change).
- `bun run typecheck` — pass across all packages. `bun run lint` — 0 errors (8 pre-existing warnings in untouched files).
- Desktop verified: `bun run --filter @pho-code/desktop test:desktop tests/chat.spec.ts` — 4/4 pass on the real Electron surface, including "streams a tool run in an isolated workspace and restores the transcript after reopen" (live work log + settled transcript restore).
- `bun run build` — pass (electron-vite build ran as the desktop lane's first step).
- Packaged: not run — no packaged resources, native dependencies, CSP, or credential paths changed.
- Not verified: owner review of the visual result (narration prose weight, indent guide) on a real run.
- Follow-up verification: `bun test packages/ui/test/work-log.test.ts packages/ui/test/conversation.test.ts --timeout 20000` — 38 pass, 0 fail (new: `workPhaseSummary` single/multi-target, family counting, dominant-activity ties, targetless gerunds, thinking-only/empty phases; live markup asserts narration → summary label → indented tool order; streaming-shimmer class present only while live). `tsc --noEmit` and eslint on touched files — clean. Desktop lane not re-run for the summary label (pure presentational grouping on top of the already desktop-verified phase structure); the shimmer was desktop-verified with `tests/chat.spec.ts` when it landed.

## Mistakes and corrections

- `bunx electron-vite build` and `bunx playwright test` resolve fresh temp copies that break against the workspace pins (missing local `electron/package.json`; duplicate Playwright). The desktop lane must go through `bun run --filter @pho-code/desktop test:desktop <spec>`.
- The first desktop attempt failed all four specs with "Process failed to launch" under the agent shell sandbox; rerunning outside it passed — the same artifact already recorded in [`2026-08-27-change-right-sidebar-tiling-tabs.md`](./2026-08-27-change-right-sidebar-tiling-tabs.md).
- A sandboxed `bun run test` also fails 13 Seatbelt/skill-source/staging tests on `EPERM`; the unsandboxed run is the meaningful signal (957 pass, 2 pre-existing failures).

## Owner feedback

Owner chose the settled+live scope explicitly (over settled-only or more reference research) and supplied the full-app screenshot showing the target chrome around the transcript. On review of the first implementation the owner asked for the streaming-text shimmer sweep and decided both grouping questions: the full narration stays as a prose paragraph (not replaced by the summary), and the summary label is derived from the phase's tools (not truncated narration, no model call).

## Handoff

- The turn-level `WorkLogToggle` collapse is unchanged; if the owner wants narration prose visible outside the collapse (as the target app shows), that is a follow-up chrome decision, not a data change.
- The streaming-text highlight sweep landed (see Follow-up iterations); reduced-motion falls back to plain text.
- Per-phase child capping ("3 more steps") was deliberately not added; the outer disclosure already bounds settled height.
- The summary label is a static quiet row, not a per-phase disclosure; per-group collapse would be a new chrome decision.
