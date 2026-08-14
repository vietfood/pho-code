# Feature documentation

## Purpose

Feature documents describe one owner-facing capability from product intent through runtime behavior, persistence, trust, failure handling, and verification. They are vertical slices across the existing architecture; they do not replace the canonical layer boundaries in [`architecture/overview.md`](../architecture/overview.md), executable-composition rules in [`extension-model.md`](../extension-model.md), or shipped-state summary in [`current-state.md`](../current-state.md).

Use a feature document when a capability has enough independent policy, lifecycle, provider behavior, or verification work that distributing its decisions across the roadmap and architecture documents would make the outcome hard to evaluate.

## Status vocabulary

Every feature document must identify its status without implying that planned behavior exists:

- **Current:** implemented and verified to the level stated in the document.
- **Proposed:** a product and technical design awaiting promotion into an implementation plan.
- **In implementation:** promoted with an approved plan, but not yet accepted.
- **Accepted:** implemented, verified, and reflected in `current-state.md`.
- **Deferred:** deliberately outside the active product boundary.

A document may contain both current and proposed sections. Each claim must make that distinction clear.

## Feature index

| Feature | Status | Owner outcome | Document |
| --- | --- | --- | --- |
| Compaction | Proposed; Pi-native automatic behavior exists today | Long conversations retain useful continuity, expose when context is summarized, and remain portable across supported providers | [`compaction.md`](./compaction.md) |

## First-wave queue

Research against Oh My Pi, OpenCode, and pinned Pi `0.84.1` (2026-08-14). These are candidates for feature documents, not an implementation plan and not a promise that every item ships before v3. Compaction stays first. Browser automation is deferred unless the owner later names a recurring authenticated-web task.

| Order | Feature | Why it is in the first wave | Depends on | Not the same as |
| --- | --- | --- | --- | --- |
| 1 | Compaction | Already proposed; long chats already compact silently | Pi `compact()` and session events | OpenAI-only server compaction |
| 2 | Session tree / fork / clone | Pi JSONL is already a tree; Pho Code currently walks one leaf | Compaction markers and archive/Trash identity | Subagents or worktrees |
| 3 | Plan mode and agent mode | Two primary modes, OpenCode-style: Plan is read-only analysis, Agent (Build) is the current write-capable session | Existing permission modes; optional session todo | A third “review” or “debug” mode; OMP vibe/advisor |
| 4 | Task and subagents | Owner-facing must-have: delegate scoped work, get a typed result, inspect/steer/kill children | Plan/agent modes; composite session ownership; a first change-review slice before isolated writes | Session fork; independent sidebar chats |
| 5 | LSP | Lets the agent use workspace diagnostics, rename, and references instead of grep-and-hope | A pinned auto-detect set (TypeScript first); no generic LSP settings editor | A second IDE/editor architecture |
| 6 | Change review | v3 write/edit control: what changed, grouped by chat, previewable undo | Composite session ownership | OMP `checkpoint`/`rewind` (those collapse conversation, not files) |
| 7 | Edit reliability | v3: fewer failed patches and stale-file writes | Change review, so bad applies are visible and reversible | Replacing Pi `read`/`edit` in the first slice |

Supporting pieces that should ride inside those documents rather than becoming their own first-wave features: session todo and structured `ask` inside plan mode; branch summaries inside tree/fork; context-composition explanation inside compaction; worktree isolation as a later subagent option, not the first spawn path.

### Persistent eval (deferred; what it is)

This is not a terminal and not `bash`. Oh My Pi’s `eval` tool keeps a **long-lived kernel** (Python and JavaScript by default; Ruby/Julia optional) so later tool calls reuse imports, variables, and plots. The agent writes a cell, the kernel runs it, state stays until reset or crash. OMP also lets that kernel call back into session tools (`read`, `task`, and others) over a loopback bridge, so Python can load a CSV through `tool.read` and JavaScript can chart it without leaving the cell.

Pho Code already has one-shot `bash`. Persistent eval would add process ownership, idle timeout, abort/reset, output size limits, and a permission story for a kernel that can re-enter tools. That is closer to Phase D than to compaction or plan mode, so it stays out of the first wave.

## Later exploration

Brief catalog of OMP/OpenCode capabilities that are real and worth a future feature document, but not in the first wave. Status is **Deferred** until the owner names an outcome. Items marked **out of philosophy** should not be explored as product features unless the standalone-manifest rules change.

### Coding depth

| Feature | What it is | Why later |
| --- | --- | --- |
| Isolated worktrees | Child agents edit a copy of the repo, then preview/merge | Subagent option after change review; not the first spawn path |
| `ast_grep` | Structural query over tree-sitter grammars | Overlaps edit reliability; only if hashline/Pi edit still fail |
| DAP debugger | Drive lldb / dlv / debugpy: breakpoints, frames, variables | High process-lifecycle cost; print-debugging covers most personal use |
| GitHub-as-filesystem | `read pr://…`, `grep` a diff like a directory | Milestone 4 already has read-only GitHub MCP; this is a nicer tool shape, not new access |
| Merge `conflict://` | One URL per conflict hunk; write `@theirs` / `@ours` | Natural follow-on to change review |
| `omp commit` | Split the working tree into ordered atomic commits | Needs a trustworthy diff workbench first |
| Unified `read` of PDFs, SQLite, notebooks, archives, URLs | One tool surface instead of `fetch_content` plus file `read` | Convenience; current fetch + Pi `read` is enough |
| Sticky `RULES.md` | Short rules re-attached near the current turn so they survive growth | Complements `AGENTS.md`; small, can ride a later context-files pass |

### Session extras

| Feature | What it is | Why later |
| --- | --- | --- |
| `/fresh` | Reset provider stream / prompt-cache without changing the local transcript | Small; useful after a wedged stream |
| HTML export / text dump | Shareable transcript artifact, no session mutation | Diagnostics sibling; Phase B already mentions redacted log export |
| Encrypted `/share` or live `/collab` | Snapshot link or realtime guest TUI/browser | Different trust model; collab is a relay product |
| Usage budget warnings | Soft caps and `/usage` beyond the composer chrome | Composer already shows tokens and cost |
| Magic keywords | `ultrathink` / `orchestrate` / `workflowz` inject hidden turn instructions | Easy to over-magic; plan/agent + task cover the intent |
| Memory | Cross-session facts: local summaries, Hindsight, or Mnemopi SQLite | Privacy, injection budget, and staleness policy needed first |
| Conversation `checkpoint` / `rewind` | Collapse exploratory tool calls into a short report | Not filesystem recovery; only after compaction UX exists |

### Orchestration extras

| Feature | What it is | Why later |
| --- | --- | --- |
| Advisor / `WATCHDOG.yml` | Second model reviews every turn; injects concern/blocker notes | Needs subagents plus a second model role |
| Vibe mode | Parent becomes read-only director; `fast`/`good` workers execute | A third mode; conflicts with two-mode Plan/Agent |
| TTSR | Regex/AST match aborts a stream mid-token and injects a rule | Needs stream intercept inside Pi, not the desktop runtime |
| Persistent eval | Long-lived Python/JS kernels with tool re-entry | See above; Phase D |
| Integrated terminal / PTY | Owner-visible shell panel, not just agent `bash` | Roadmap Phase D; process ownership first |

### Desktop and web

| Feature | What it is | Why later |
| --- | --- | --- |
| Isolated browser | App-owned profile: navigate, read, then mutating clicks | Low current demand; Phase C if a recurring task appears |
| Browser relay into owner Chrome | Drive already-open logged-in tabs | Explicitly rejected by Phase C |
| `computer` | Screenshots, native input, OS accessibility tree | Full-host JS; `read_only` is not a sandbox |
| Image generation / TTS / live voice | Extra model tools and Codex realtime voice | Not conversation-primary |
| ACP (editor-driven agent) | Zed/VS Code hosts OMP over Agent Client Protocol | Pho Code *is* the host; do not become a sidecar |

### Out of philosophy

Plugin marketplace, Smithery, user-installable extensions, ambient MCP/`.mcp.json` discovery, generic YAML settings, custom `models.yml` providers, inheriting other tools’ executable features, and replacing Pi’s agent loop with OMP internals. Skill-source interoperability for text-only Codex/Cursor/Claude/Pi roots is already accepted and is the intended subset.

## Native code (OMP Rust vs Pho Code)

Oh My Pi moved hot paths into ~80k lines of Rust (`pi-natives`, `pi-shell`, `pi-ast`, `pi-walker`, …) because it is a **forked coding engine**, not a desktop host. The goals are in-process ripgrep/glob/find, an embedded bash with in-process coreutils, Windows without WSL, snapcompact bitmap rasterization, desktop capture, and zero fork/exec on the search/shell hot path. Their own porting rule is: native only when a measured JS path is slower, and keep JS when N-API conversion would erase the gain.

Pho Code does **not** need a general Rust rewrite. It embeds Pi’s TypeScript SDK, already uses a native FFF index for local search, and talks to language servers as ordinary processes if LSP ships. Introducing Rust/Tauri requires an explicit architecture-decision change. Revisit natives only for a measured hot path the JS/Pi stack cannot carry (for example snapcompact frames, if that compaction strategy is chosen). Do not port the agent loop, session tree, or tool policy to Rust to “match OMP.”

## Required shape

A mature feature document should contain only the sections needed to make that feature implementable and reviewable, normally including:

1. owner outcome and non-goals;
2. verified current behavior;
3. proposed behavior and provider/platform differences;
4. architecture and ownership boundaries;
5. persisted, transient, and externally retained data;
6. lifecycle, recovery, fallback, and rollback behavior;
7. user-visible behavior and typed settings, if any;
8. dependency, license, compatibility, and attribution constraints;
9. verification levels and promotion gates;
10. unresolved product decisions.

Shared rules should be linked rather than copied. When an accepted feature changes a shared boundary, update the canonical architecture document and the feature document together.

