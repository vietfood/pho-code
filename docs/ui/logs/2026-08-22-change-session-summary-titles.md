# Session summary titles

Kind: change
Status: in source
Surface: project/session sidebar, chat header, welcome recents
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)

## Intent

Owner sent `/pho-code:repository-investigation`. The session title became the expanded skill dump (`<<<pho-skill …>>>` plus frontmatter). They want a short summary name, as in Claude Code.

## Expected / actual (before)

Expected: a readable session label such as “Repository investigation” or a 3–8 word model summary.
Actual: the first user message, including the inlined skill body, was used as `SessionSummary.title`.

## Changes and decisions

- Catalog titles prefer Pi `sessionName`. Otherwise they derive a short label from the first user prompt: strip `<<<pho-skill` bodies, humanize leftover `/source:name` tokens, and cap length. A stored name that is itself a skill dump is treated as unset.
- After the first settled turn, unnamed sessions ask the current model for a 3–8 word title on a tool-less Agent copy and persist it with Pi `setSessionName`. The deterministic test model skips that request. Failures keep the derived fallback.
- Hover preview is the stripped first prompt, not the dump.

## Verification

- **unit verified:** `bun test packages/pho-agent/packages/protocol/test/session-title.test.ts packages/runtime/test/transcript-tool-display.test.ts apps/desktop/tests/unit/package-boundaries.test.ts packages/runtime/test/pi-runtime.test.ts` (2026-08-22): **47 passed**. `@pho-code/runtime` / `@pho-agent/runtime` / `@pho-agent/protocol` typecheck and lint passed.
- **desktop:** not verified here (real-provider auto-title still needs an owner chat).
- **packaged:** not verified.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md). Existing unnamed sessions pick up the derived fallback on the next list/open without a JSONL rewrite.
