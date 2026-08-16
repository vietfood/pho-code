# Add-on features

## Purpose

This directory tracks **add-on capabilities**: owner-approved product work that is not a numbered product version (v1 / v2 / v3) and is not merely a conversation-chrome slice.

V3 stays in [`version/v3`](../version/v3/product.md). Conversation chrome stays in [`ui/`](../ui/README.md). Unpromoted later-version work stays in [`version/roadmap-vnext.md`](../version/roadmap-vnext.md). Canonical layer boundaries stay in [`architecture/`](../architecture/README.md).

An add-on may still change protocol, Electron, or UI, but it must be able to ship or fail without blocking v3, and v3 must be able to ship or fail without blocking the add-on.

## How a feature lives here

| Maturity | Layout | Meaning |
| --- | --- | --- |
| Research / proposed | one markdown file, e.g. `compaction.md` | Design only. Not an implementation contract. |
| Promoted add-on | a folder with `product.md` and `implementation-plan.md` | Owner-approved product boundary plus the real plan. Status is **In implementation** until acceptance. |
| Accepted add-on | same folder, plus a record in [`current-state.md`](../current-state.md) | Implemented and verified to the stated level. |

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
| Compaction | Proposed; Pi-native automatic behavior exists today | Long conversations retain useful continuity, expose when context is summarized, and remain portable across supported providers | [`compaction.md`](./compaction.md) |

## What does not belong here

Session tree/fork, Plan and Agent modes, subagents, LSP, edit reliability, browser automation, and public-release hardening are core product research. Track them in the numbered-version [`roadmap`](../version/roadmap-vnext.md) and [`research backlog`](../version/research-backlog.md). Change review and recovery are already promoted as [`v3`](../version/v3/product.md).

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
