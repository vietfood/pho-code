# Compaction Milestones 0–4 implementation

Date: 2026-09-01
Owner: features/compaction
Status: Implemented and machine-verified; owner verification with a real model pending ([`../handoff.md`](../handoff.md))
Plan: [`../implementation-plan.md`](../implementation-plan.md) (Milestones 0–4)
Related: [Pho cutover strategy](./2026-09-01-pho-cutover-strategy.md), [model-driven cutover research](./2026-09-01-model-driven-cutover-research.md), [Pi pin 0.84.4](./2026-08-30-pi-pin-0.84.4.md), [`../product.md`](../product.md)

## Intent

Implement the full compaction add-on end-to-end in one pass: M0 display projection, M1 controller, M2 UI, M3 context-continuity feature (budget signal, notes, history), M4 Pho cutover (hook + `new_context`). Owner direction: implement end-to-end without per-milestone owner gates because no model was available for incremental testing; the owner self-tests from [`../handoff.md`](../handoff.md) afterward. This overrides the plan's Milestone 2 acceptance gate for M3–M4 **implementation only** — product acceptance still requires the owner's real-model pass.

Second owner direction: foundational, reusable pieces live under `packages/pho-agent/`; Pho Code-specific wiring stays in `packages/`.

## What landed where

### `packages/pho-agent` (foundational)

- `packages/protocol/src/compaction.ts` — reason/status/outcome vocabularies, `AgentCompactionState`, `TranscriptCompactionBoundary`, `CompactionDetail`, validators, 64 KiB summary bound, error sanitizer, and shared `COMPACTION_COPY` (including the from-notes label/hint).
- `packages/runtime/src/display-transcript.ts` — projects a Pi branch into `TranscriptItem[]` (messages + compaction boundaries) with stable Pi entry ids; `legacyDisplayIdCandidates` keeps pre-existing rewrite overlays compatible across the id-scheme change.
- `packages/runtime/src/compaction-controller.ts` — per-session compaction state machine over `AgentSession` events; manual compact/cancel with reentrancy guards; maps Pi's aborted-summarization `compaction_end` to an honest `cancelled` outcome when the host requested the cancel.
- `packages/runtime/src/context-continuity-feature.ts` — the M3–M4 feature: banded budget injector on the `context` event (50/25/10% remaining, ephemeral, cache-friendly); `notes_append`/`notes_write`/`notes_read` over one bounded `<sessionId>.notes.md` sidecar; `history_search`/`history_read` over the active branch; the `session_before_compact` cutover hook (`buildCutoverDigest`, declines on empty notes); the `new_context` tool and `ContextCutoverSignal`.
- `test/pi-compaction-characterization.test.ts` — six characterization tests pinning Pi 0.84.4 behavior: manual, threshold, overflow (compact + single retry), abort, request-only `context` mutations, and hook replace/decline.

### `packages/` (Pho Code wiring)

- `packages/protocol` — compaction commands/events (`CompactSession`, `CancelSessionCompaction`, `GetCompactionDetail`, `compaction-state-changed`), `TranscriptItem` union in `SessionSnapshot`, protocol version bump, preload bridge.
- `packages/runtime` — `features.ts` manifest gains `contextContinuity` toggle + `contextContinuityOptions` seam; `pi-runtime.ts` wires the `ContextCutoverSignal`, runs pending cutovers at the turn boundary (`finishRun` → `maybeRunPendingCutover`, generation-checked, dropped on failed/aborted turns and on session rebind/dispose), trashes the notes sidecar with the session, and extends the deterministic test model's tool allowlist; `hosted-runtime.ts` projects idle compaction state for non-Pi backends.
- `packages/application` + `apps/desktop` — bootstrap commands and IPC channels; Vite aliases for the new subpath exports.
- `packages/ui` — work-log grouping across boundaries, `CompactionBoundaryRow` (from-notes copy when `fromHook`), usage-popover Compact/Cancel action, transcript CSS.

## Decisions

- **Notes sidecar naming:** `<sessionId>.notes.md` (session-id keyed, not Pi's timestamped JSONL basename). One convention used by creation, tests, and the Trash path.
- **Cutover timing:** `new_context` never compacts mid-turn. The tool sets the signal; `finishRun` consumes it only on a successful, unaborted turn, and `maybeRunPendingCutover` waits for `session.isIdle`.
- **Cancel honesty:** Pi 0.84.4 reports a host-cancelled summarization as `compaction_end` with `aborted: false` and an error message; the controller projects `cancelled` when a host cancel was in flight and no result was produced.
- **Deterministic test model:** `keepRecentTokens: 64` in the test settings so small scripted sessions can actually compact; new `TEST_PROMPT` tokens drive the continuity tools and a fail-after-tool path.

## Verification (all run 2026-09-01, macOS, sandbox-disabled lanes where noted)

- `bun run typecheck` — pass.
- `bun run lint` — 0 errors, 8 pre-existing warnings.
- `bun run test` — 1057 pass, 1 fail: `appearance theme helpers > shell dividers…` is **pre-existing on HEAD** (expects `max-width: 42rem`; `theme.css` has `48rem`; reproduced with my `theme.css` diff stashed). Unrelated to this change.
- `bunx playwright test tests/compaction.spec.ts` (apps/desktop) — 2 pass (manual compact + relaunch; disabled-while-running + empty-chat failure).
- `bun run build` — pass.
- Focused: `pi-compaction-characterization` 6/6; `context-continuity-feature`, `context-continuity-manifest`, `pi-runtime-compaction`, `pi-runtime-context-continuity`, `compaction-ui`, protocol compaction suites all pass.

Classification: unit + integration verified (real Pi SDK, temp dirs); desktop verified for the M1–M2 journeys; M3–M4 model-visible behavior is integration-verified with the deterministic model and **awaits owner real-model verification**.

## Mistakes and corrections (selected)

- Characterization tests initially cloned the Pi `Context` with `structuredClone` inside the faux provider factory, which throws on non-cloneable values and silently killed provider handling; switched to shallow-copying `context.messages`.
- Early compaction attempts failed with "Nothing to compact" because the default `keepRecentTokens` exceeded the tiny scripted sessions; padded prompts and set `keepRecentTokens: 64` for the deterministic model.
- Threshold vs overflow: an oversized scripted response tripped Pi's `isContextOverflow` instead of the threshold path; re-parameterized (`contextWindow` 32k, `reserveTokens` 30k) so each trigger is exercised distinctly.
- Overflow retry removes the failed assistant message from live agent state but keeps it in the persisted branch; the test now pins exactly that.
- Notes path derivation initially used the timestamped JSONL basename while the feature wrote `<sessionId>.notes.md`; unified on the session-id convention everywhere including Trash.
- Tool-output assertions looked only at `text` blocks; transcript tool rows carry `outputPreview` on `tool` blocks — added a `snapshotHasText` helper.
- Vite SSR build needed explicit aliases for the new `@pho-agent/*` subpath exports.
- Desktop spec: the usage popover intercepted later clicks; the spec now closes it explicitly and selects sessions positionally.

## Owner feedback and UI impact

Owner directions honored: end-to-end implementation with a handoff instead of per-milestone gates; foundational code under `packages/pho-agent/`. New UI surface: compaction boundary rows (with from-notes variant), Show/Hide summary toggle, Compact context + Cancel in the usage popover, error toasts. No settings added.

## Blockers and handoff

- Owner real-model pass per [`../handoff.md`](../handoff.md) is the acceptance gate. Watch especially: whether models write notes diligently enough for the digest path to engage, and whether the banded budget signal is noisy for any provider.
- Pre-existing unrelated failure: `packages/ui/test/appearance-theme.test.ts` max-width mismatch (42rem vs 48rem) — not touched here.
- Provider-native OpenAI path remains deferred per `product.md`; Codex/ACP stay backend-owned.
