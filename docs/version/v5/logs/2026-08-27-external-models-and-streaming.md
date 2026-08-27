# External backend models and streaming correction

Status: implemented; focused unit/integration and composer desktop verified; real external model/stream recheck pending

Owner: V5 B2a/B3a/B4

Related UI record: [`../../../ui/logs/2026-08-27-bug-external-streaming-caret.md`](../../../ui/logs/2026-08-27-bug-external-streaming-caret.md)

## Owner feedback

A real Codex session opened, but the composer showed `No model`. During another Codex run, the transcript showed standalone vertical caret marks and appeared not to stream. The owner reasonably suspected that Codex and Claude ACP could not stream through the current Pho Code bridge.

## Diagnosis

Both adapters were receiving backend-native assistant chunks and mutating cumulative transcript snapshots. Pho Code's same-run merge chose the older non-empty streaming text/work instead of a newer non-empty snapshot, so the first visible fragment could freeze. The vertical mark was Pho Code's own solid streaming caret rendered even when the accumulated backend text contained only whitespace.

Model selection was missing at the shared host boundary. The Codex adapter did not call App Server `model/list`; the ACP adapter discarded stable session `configOptions`, including the `model` category implemented by Claude ACP.

## Correction

Pho Agent now exposes an optional backend-owned model catalog/current selection plus a backend-neutral `setModel` operation and `text_delta` runtime event. Codex discovers models after initialization with paginated `model/list`, applies the selected model on the next `turn/start`, and emits `item/agentMessage/delta` as a text delta while retaining the cumulative transcript for authoritative snapshots. If an older compatible App Server lacks model discovery, a source-configured model remains usable without inventing a catalog.

ACP now retains configuration options returned by new/load/resume, projects a select option categorized as `model`, applies changes with stable `session/set_config_option`, accepts `config_option_update`, and emits text deltas from `agent_message_chunk`. Sessions that do not advertise that option expose no choices.

Pho Code maps those catalogs into the existing composer picker, routes selection back to the owning backend, and projects external deltas into the existing runtime event. The live-run merge now prefers newer non-empty cumulative snapshots while preserving current text/work only when an incoming same-run snapshot is empty. The transcript shows Working before substantive text and attaches the caret only after non-whitespace output exists.

Codex behavior follows the [official OpenAI App Server documentation](https://developers.openai.com/codex/app-server), which defines `model/list`, per-turn model overrides, streamed agent-message deltas, and completed items as the final state. ACP behavior is derived from the installed exact `@agentclientprotocol/sdk` `1.4.0` stable typings rather than draft v2 APIs.

## Verification

- Focused Codex/ACP/host, Pho Code protocol/runtime, and UI tests: 60 passed.
- Root `bun run typecheck`: passed across all Pho Agent and Pho Code packages.
- Root `bun run lint`: passed with no errors and 9 pre-existing React hook warnings.
- Root `bun run build`: passed.
- Rebuilt focused Electron composer/backend test: 1 passed. This covers the backend/model-picker host surface, not a provider-backed external stream.
- Outer and submodule `git diff --check`: passed.
- Real Claude ACP/provider and packaged external-command verification remain unavailable in this environment.

## Handoff

Owner verification should confirm that a real Codex session lists installed models, accepts a model change for the next turn, and visibly advances multiple text chunks. Claude requires an installed compatible `claude-agent-acp` command and provider credentials.
