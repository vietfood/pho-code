# Phase 0: Foundation

- Status: PASS — 2026-07-14 ([evidence](../evidence/phase-0-2026-07-14.md))
- Depends on: Accepted documentation boundary
- Produces: Reproducible application and headless-test foundation
- Historical next: [Phase 1](phase-1-chatgpt-codex-qualification.md), which stopped and froze
- Current successor: [Phase 1B](phase-1b-deepseek-api-qualification.md)

## Required reading

1. [ADR 0002](../../decisions/0002-native-agent-harness.md)
2. [Native harness system](../../architecture/native-harness-system.md)
3. [Contributor instructions](../../../AGENTS.md)

## Outcome

The repository builds a minimal GPUI application and a headless test target around the module boundaries defined by the system architecture. Dependencies are pinned and justified, long-running work stays off render paths, and later phases have deterministic substitutes for network, credentials, time, files, and processes.

## Work

### Reproducible dependency foundation

- Keep one Rust package; do not create a workspace or plugin framework.
- Pin every Git dependency to a reviewed revision, including the current `gpui`, `gpui_platform`, and `gpui-component` entries.
- Add only dependencies needed by this phase or immediately by Phase 1.
- Record direct dependency purpose, version, enabled features, and license.
- Establish one application-owned Tokio runtime for network, timers, process supervision, and bounded blocking adapters; do not create a runtime per operation.
- Centralize queue, buffer, and blocking-semaphore limits in one runtime configuration module.
- Inspect `cargo tree -e features` after dependency changes and reject an unnecessary second async or TLS stack.

Expected Phase 0/1 dependency categories are serialization, concrete errors, Tokio, streamed HTTP, cancellation, URL/PKCE primitives, secret wrappers, Apple-native Keychain access, identifiers/time, and test fixtures. Exact crate choices remain implementation evidence unless ADR 0002 already fixes them.

### Module skeleton

- Create the module dependency direction documented in [the system architecture](../../architecture/native-harness-system.md#module-boundaries).
- Define opaque local identity types and redacted error context.
- Define application intents, runtime events, placeholder state, and a deterministic reducer.
- Define the narrow backend streaming interface plus an empty `ScriptedBackend` implementation.
- Define crate-private clock, credential-store, and session-store test seams.
- Open a minimal GPUI window and surface startup failure rather than printing it only to stderr.

### Test infrastructure

- Add reducer tests for valid transitions, duplicate terminal events, late deltas, and stale approval identities.
- Add a loopback HTTP/SSE test helper capable of deterministic byte fragmentation, delayed frames, malformed frames, and disconnects.
- Add temporary-workspace and deterministic child-process fixtures for later tool phases.
- Add log-capture assertions using seeded secret markers.
- Document opt-in live-test requirements without accepting credentials on command lines.

### Documentation cleanup

- Keep current architecture and implementation links valid.
- Ensure historical app-server documents remain clearly non-normative.
- Remove stale assignments of current V1 authentication, tools, persistence, compaction, or subagents to Codex while preserving the explicit historical banners on ADR 0001 evidence.
- Add `tests/doc_links.rs`, a standard-library-only local Markdown target/heading validator covering `AGENTS.md` and `docs/**`; it ignores external URLs and treats source `#L...` fragments as file-existence checks.

## Non-goals

- Real OAuth, Keychain credentials, or network requests.
- A complete agent loop or tool implementation.
- A provider registry, settings framework, session database, or production UI.

## Required checks

Run the repository baseline in [AGENTS.md](../../../AGENTS.md#build-and-test-workflow), plus `cargo tree -e features` after dependency changes and `cargo test --test doc_links` after moving documentation.

## Gate

Phase 0 passes when the supported macOS development environment builds the GPUI scaffold, the headless scripted test target runs without GPUI interaction, dependency revisions and features are reproducible, no actor performs work from a render path, and current documents route to ADR 0002 plus the native system/backend/tools/sessions contracts while the ADR 0001 corpus remains explicitly historical.
