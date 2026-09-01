# Add-on features

## Purpose

This directory tracks **add-on capabilities**: owner-approved product work that is not a numbered product version (v1 / v2 / v3) and is not merely a conversation-chrome slice.

Closed V3 stays in [`archive/v3`](../archive/v3/product.md). Closed sandbox stays in [`archive/features/sandbox`](../archive/features/sandbox/README.md). Conversation chrome stays in [`ui/`](../ui/README.md). Unpromoted later-version work stays in [`version/roadmap-vnext.md`](../version/roadmap-vnext.md). Canonical layer boundaries stay in [`architecture/`](../architecture/README.md).

An add-on may still change protocol, Electron, or UI, but it must be able to ship or fail without blocking v3, and v3 must be able to ship or fail without blocking the add-on.

## How a feature lives here

| Maturity | Layout | Meaning |
| --- | --- | --- |
| Research / proposed | one markdown file, e.g. `<feature>.md` | Design only. Not an implementation contract. |
| Promoted add-on | a folder with `product.md` and `implementation-plan.md` | Owner-approved product boundary plus the real plan. Status is **In implementation** until acceptance. |
| Accepted add-on | same folder, plus a record in [`current-state.md`](../current-state.md) | Implemented and verified to the stated level. Stays here while the workstream is open. |
| Closed add-on | moved to [`archive/features/`](../archive/features/README.md) | Workstream closed. Living behavior stays in architecture and current-state. |

Do not keep a promoted add-on as a single “proposed” note. When the owner approves, create the folder, close selected product decisions, and write milestones with verification gates.

## Status vocabulary

Every add-on document must identify its status without implying that planned behavior exists:

- **Current:** implemented and verified to the level stated in the document.
- **Proposed:** a product and technical design awaiting promotion into an implementation plan.
- **In implementation:** promoted with an approved plan, but not yet accepted.
- **Accepted:** implemented, verified, and reflected in `current-state.md`.
- **Deferred:** deliberately outside the active product boundary.

A document may contain both current and planned sections. Each claim must make that distinction clear.

## Add-on index

| Feature | Status | Owner outcome | Documents |
| --- | --- | --- | --- |
| Integrated terminal | In implementation; owner-approved 2026-08-16 | Owner-visible login shell in the selected workspace, ghostty-web in the right sidebar, PTY in Electron main | [`terminal/product.md`](./terminal/product.md), [`terminal/implementation-plan.md`](./terminal/implementation-plan.md) |
| Context compaction | In implementation; owner-approved 2026-08-20 | Long chats keep a complete display transcript while Pi reduces active model context; lifecycle, idle-only manual control, and cancellation become visible | [`compaction/product.md`](./compaction/product.md), [`compaction/implementation-plan.md`](./compaction/implementation-plan.md) |
| Approval modes and automatic review | In implementation; Pi M0–M3 machine-verified 2026-09-01, owner acceptance pending | Per-chat Ask for approval, Approve for me, and Full access replace the owner-facing profile/YOLO mix while keeping containment, deterministic policy, and reviewer ownership explicit | [`approval-modes/product.md`](./approval-modes/product.md), [`approval-modes/implementation-plan.md`](./approval-modes/implementation-plan.md), [`approval-modes/handoff.md`](./approval-modes/handoff.md) |
| Subagent orchestration | In implementation; owner-approved 2026-09-01 | Pho/Pi parents delegate bounded work to fresh, named, fully inspectable Pho/Pi child sessions; Codex/Claude keep native subagent ownership and Pho projects only adapter-proven activity/controls | [`subagents/product.md`](./subagents/product.md), [`subagents/implementation-plan.md`](./subagents/implementation-plan.md) |
| Git change tracking | In implementation; owner-approved 2026-09-01 | Read-only git working-tree evidence in Changes, then an app-owned per-workspace shadow git repository checkpointing every run of every backend so bash, MCP, and external-backend mutations become visible next to exactly-attributed `write`/`edit` records; the owner's repository is never written | [`git-change-tracking/product.md`](./git-change-tracking/product.md), [`git-change-tracking/implementation-plan.md`](./git-change-tracking/implementation-plan.md) |

Closed add-ons live under [`archive/features`](../archive/features/README.md). Agent-tool sandbox was accepted 2026-08-17 and archived 2026-08-18; see [`archive/features/sandbox`](../archive/features/sandbox/README.md). Plan / Agent was accepted and archived 2026-08-18; see [`archive/features/plan-agent`](../archive/features/plan-agent/README.md).

## What does not belong here

Session tree/fork, multi-agent worktrees and integration, LSP, edit reliability, and browser automation remain core product research. Track them in the numbered-version [`roadmap`](../version/roadmap-vnext.md) and [`research backlog`](../version/research-backlog.md). The bounded separate-session delegation slice is now the [`subagents`](./subagents/README.md) add-on; do not use it to absorb worktrees, generic orchestration, or V5 intelligence behavior. The headless `pho-agent` boundary, measurable-intelligence baseline, Task Brief, evidence packs, verification ledger, and evidence-backed completion are promoted under [`V5`](../version/v5/README.md), not add-ons; V5 is **Blocked** as of 2026-08-28 behind the urgent queue and these add-ons. Public-beta hardening and extracting the Pi Node runtime into another process are promoted under pending [`V4`](../version/v4/README.md), not V5 or add-ons. Add-ons may continue while V4 is held. Plan / Agent modes with structured ask-back are the accepted, archived [`plan-agent`](../archive/features/plan-agent/README.md) add-on. Accepted change review and recovery are archived as [`v3`](../archive/v3/product.md). The owner-priority **window-first** slice (create the window before `ModelRuntime.create`) is accepted and archived under [`archive/urgent/window-first-pi-core`](../archive/urgent/window-first-pi-core/README.md); it is not an add-on or crash isolation. Bounded Stop, Stop-all, and bounded teardown are accepted under archived [`agent-stop`](../archive/urgent/agent-stop/README.md), not an add-on and not crash isolation. OS-level wrapping of agent `bash` plus in-process file-tool policy is the accepted, archived [`sandbox`](../archive/features/sandbox/README.md) add-on; it is not V4 process isolation.

Do not use this directory as a general competitor research catalog. A capability belongs here only when it can be specified, implemented, accepted, degraded, and retired independently of the active numbered version.

Persistent evaluation kernels are not terminals or ordinary `bash`; they require separate process, timeout, output, and tool-reentry ownership. They remain core research until promoted deliberately.

Plugin marketplaces, ambient MCP/`.mcp.json` discovery, generic settings editors, custom provider files, and replacing Pi's agent loop remain outside the product philosophy.

## Required shape

A mature add-on folder should contain only the sections needed to make that feature implementable and reviewable. `product.md` normally includes:

1. owner outcome and non-goals;
2. selected product decisions;
3. trust, data, and lifecycle;
4. user-visible contract.

`implementation-plan.md` normally includes:

1. global acceptance rules;
2. architecture, protocol, and file ownership;
3. milestones with implementation sequence, acceptance criteria, and verification;
4. pins, packaging, CSP, attribution;
5. exit checks and the acceptance gate.

Shared rules should be linked rather than copied. When an accepted add-on changes a shared boundary, update the canonical architecture document and the add-on documents together.
