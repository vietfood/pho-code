# Phase 6B: Complete native qualification

- Status: Ready after V1 `0.1.0`
- Depends on: [V1 release evidence](../evidence/phase-6-release-candidate-2026-07-17.md)
- Governing decision: [ADR 0005](../../decisions/0005-release-v1-and-defer-phase-6b.md)
- Preserved source gate: [V1 Phase 6](../v1/phase-6/README.md#deferred-original-phase-6-gate)

## Outcome

Close the native-workbench verification and interaction gaps deferred from V1 without expanding provider, agent, editor, or platform scope. Phase 6B is complete when the released architecture is fully qualified, not when new V2 features are added.

## Work

1. Rebuild from a clean cache and pass the complete serial repository suite, formatting, check, release build, clippy, documentation-link, dependency-feature, duplicate-version, license, and advisory checks.
2. Complete the native terminal tab surface for up to eight actor-managed terminals, including raw key input, paste/copy policy, local search, resize, flood/backpressure, close/restart, foreground descendants, shutdown, crash, and no-reattach behavior.
3. Build and run the command/native canonical-parity matrix for item identity, assistant-phase grouping, approvals/effect digests, tool results/artifacts/truncation, usage, terminal turn states, cancellation, and reconstruction.
4. Run the same clean-account supervised coding task through `pho` and the native workbench and compare sanitized canonical outcomes.
5. Complete keyboard-only traversal, modal focus return, IME composition, VoiceOver names/states, reduced motion, monochrome/high contrast, theme/scale, minimum/large display, off-screen restoration, lock contention, and supported-macOS scenarios.
6. Record clean/existing-state startup, first-window, restoration, shutdown, process cleanup, binary size, dependency sources/licenses/advisories, supported host matrix, and every remaining failure as dated evidence.

## Invariants

- V1 retains one DeepSeek backend, one selected workspace/session, one active root turn, sequential tools, exact approvals, and one shared command/native runtime.
- Phase 6B does not add compaction, subagents, another backend, writable editing, arbitrary endpoints, strong sandbox claims, portability, signing, notarization, or public distribution.
- Terminal input/output remains outside model context, approvals, sessions, artifacts, and diagnostics.
- Missing evidence is not a pass, and a host limitation is recorded rather than hidden.

## Gate

Phase 6B passes only when all work above has dated automated and native evidence, no known child process is falsely labeled or unreaped, the final full suite is green on the qualified host, and the V1 documentation no longer needs a verification caveat for the deferred matrix.
