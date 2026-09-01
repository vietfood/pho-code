# Compaction handoff — owner test guide

Date: 2026-09-01
Status: Milestones 0–4 implemented and machine-verified; **owner verification with a real model is the remaining acceptance gate.**
Plan: [`implementation-plan.md`](./implementation-plan.md) · Product: [`product.md`](./product.md) · Evidence: [`logs/2026-09-01-m0-m4-implementation.md`](./logs/2026-09-01-m0-m4-implementation.md)

## What was built

| Milestone | What you get |
| --- | --- |
| M0 — projection | Compaction boundaries appear in the transcript as divider rows; the full pre-compaction branch stays visible; markers survive restart (rebuilt from Pi's JSONL). |
| M1 — controller | "Compact context" action in the composer usage popover, with Cancel while it runs; honest errors (empty chat, running chat); threshold/overflow auto-compaction is projected live. |
| M2 — UI polish | Boundary rows group the summarized work in the work log; "Show summary" expands the bounded, sanitized Pi summary on demand. |
| M3 — context continuity | The model gets a banded remaining-context signal (50/25/10%), three notes tools (`notes_append`/`notes_write`/`notes_read`), and two read-only history tools (`history_search`/`history_read`). Notes live in a per-session `<sessionId>.notes.md` sidecar that follows Archive/Trash. |
| M4 — Pho cutover | A `session_before_compact` hook replaces Pi's LLM summary with the notes digest for **every** trigger (manual, threshold, overflow, model-requested) when notes exist; empty notes fall back to Pi's summarizer. A `new_context` tool lets the model request a cutover, executed at the turn boundary. |

## Setup

```bash
bun install
bun run stage:github-mcp   # only if you use the github-mcp feature
bun run stage:ripgrep      # only if you use packaged rg
env -u ELECTRON_RUN_AS_NODE bun run dev
```

Use a normal workspace and a real model (any non-OpenAI provider exercises the Pho cutover; OpenAI models use the same interim cutover path).

## Test 1 — Manual compaction (M0–M2)

1. Start a new chat. Have a few exchanges (enough content to compact — a handful of substantive messages).
2. Click the usage meter (percent ring) in the composer toolbar → the usage popover opens.
3. Click **Compact context**.
   - Expect: button shows "Compacting…", then a divider row appears in the transcript: **"Context compacted · Manual"**.
   - The divider has a dashed rule and a **Show summary** toggle. Expand it: the Pi-generated summary renders as sanitized Markdown.
   - All earlier messages remain visible above the divider — nothing is deleted from the display.
4. While a compaction is running (long chat helps), click **Cancel** in the popover.
   - Expect: the compaction stops, no boundary appears, and the chat keeps working.
5. Try Compact on an empty chat.
   - Expect: an honest error toast ("Nothing to compact" class), no boundary, chat unaffected.
6. Try Compact while the model is mid-run.
   - Expect: the action is disabled with "Wait for the current run to finish before compacting."
7. Quit and relaunch the app; reopen the compacted chat.
   - Expect: the boundary row is still there (rebuilt from Pi's session file). The label says only "Context compacted" — Pi does not persist the trigger reason, and the UI must not invent it.

## Test 2 — Automatic compaction (threshold/overflow)

1. In a long chat, keep working until context usage climbs near the model's limit (or lower the effective window by choosing a small-context model).
2. When Pi's threshold trips, compaction starts on its own.
   - Expect: the usage popover shows compaction in progress; a boundary row appears with **"Context compacted · Automatic"**; the chat continues without intervention.

## Test 3 — Notes and the Pho cutover (M3–M4)

1. In a chat with some history, ask the model to **"save a note about what we've done so far"** (or directly: "use notes_append to record X").
   - Expect: a `notes_append` tool call row in the transcript. The note lands in `<session-dir>/<sessionId>.notes.md` next to the session JSONL.
2. Ask the model to read its notes back ("what do your notes say?").
   - Expect: a `notes_read` call returning the note content.
3. Now compact (manual **Compact context**, or let threshold trip).
   - Expect: the boundary reads **"Context compacted from notes"** (not the plain label). Hovering shows: "Notes and recent messages were kept. Earlier work left the model context and stays searchable."
   - Expand **Show summary**: the content is the notes digest with a "[Pho context cutover]" header — **no LLM summarization request was made**.
4. Compact a chat that has **no notes**.
   - Expect: the plain "Context compacted" boundary with a normal Pi summary — the hook declines and Pi's summarizer runs.
5. Ask the model about something from before the cutover ("what was the first thing I asked you?").
   - Expect: it uses `history_search` / `history_read` to look back over the pre-compaction branch and answers from real entries.

## Test 4 — Model-requested cutover (`new_context`)

1. In a chat with notes present, tell the model: **"start a fresh context"** (or it may decide on its own when the budget signal warns it).
   - Expect: a `new_context` tool call; the tool result tells the model to save final notes; **the current turn finishes normally** (never aborted mid-turn); then compaction runs automatically and a "Context compacted from notes" boundary appears.

## Test 5 — Lifecycle (M3)

1. Archive a chat that has notes; restore it.
   - Expect: notes survive (the sidecar follows the session).
2. Move a chat with notes to Trash.
   - Expect: the `.notes.md` sidecar goes to Trash with the session file.
3. Try to Trash a chat while it is compacting.
   - Expect: refusal (unchanged non-idle Trash guard).

## What honest behavior looks like

- After any compaction, the usage meter may briefly read "unknown" context — cumulative tokens and cost never reset.
- The boundary never claims old messages were deleted; they stay in the transcript and in Pi's JSONL.
- A failed compaction (e.g. provider error) shows an error toast and leaves the chat fully usable.
- Codex/Claude (ACP) sessions show no Compact button — compaction is backend-owned there.

## Automated evidence (already run)

```bash
bun run typecheck        # pass
bun run lint             # 0 errors (8 pre-existing warnings)
bun run test             # 1057 pass, 1 pre-existing unrelated failure (appearance-theme max-width)
cd apps/desktop && bunx playwright test tests/compaction.spec.ts   # 2 pass
bun run build            # pass
```

Focused lanes for re-runs:

```bash
bun test packages/pho-agent/packages/runtime/test/pi-compaction-characterization.test.ts --timeout 20000
bun test packages/pho-agent/packages/runtime/test/context-continuity-feature.test.ts --timeout 20000
bun test packages/runtime/test/pi-runtime-compaction.test.ts packages/runtime/test/pi-runtime-context-continuity.test.ts --timeout 20000
bun test packages/ui/test/compaction-ui.test.ts --timeout 20000
```

## Known limitations

- Pi `0.84.4` does not persist the compaction trigger reason; post-restart markers say only "Context compacted".
- The notes-digest path is only as good as the model's note discipline; the banded budget signal and tool guidelines exist to teach it. Watch for models that never write notes — they silently get Pi's default summarizer instead.
- `new_context` during a failed or aborted turn is consumed without compacting (by design — never compact on a broken turn).
