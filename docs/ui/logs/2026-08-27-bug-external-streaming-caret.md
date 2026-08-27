# External streaming freezes at the caret

Status: fixed in source; focused UI and composer desktop verification complete; real external stream recheck pending

Surface: conversation live tail and composer model picker

Owner: [`../../version/v5/implementation-plan.md`](../../version/v5/implementation-plan.md), B2a/B3a/B4

Related V5 record: [`../../version/v5/logs/2026-08-27-external-models-and-streaming.md`](../../version/v5/logs/2026-08-27-external-models-and-streaming.md)

## Expected and actual behavior

Codex and ACP assistant chunks should advance in the existing transcript tail, and an external session that advertises models should use the existing composer model picker. Before the first substantive token, the transcript should show Working rather than a standalone caret.

The bridge previously exposed no external model catalog. It also published a full cumulative snapshot per chunk while Pho Code retained the first non-empty same-run snapshot. Whitespace-only output therefore left only the solid caret visible, which looked like backend text and made streaming appear unavailable.

## Fix

External backends now publish bounded text-delta events through Pho Agent and the Pho Code runtime. Same-run snapshot reconciliation prefers newer non-empty content and uses current content only as an empty-snapshot fallback. The live tail tests for non-whitespace text before rendering streaming Markdown and its caret; otherwise it uses the existing Working state.

Codex and ACP model choices now enter the existing picker from their backend-owned catalogs. External models omit Pi-specific price/context metadata when the backend does not provide it.

## Verification

- Focused protocol/runtime/UI and adapter suite: 60 passed.
- The UI case explicitly verifies whitespace-only streaming text renders Working without `stream-caret`.
- The rebuilt focused Electron composer/backend test passed 1 test. A provider-backed external stream is intentionally left for owner recheck because the automated lane does not use real external credentials.
