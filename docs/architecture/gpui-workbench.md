# GPUI workbench architecture

- Status: Normative V1 architecture; released in 0.1.0 with deferred qualification in V2 Phase 6B
- Governing decision: [ADR 0004](../decisions/0004-native-workbench-phase-6.md)
- Shared runtime: [Native harness system](native-harness-system.md)
- Component contracts: [DeepSeek backend](deepseek-api-backend.md), [tools](tools.md), and [sessions](sessions.md)
- Delivery: [Phase 6](../implementation/v1/phase-6/README.md)
- Native lifecycle: [Native workbench lifecycle](native-workbench-lifecycle.md)

## Document role

This document owns the native workbench's whole-system composition, presentation state, typed interaction boundary, chat execution trace, Markdown/LaTeX rendering, activity, composer, and approval interaction. The [native lifecycle](native-workbench-lifecycle.md), [workspace inspection](workbench-workspaces.md), and [user terminal](user-terminal.md) documents own their narrower contracts.

It does not redefine backend transport, agent/tool continuation, exact-effect approval, session durability, or crash recovery. When this document and a component contract overlap, the component contract owns canonical behavior and this document owns only its native projection and interaction.

## Outcome and retained limits

The user can register personal workspaces, select or resume a durable chat, supervise one DeepSeek coding turn, inspect files and uncommitted changes, and operate a local terminal without leaving one native macOS window. Every visible agent lifecycle boundary remains traceable to canonical runtime/session state.

V1 still has one supported real backend, one selected agent workspace/session, one active root turn, one backend stream, one active agent tool, and sequential agent tool execution. Open tabs retain view state and reconstructed session projections; they are not concurrent agent owners. The user terminal may have its own child processes because it is a separate user-operated service, not another agent turn.

## Shell composition

The default window is a four-region horizontal composition with a vertical split inside the inspection region:

```text
Workspaces/chats | Chat execution trace | File/diff viewer | File tree
                                      \_ User terminal _/
```

The navigation sidebar begins near 300 logical pixels and the file tree near 250 logical pixels. The chat and inspection columns share remaining width. Exact minimum, preferred, and restored sizes belong to a versioned layout profile qualified against the supported display class; widths in the visual reference are starting values rather than hard guarantees.

The left and right regions may collapse. The file viewer and terminal may resize vertically, and each content region may own tabs. Phase 6 uses a fixed application composition with bounded resizable groups rather than exposing arbitrary user-created panels or a public docking registry. UI-only size/collapse preferences are stored separately from sessions and never enter model context or the canonical journal.

## Ownership and dependency direction

The native workbench is split into four layers:

1. Canonical agent state and records remain owned by the existing reducer, coordinator, tool runtime, and session store.
2. Workbench application services own registered-workspace metadata, file/tree snapshots, Git projections, render preparation, and PTY lifecycle through typed operations and bounded channels.
3. A rebuildable `WorkbenchProjection` combines selected canonical agent state with workbench-service results for presentation.
4. GPUI views own only focus, hover, selection, scroll anchors, open tab order, pane geometry, and rendering of the current projection.

The dependency direction is one way:

```text
GPUI gesture
  -> WorkbenchIntent
  -> application reducer/coordinator or workbench service
  -> typed event
  -> WorkbenchProjection
  -> GPUI render
```

A view cannot open a directory, read a file, invoke Git, start or signal a process, parse a journal, access Keychain, construct a tool result, or call a backend. Component stories that perform those operations are source examples only and cannot be copied as application architecture.

## Workbench identity and selection

The shell adds a stable preference-only `WorkspaceRegistrationId` while preserving existing opaque `WorkspaceId`, `SessionId`, `TurnId`, `ItemId`, `ToolCallId`, `ApprovalId`, and `ArtifactId` values. A registration identifies a sidebar entry; the existing `WorkspaceId` remains durable session/turn/tool authority. View rows and tabs use those identities or a typed composite identity; display order, paths, and titles are never substituted for domain identity. The exact mapping and generation rules live in [workspace inspection](workbench-workspaces.md#identity-boundary).

Registered workspaces are application preferences pointing to canonical workspace-opening operations. They do not grant model or tool authority merely by appearing in the sidebar. A selected workspace must pass the existing canonicalization, retained-directory identity, containment, and search-generation rules before it becomes available for agent operations.

Selecting a session selects its qualified workspace and DeepSeek profile as one operation. If another turn, approval, or tool is active, the reducer refuses the switch unless an explicit cancel-and-switch sequence first reaches an authoritative terminal state. A UI selection highlight is never proof that runtime ownership moved.

Chat tabs contain durable or reconstructed sessions for the selected workspace. Only the selected tab can send a prompt. Closing a tab removes presentation state but does not delete its session. Session deletion is not introduced by Phase 6.

## Representative design: chat execution trace

### Projection model

The chat pane presents an execution trace rather than flattening history into alternating bubbles. A `TranscriptProjection` contains stable rows derived from canonical items plus explicitly ephemeral streaming rows:

```text
TranscriptProjection
  session_header
  rows: [TranscriptRow]
  activity
  composer
  footer

TranscriptRow
  UserMessage
  AssistantText
  ProviderReasoning
  ToolCall
  Approval
  ToolResult
  Usage
  TurnStatus
  Diagnostic
```

An `AssistantPhase` remains the canonical owner of its optional text, provider-returned reasoning, and ordered completed tool calls even when the projection renders them as adjacent rows. Each child row retains the parent phase identity. Reordering, filtering, or virtualization cannot break call/result pairing or make a delta more authoritative than the completed phase.

Streaming text and reasoning are ephemeral projections keyed by the active request and generation. On authoritative assistant-phase completion, the reducer replaces those rows with immutable canonical children. On failure, cancellation, interruption, or uncertain termination, non-durable deltas remain visibly provisional or are removed according to the canonical runtime event; they are never promoted to a completed assistant message.

### Row behavior

User text renders as literal selectable text with whitespace preserved and no Markdown interpretation. Assistant text uses the bounded Markdown pipeline below. Provider-returned reasoning is labeled with its reported origin, collapsed by default, excluded from automatic previews, and revealed only through an explicit local view action. Its collapsed state is UI preference, not a session mutation.

A tool call and its result appear as one structured lifecycle group while retaining their separate canonical identities. Read/search rows summarize bounded structured details. Patch rows show the canonical diff/effect preview, truncation, stale state, per-file outcomes, and artifact references. Shell rows show the exact command, working directory, timeout, unrestricted-account warning, exit state, duration, output previews, truncation, and artifacts.

An approval row is rendered from the live `ApprovalId`, `ToolCallId`, complete validated effect digest, and canonical preview. `ApproveOnce` and `Deny` dispatch typed decisions carrying the live identities; the view cannot synthesize success or reuse a stale row. A truncated preview clearly links to bounded details while the decision remains bound to the complete digest rather than the visible subset.

Usage and estimated cost attach to the owning turn and preserve qualification/pricing dates. Terminal turn state always has a distinct visible row for completed, failed, cancelled, interrupted, or uncertain. Diagnostics expose safe structured recovery context without prompts, reasoning, file bodies, command output, credentials, headers, account data, or personal absolute paths.

### Virtualization and scroll anchoring

The transcript virtualizes rows by stable identity rather than by current index. Only visible rows plus a bounded overscan window own GPUI elements. Row height measurements are cached by row identity, content generation, available width, font profile, scale, theme revision, and renderer revision; any changed key invalidates that measurement.

The projection retains canonical row metadata independently from rendered elements. Evicting an off-screen Markdown document or math asset cannot evict the session item or change reconstruction. Per-row render caches and the global math cache use explicit byte and entry limits with least-recently-used eviction.

Auto-follow remains enabled only while the user's viewport is anchored to the end within a small threshold. New deltas then keep the active row visible. If the user scrolls away, the viewport remains stable and a `new activity` control returns to the end. Completion, approval, and terminal events cannot forcibly steal scroll position or focus.

High-frequency deltas are coalesced before projection/view invalidation with a maximum presentation refresh rate. Completed phases, approvals, tool results, failures, and terminal states bypass ordinary visual coalescing and are never dropped. Queue saturation fails the owning presentation handoff visibly according to the shared runtime contract.

## Markdown rendering contract

### Source preservation

Canonical assistant text is stored and reconstructed unchanged. Rich rendering is a disposable derivative. Every assistant row retains access to its original Markdown source for copy, accessibility, diagnostics, fallback, and renderer-version changes.

During streaming, incomplete source is rendered as literal selectable text. A renderer may promote only a syntactically closed stable prefix to rich blocks; an open fence, link, table, HTML-like sequence, or math delimiter remains literal until closed. On authoritative completion, the entire canonical item is parsed into an immutable rich-document generation. This avoids executing partial syntax and prevents repeated whole-document parsing on every token.

### Supported subset

The initial subset includes paragraphs, headings, emphasis, strikethrough, ordered and unordered lists, block quotes, horizontal rules, tables, inline code, fenced code blocks, and explicitly qualified math delimiters. Fenced code displays its language label and a copy control; it has no run control in V1.

Raw HTML, MDX/JSX, scripts, style, iframes, embedded web content, remote images, data-URI images, and automatic URL fetching are disabled. Image syntax renders bounded alt text and a disabled-content marker. Parsing extensions are allowlisted rather than inherited wholesale from an upstream `GFM` convenience profile.

Links never activate during layout or hover. A workspace-relative link may dispatch a typed contained-file-open intent after validation. An `https` link may open only after an explicit click and scheme/origin preview through the application link handler. Other schemes render as text unless separately designed. The Markdown component cannot call `open_url` directly for untrusted provider content.

### Render preparation boundary

Markdown and math preparation use a coordinator-owned bounded service rather than work inside GPUI render methods:

```text
RenderRequest
  session_id
  item_id
  generation
  source
  theme_revision
  scale

RenderResult
  session_id
  item_id
  generation
  blocks
  diagnostics
  source_bytes
  rendered_bytes
```

The parser emits typed safe blocks. A result is accepted only when its session, item, and generation still match the projection. Session switches, source replacement, theme/font changes, or cancellation increment the generation; late results are discarded without altering canonical content.

The initial `ChatRenderLimits` profile caps rich Markdown at 512 KiB per assistant item and 4,096 parsed blocks. Larger canonical items remain inspectable through paged literal text and a visible `rich rendering skipped at limit` diagnostic. The profile caps 256 math runs per item, 16 KiB of source per formula, 256 KiB of generated asset data per formula, a 4,096 by 1,024 logical-pixel asset box, eight queued formula jobs, 512 cached formulas, and 64 MiB of formula cache data. These are presentation limits, not permission to truncate canonical session content.

## LaTeX/math contract

Phase 6 recognizes closed block delimiters `$$…$$` and `\[…\]`, and closed inline delimiters `$…$` and `\(…\)` under an explicit scanner that respects escapes, code spans/fences, and malformed/unclosed input. Currency-like single-dollar text and ambiguous delimiters remain literal. The qualification corpus, not an informal regex, owns exact edge behavior.

A parsed formula becomes a source-bearing `MathRun`:

```text
MathRun
  source
  display: Inline | Block
  state: Pending | Rendered | Fallback
  accessible_text
  rendered_asset?
  metrics?
  diagnostic?
```

The renderer receives formula source only. It has no workspace handle, network client, process authority, environment inheritance, file loader, or URL resolver. Trust/active commands, remote resources, file inclusion, HTML injection, and dynamic package loading are disabled. Expansion depth, output bytes, dimensions, queue length, time, and cache are bounded.

Inline output must supply baseline/ascent/descent metrics rather than relying on vertically centered image layout. Generated HTML, MathML, SVG, or another intermediate format is never passed directly to a web engine as trusted content; an adapter converts only the reviewed node/paint subset into GPUI elements or a sanitized local asset. Formula output preserves the original source for selection and copy because generated paths or images are not text.

The default copy action for an assistant row copies original Markdown. A future rendered-text copy mode may convert math to its original TeX delimiters, never to generated SVG markup. Screen-reader text announces `inline formula` or `display formula` followed by bounded source when no richer accessible representation has been qualified.

Invalid, unsupported, timed-out, cancelled, oversized, or failed math displays its original delimiters/source with a small local fallback marker. A formula failure cannot blank the paragraph, fail the assistant row, fail the turn, or poison other cache entries.

The production visual engine remains behind a qualification gate. The first spike evaluates an in-process Rust KaTeX-compatible parser/adapter with packaged fonts and explicit safe options. If it cannot meet layout, baseline, selection, copy, accessibility, dependency, and latency criteria, Phase 6 ships the source fallback rather than silently adopting the upstream development-only Node/MathJax story. An external MathJax worker is a future explicit compatibility design, not the default hidden implementation.

## Activity and busy-state language

The status line above the composer is a projection of stable semantic activity, optionally rendered through a product-voice verb lexicon:

| Semantic activity | Truth source | Example visible verb |
| --- | --- | --- |
| Preparing | accepted turn state | Preparing… |
| RequestingModel or StreamingModel | active backend request | Thinking… or Shimmying… |
| AwaitingApproval | live approval identity | Waiting for approval |
| RunningTool | active tool identity and kind | Reading…, Patching…, or Running… |
| ContinuingModel | accepted continuation state | Continuing… |
| Cancelling | cancellation requested, not yet terminal | Cancelling… |
| Idle | no active owner | no busy label |

The lexicon is a presentation table keyed by semantic state and optional tool kind. It is deterministic for the current operation, bounded, localizable, and testable. It cannot invent a tool name, imply approval, or show success before a terminal event. Accessibility labels and diagnostics use the semantic activity value even when the visible product voice is playful.

## Composer and send/cancel interaction

The composer is a controlled multiline input with a bounded UTF-8 byte count. It retains an unsent draft per open session in UI preference state; drafts are not session records, model context, or proof that a turn began. A sent prompt enters the canonical session only through `SendPrompt` and the durability ordering owned by sessions.

`Enter` sends only when input-method composition is inactive and the configured desktop send binding applies; `Shift+Enter` inserts a newline. A visible send button exposes the same typed intent. Empty or over-limit input cannot dispatch. The composer becomes non-sending while another turn is active, but remains selectable and may retain a draft.

The send control becomes cancel only while the selected session owns the active turn. Cancellation dispatches the existing typed intent and changes the status to `Cancelling…`; it does not optimistically mark the turn cancelled. Approval buttons remain independently focusable and cannot be triggered by the composer send shortcut.

Focus returns to the composer after an ordinary completed turn only when focus was already within the chat pane and no approval, dialog, menu, selection, or accessibility interaction owns focus. Stream updates never steal focus.

## Session header and footer

The compact session header shows only qualified or local projection facts: DeepSeek backend label, model, thinking mode, reasoning effort, profile/instruction revision when useful for diagnostics, session state, and a privacy-safe workspace display name. It does not display provider claims that were not qualified or a personal absolute path by default.

The footer shows the current model, workspace display name, Git branch projection, context state, and selected terminal/user-workspace status when available. Every field has an unavailable/stale/error state; absence is not rendered as a guessed value.

## Failure and degradation behavior

- Markdown parse failure renders the full bounded literal source and a safe diagnostic.
- Rich-render limit exhaustion renders paged literal source without truncating the canonical record.
- Math parse/render failure falls back per formula and leaves surrounding Markdown intact.
- Render-queue saturation keeps source visible and offers a retry after capacity returns; it does not block canonical event consumption.
- A stale render generation, workspace generation, session selection, or theme result is discarded.
- Component panic paths must be removed or isolated before production use; view code contains no `unwrap` on provider/session content.
- Missing fonts or assets fail the math/component qualification gate and use source/plain controls rather than invisible output.
- Link or image policy violations render inert source/alt text and never contact a remote host.
- Window close while rendering cancels render jobs, then follows the shared application shutdown order; renderer cancellation is not agent-turn cancellation unless shutdown explicitly requests both.

## Representative verification corpus

The transcript design is not accepted by screenshots alone. Tests feed canonical event fixtures through the same workbench projection used by GPUI and assert stable identities, assistant-phase grouping, approval binding, semantic activity, terminal state, and source preservation.

The Markdown corpus covers nested lists, tables, block quotes, long paragraphs, Unicode/grapheme boundaries, escaped markup, incomplete streaming fences, very large items, code languages, raw HTML/MDX, links, images, malformed syntax, and copy output. Security fixtures prove no parse/layout path initiates network, filesystem, process, Keychain, journal, or tool work.

The math corpus covers inline and block delimiters, fractions, roots, sums, integrals, matrices, aligned multiline expressions, operators, spacing, Unicode, escaped dollars, currency, code spans/fences, unclosed delimiters, unsupported commands, expansion attacks, oversized formulas, extreme dimensions, many-formula messages, timeout, cancellation, stale generations, theme/scale changes, and cache eviction. Visual review covers light/dark and high-contrast themes, 1x/2x scale, inline baseline, wrapping, block centering, selection, original-source copy, and fallback legibility.

Transcript stress fixtures cover at least the maximum listed session count, long reconstructed histories, rapid one-byte deltas, tool/approval transitions, user scroll-away, resize invalidation, collapsed reasoning, render saturation, and terminal events delivered while ordinary deltas are coalesced. Native L4 review verifies keyboard traversal, focus visibility, screen-reader labels, long approval previews, and no focus/scroll theft.

## Linked pane contracts

Registered workspace/session switching, the session catalog, file tree, read-only text/diff viewer, and Git projections are specified in [workspace inspection](workbench-workspaces.md). PTY creation, terminal emulation, input/output flow control, process groups, resize, exit, and shutdown are specified in [user terminal](user-terminal.md). Native entry, startup/auth states, preferences, layout constraints, focus, accessibility, theme/assets, and application shutdown are specified in [native workbench lifecycle](native-workbench-lifecycle.md).

All three preserve the generation-checked application-service boundary used by chat rendering. A pane may degrade independently, but none may retarget canonical agent work, grant approval, or make a local snapshot authoritative over the session/tool runtime.
