# Markdown and LaTeX rendering study for Phase 6

- Status: Research decision recorded; visual math engine requires qualification
- Audit date: 2026-07-17
- Local component evidence: `refs/gpui-component` at `b004e595cf5de98a73b6b561394a559a94ae1e2a`
- Consumer: [Chat rendering contract](../architecture/gpui-workbench.md#markdown-rendering-contract)

## Question

How should Pho Code render provider-authored Markdown with inline and block LaTeX in a native GPUI transcript while remaining offline, source-preserving, bounded, cancellable, selectable, accessible, and independent from view-owned processes?

## Decision

Phase 6 uses a coordinator-owned Markdown/math preparation boundary and preserves canonical Markdown/TeX unchanged. Plain source fallback is a complete supported outcome for every formula. The first visual-engine spike evaluates the pure-Rust `katex-rs` crate with a restricted GPUI adapter and packaged compatible fonts. The crate is not an accepted dependency until the adapter passes visual, baseline, source-copy, accessibility, security, latency, packaging, license, advisory, and supported-macOS gates.

If that spike fails, Phase 6 ships literal source fallback for math rather than adopting an unsafe or visually misleading renderer. A packaged MathJax worker remains a future explicit option and cannot be hidden inside GPUI rendering.

## Verified local evidence

The audited `gpui-component` TextView supports Markdown, text selection, scrolling, code-block actions, and custom block plugins. Its GFM parse options do not enable the Markdown crate's math nodes by default, and custom inline plugins are unsupported at the audited revision. The story therefore scans paragraphs manually for `$…$`/`$$…$$` and represents a mixed inline paragraph as one custom block.

Custom math nodes are not fully integrated into TextView's selected-text path, so a visible formula cannot rely on upstream selection/copy behavior. Pho Code must provide transcript-level copy from canonical source and qualify any richer selection adapter separately.

The story's MathJax path calls `Command::new("node").output()` synchronously, locates `mathjax-full` in a developer-relative `docs/node_modules` directory, supplies source through environment variables, sets no process deadline or output cap, and caches results in an unbounded `HashMap`. It renders generated SVG as an image and centers inline images rather than supplying TeX baseline metrics. Tests skip visual cases when the development dependency is absent. This is useful evidence, not a production implementation.

## Candidate comparison

| Candidate | Strengths | Blocking costs/risks | Phase 6 result |
| --- | --- | --- | --- |
| `katex-rs` 0.2.4 | Pure Rust default path; MIT; parses KaTeX-compatible input into HTML/MathML-like DOM; explicit trust, expansion, and size options | Not a GPUI renderer; CSS/class layout adapter required; complete font files are not bundled; only portions are SVG; baseline/copy/accessibility need custom work | First qualification candidate, not yet accepted |
| Upstream story's Node/MathJax | Demonstrates delimiter parsing and high-quality SVG | Synchronous process in render path, developer `node_modules`, environment transport, no timeout/output/cancel bounds, unbounded cache, poor inline baseline/copy | Rejected unchanged |
| Packaged MathJax worker | Strong TeX coverage and self-contained SVG output | Adds vendored JavaScript/assets, process/IPC supervision, SVG sanitization, glyph-path copy limitation, packaging and shutdown complexity | Future explicit fallback experiment |
| Older `katex`/QuickJS crates | Familiar KaTeX HTML/CSS output | Embedded JavaScript runtime plus browser-like layout gap; weak fit for native GPUI | Rejected for Phase 6 |
| Typst library | Native Rust, Apache-2.0, renderable output | Typst math syntax and semantics are not LaTeX; translation would be incomplete/misleading | Rejected for LaTeX requirement |
| Tectonic | Real TeX engine, MIT, deterministic bundle model | PDF-oriented, heavy native/bundle graph, no inline text baseline model | Rejected for chat rendering |
| WebView | Mature HTML/MathML/KaTeX layout and accessibility | Adds web focus, selection, active-content, IPC, styling, and lifecycle surface inside native transcript | Rejected for V1 |

Primary external references are the [KaTeX API](https://katex.org/docs/api), [KaTeX options](https://katex.org/docs/options), [MathJax SVG output](https://docs.mathjax.org/en/latest/output/svg.html), [Typst embedding](https://typst.app/open-source), and [Tectonic](https://tectonic-typesetting.github.io/en-US/). These describe upstream capabilities; only recorded Pho Code qualification can make a candidate supported.

## Renderer boundary

The architecture defines immutable source-bearing render requests and generation-checked results. Markdown parsing and math work occur off the GPUI render path. Views render typed safe blocks and local assets, dispatch retry/source-reveal actions, and never receive process, filesystem, network, or renderer handles.

Every `MathRun` retains source and display kind beside its pending/rendered/fallback state. Copy/select-all uses canonical Markdown, so generated SVG/paths, inaccessible images, component selection gaps, or cache eviction cannot corrupt copied content.

Only closed delimiters enter the renderer. Incomplete streaming delimiters remain literal. A source, session, theme, font, scale, or renderer-version change increments the generation; late results are discarded.

## Security profile

The renderer is configured with trust disabled, finite macro expansion/size limits, an explicit supported-command policy, and no URL/file/package loader. It rejects or falls back for `\includegraphics`, `\href`/URL-bearing output outside the allowed subset, `\html*`, `\require`, file access, active content, and unbounded macro expansion.

If an intermediate SVG path is ever qualified, Pho Code accepts only bounded dimensions/bytes and a strict element/attribute subset. Scripts, external references, events, foreign objects, stylesheets, filters, animation, remote fonts, and URL paint servers are rejected before GPUI sees the asset.

Renderer errors are data, not panics. A dependency panic boundary is still required around untrusted formulas until the selected engine's behavior has been proven. One formula failure cannot fail the surrounding Markdown document or turn.

## `katex-rs` qualification spike

The spike is deliberately separate from the production dependency graph. It must:

1. Pin the exact crate revision/version and record its full feature, transitive, license, advisory, binary-size, and macOS build graph.
2. Package and register the required KaTeX-compatible fonts or explicitly document a qualified font substitution; font metrics without font files are insufficient.
3. Map only the required KaTeX DOM/style subset into GPUI text/path elements with inline ascent/descent/baseline metrics and block centering.
4. Set trust false, finite expansion/size settings, strict error behavior, and all architecture bounds explicitly rather than inheriting upstream defaults.
5. Preserve original TeX delimiters/source for copy, selection fallback, accessibility, cache keys, and diagnostics.
6. Compare a small golden corpus against an offline MathJax 3 reference for semantic and visual errors without making MathJax a runtime dependency.
7. Exercise cancellation, deadline, output/dimension limits, queue saturation, cache eviction, generation invalidation, theme/scale changes, and panic/error containment.

The acceptance threshold is not "renders some formulas." Inline baselines must be stable across wrapping and scale; block formulas must remain legible in light, dark, and high-contrast themes; unsupported input must fall back honestly; copy must reproduce source; and no renderer path may access network, workspace files, arbitrary fonts, environment values, or child processes.

## Corpus

The corpus includes ordinary inline variables, exponents, fractions, roots, sums, integrals, accents, operators, matrices, cases, aligned multiline equations, long formulas, Unicode text, and surrounding punctuation. Delimiter cases cover `$…$`, `\(…\)`, `$$…$$`, `\[…\]`, escaped dollars, currency, code spans/fences, adjacent formulas, nested braces, and unclosed input.

Adversarial cases include oversized source, thousands of formulas, deep groups, recursive or explosive macros, undefined commands, dangerous URL/file/HTML/package commands, extreme requested dimensions, malformed intermediate nodes/assets, renderer deadline, cancellation, worker failure, and stale generation completion.

Native review covers 1x/2x scale, narrow/wide wrapping, baseline against surrounding glyphs, block centering, selection, copy, VoiceOver text, missing fonts, theme switching, cache invalidation, and long reconstructed transcripts. Source fallback must remain usable in every case.

## Revisit conditions

Promote a visual engine only with recorded qualification evidence. Revisit a packaged MathJax worker if the native adapter fails but visual math is required for the personal release; that path needs a separate architecture update for vendoring, IPC, process supervision, sanitization, cancellation, restart, and shutdown. Do not weaken source fallback or render-path isolation to meet schedule.
