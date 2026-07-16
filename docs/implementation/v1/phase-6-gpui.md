# Phase 6: Native GPUI personal V1

- Status: Ready
- Depends on: [Phase 5](phase-5-sessions.md)
- Produces: Usable macOS V1
- Future: [V2 roadmap](../v2/README.md)

## Required reading

1. [Presentation adapters and lifecycle](../../architecture/native-harness-system.md#presentation-adapters-and-application-lifecycle)
2. [DeepSeek diagnostics and privacy](../../architecture/deepseek-api-backend.md#error-taxonomy)
3. [Tool approval model](../../architecture/tools.md#approval-model)
4. [Session recovery](../../architecture/sessions.md#startup-recovery)

## Outcome

The verified `pho` command harness gains a coherent native macOS adapter without moving credential, network, tool, process, or persistence ownership into GPUI views. Phase 6 is presentation integration over the Phase 5 runtime, not a second implementation of product behavior.

## Work

- Build the workspace/session header, DeepSeek credential/model profile state, virtualized execution trace, composer, send/cancel controls, approval surface, usage/estimated-cost display, output/artifact detail, and failure/recovery state.
- Render provider-returned reasoning using its reported kind, collapsed by default; preserve its assistant-phase grouping without presenting replay metadata or withheld content as visible reasoning.
- Show the canonical bounded patch diff/effect summary with explicit truncation, or the exact shell command, working directory, timeout, and safety limitation, before approval. Bind the decision to the complete validated effect digest rather than only the visible preview.
- Make stale approvals harmless through identity/effect validation.
- Coalesce high-frequency deltas before view invalidation without dropping completed or terminal events.
- Support secure API-key install/replace, status, logout, workspace selection, session create/resume, cancellation, offline session inspection, context-limit/cannot-replay state, and compatibility diagnostics.
- Drive the same typed application intents as `pho`; fix missing behavior in the shared reducer/coordinator/runtime rather than calling the command executable or adding view-owned work.
- Add parity scenarios that feed equivalent user decisions through command and GPUI adapters and compare the resulting canonical records, approval identities, usage, and terminal states.
- Keep file tree, editor, PTY, extension marketplace, model marketplace, compaction controls, and agent tree out of V1.
- Add redacted diagnostic export only with a user-reviewed preview.

## Native scenario matrix

Exercise on the supported macOS version and architecture:

- first launch, cancelled API-key input, successful install/validation, restart reuse, invalid replacement preserving the prior key, logout, and replacement;
- second-instance rejection before Keychain access;
- workspace open and search-index readiness;
- text, provider reasoning, usage/estimated cost, search/read, patch approve/deny/stale, shell approve/deny/nonzero/large-output/timeout/cancel;
- window close during stream, approval, patch preflight, and shell execution;
- controlled crash and restart into interrupted/uncertain state;
- near-context and cannot-fit behavior;
- offline session inspection, cannot-replay state, insufficient balance, and backend incompatibility;
- command/GPUI parity for one text turn, one tool continuation, approval/denial, cancellation, restart reconstruction, and terminal failure.

Visually inspect approval focus and keyboard navigation, long command and diff previews, reasoning, errors, truncation labels, general focus order, resizing, virtualization, and supported theme contrast.

## Personal release gate

- Create or update a root `README.md` as the user-facing build/run, storage, compatibility, security-limit, and recovery guide; keep `docs/README.md` focused on design and evidence routing.
- Record the DeepSeek qualification, pricing-observation, and provider-policy review dates plus model/thinking profile.
- Inspect dependency licenses and advisories with the configured tooling.
- Inspect the release binary, logs, fixtures, and diagnostics for captured credentials or live content.
- Exercise a clean account/workspace setup rather than only the development machine's existing state.

Signing, notarization, automatic updates, public distribution support, and other operating systems are not V1 acceptance requirements.

## Gate

V1 passes when all earlier phase gates remain green, the native scenario and command/GPUI parity matrices pass, restart reconstructs the canonical trace, approvals and uncertainty are understandable in both adapters, documented limits match behavior, and the maintainer can complete the same supervised real coding task through `pho` and GPUI without divergent runtime semantics.
