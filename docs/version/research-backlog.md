# Core product research backlog

Status: research only. These are possible numbered-version capabilities, not approved add-ons or implementation promises.

The promotion queue and release grouping live in [`roadmap-vnext.md`](./roadmap-vnext.md). Promote one bounded outcome into `version/vN/product.md` and `version/vN/implementation-plan.md` before implementation.

Task Brief, bounded evidence packs, an authoritative verification ledger, evidence-backed completion, and the private headless `pho-agent` package boundary were promoted on 2026-08-20 as [`V5 — Pho Agent Foundation`](./v5/README.md). They are no longer research backlog items. V5 explicitly defers generic memory, Pho Research, subagents, and long-job orchestration.

## Near-term candidates

1. Session tree, fork, and clone over Pi-owned JSONL.
2. Plan and Agent modes with structured questions and optional session todo state. **Accepted and archived 2026-08-18** as [`plan-agent`](../archive/features/plan-agent/README.md). Keep this line only as the backlog pointer; do not re-research it as a numbered v4.
3. Scoped tasks and subagents with cancellation, ownership, and review.
4. TypeScript-first language-server integration.
5. Edit reliability beyond the accepted V3 change-review boundary.

Change review and recovery are accepted and archived as [`v3`](../archive/v3/product.md); they are not feature backlog items.

## Coding depth

- isolated worktrees after trustworthy change review;
- structural search only if Pi/FFF and ordinary editing remain insufficient;
- debugger protocol support when a concrete workflow justifies its lifecycle cost;
- GitHub and merge-conflict views built on existing typed boundaries;
- atomic commit assistance only after the diff workbench is dependable;
- bounded reading of additional document or archive formats;
- compact sticky rules if ordinary workspace instructions prove insufficient.

## Session and orchestration ideas

- fresh provider streams without replacing local transcript history;
- bounded transcript export and diagnostics;
- usage warnings and cross-session memory with explicit privacy/staleness/correction rules (**generic memory remains deferred outside V5**);
- conversation checkpoint/rewind after compaction UX exists;
- optional advisor roles, only after subagent ownership is proven;
- persistent evaluation kernels only with process, timeout, output, and tool-reentry controls.

## Desktop and remote ideas

- isolated-profile browser automation for a named recurring task;
- generated media or voice only if conversation-primary UX remains intact;
- native computer control only with an explicit host-authority and recovery plan.

Driving the owner's existing browser profile, magic hidden keywords, marketplaces, ambient MCP discovery, generic YAML/settings editors, custom provider files, and replacing Pi's agent loop remain outside the product philosophy.

## Native-code rule

Do not introduce a general Rust rewrite to mirror Oh My Pi. Pho Code embeds Pi's TypeScript SDK and uses native dependencies only for a measured boundary that JavaScript and the pinned SDK cannot carry. Electron remains the accepted shell until a separate architecture decision changes it. A Deno wrap of Pi is deferred until after V4 proves a Node `utilityProcess` child; see archived [`window-first-pi-core`](../archive/urgent/window-first-pi-core/product.md) and the active [`V4 plan`](./v4/implementation-plan.md).
