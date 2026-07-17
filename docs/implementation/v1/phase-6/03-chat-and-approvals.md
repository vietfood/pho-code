# Phase 6.3: Chat, Markdown/math, and approvals

- Status: Pending Phase 6.2
- Depends on: [Phase 6.2](02-workbench-state.md)
- Architecture: [GPUI chat execution trace](../../../architecture/gpui-workbench.md#representative-design-chat-execution-trace)
- Research: [Markdown and LaTeX study](../../../research/markdown-latex-rendering.md)
- Next: [Phase 6.4 workspace inspection](04-workspace-inspection.md)

## Outcome

The selected chat tab renders a virtualized canonical execution trace with safe Markdown/LaTeX, grouped assistant phases and tools, live exact-effect approvals, semantic activity/product verbs, usage/cost, recovery states, and a bounded multiline send/cancel composer. It remains semantically equivalent to command rendering.

## Work

1. Implement `TranscriptProjection` from canonical/reconstructed events with stable row identities and immutable assistant-phase grouping.
2. Implement virtualization, measured-row cache keys, scroll anchoring, delta coalescing, terminal-event priority, and visible saturation/fallback behavior.
3. Implement the bounded Markdown scanner/parser and safe-block adapter: no raw HTML/MDX, remote images, automatic fetch/open, active content, or executable code controls.
4. Run the KaTeX-compatible qualification spike with packaged fonts and GPUI-native output. Accept it only after baseline, wrapping, source copy, accessibility, security, deadline, cancellation, cache, license, advisory, and packaging gates. Preserve literal source fallback for every failure.
5. Implement the render service, generations, exact limits, per-formula fallback, source-copy behavior, link/file intents, and cache eviction.
6. Implement tool/approval lifecycle rows bound to live IDs/effect digests, reasoning collapse, activity lexicon, session header/footer, composer draft/send/cancel, and focus rules.
7. Compare GPUI and command projections from identical canonical fixtures.

## Acceptance scenarios

- completed phases replace provisional deltas without losing text/reasoning/tool grouping;
- cancellation/failure/interruption/uncertainty never promotes provisional content;
- exact approval IDs/digests survive long/truncated previews and stale controls cannot decide;
- rapid one-byte deltas, long reconstructed histories, user scroll-away, resize/theme/font changes, and render saturation preserve focus/anchor and terminal truth;
- Markdown corpus covers nested/large/malformed/unclosed/adversarial input with inert links/images/HTML;
- math corpus covers delimiters, common notation, matrices/alignment, currency/code/escaping, attacks, limits, fallback, baseline, 1x/2x, themes, VoiceOver, and original-source copy;
- composer enforces bytes, IME-safe send, newline, one active turn, explicit cancellation, and draft isolation;
- raw provider/session content causes no panic and no filesystem/network/process/Keychain/journal operation during parsing/layout.

## Gate

Phase 6.3 passes when canonical parity, approval binding, transcript stress, Markdown security, render limits, keyboard/accessibility, and source preservation pass. If the visual math candidate fails, the documented literal TeX fallback remains safe and complete; promoting another engine requires a research/architecture update rather than an in-render process shortcut.
