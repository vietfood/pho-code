# ADR 0005: Release V1 and defer the remaining native qualification to Phase 6B

- Status: Accepted
- Decision date: 2026-07-17
- Scope: Pho Code V1 release boundary and deferred native work
- Decision owners: Pho Code maintainers
- Supersedes: [ADR 0004](0004-native-workbench-phase-6.md) only for its original all-or-nothing Phase 6 release gate
- Superseded by: Nothing

## Context

ADR 0004 expanded Phase 6 from a minimal native adapter into a four-pane coding workbench. The implementation now provides a useful local product: secure DeepSeek credentials, live chat and durable sessions, read-only workspace and Git inspection, a supervised terminal surface, bounded application state, and a packaged native app. That workflow was exercised on the supported Apple Silicon host and is suitable for the first independently owned release.

Several broader qualification requirements remain incomplete: the final clean rebuild/test rerun after cache removal, the complete multi-terminal-tab interaction surface, the command/native canonical-parity matrix, and the full VoiceOver/keyboard/IME/display/theme/supported-macOS scenario matrix. Keeping those requirements in the V1 release gate would leave an already usable first release indefinitely labeled as a candidate. Calling the original gate complete would erase real verification gaps.

## Decision

Pho Code releases V1 as version `0.1.0` with the behavior and limitations recorded in the [V1 release evidence](../implementation/evidence/phase-6-release-candidate-2026-07-17.md). The delivered native workflow becomes the V1 acceptance boundary.

The unfinished original Phase 6 criteria move intact to [V2 Phase 6B](../implementation/v2/phase-6b-native-completion.md). Phase 6B is the first V2 phase and must close those gaps before native compaction, subagents, a second backend, portability, or other product expansion begins.

This decision changes release scope, not implementation truth:

- the release evidence keeps the failed/unavailable checks visible;
- no missing accessibility, parity, terminal, or compatibility scenario is described as verified;
- the command and native adapters continue to share the same runtime and safety boundaries;
- the V1 app remains an unsigned, local, Apple Silicon personal release;
- V2 features cannot use Phase 6B deferral to weaken credential, approval, workspace, session, PTY, or recovery contracts.

## Consequences

- V1 can be tagged and used as the first local release without misrepresenting the original Phase 6 matrix.
- Phase 6 is complete under the revised V1 scope; the original strict-gate remainder is traceable under Phase 6B.
- Phase 6B precedes Phases 7–9 and is maintenance/qualification work, not a new product surface.
- Signing, notarization, automatic updates, public distribution, and non-Apple-Silicon qualification remain outside V1 and require later decisions.

## Rejected alternatives

### Mark the original Phase 6 gate as passed

Rejected because the final full-suite rerun, complete terminal surface, parity task, and accessibility/compatibility matrix did not pass.

### Keep V1 indefinitely in release-candidate state

Rejected because the observed personal workflow is coherent, packaged, security-bounded, and useful; the remaining work can be isolated without changing its runtime contracts.

### Drop the unfinished criteria

Rejected. Phase 6B preserves them as named V2 acceptance work with explicit ordering.
