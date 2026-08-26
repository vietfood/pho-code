# Codex lifecycle and native-activity prototype

Date: 2026-08-26
Status: prototype in source; not production-composed or accepted
Owner: V5 Pho Agent Foundation
Slices: B0 correction and B2a prototype
Related UI record: [`../../../ui/logs/2026-08-26-codex-native-tool-presentation.md`](../../../ui/logs/2026-08-26-codex-native-tool-presentation.md)

## Owner direction

Continue the backend-neutral Pho Agent plan, add direct Codex and ACP, project Codex tool use into Pho Code's existing frontend, and leave subagent presentation for a later slice. Keep the implementation clean and verification proportional.

## Decisions

- Corrected the initial Pi-shaped seam: only baseline lifecycle operations are required. Steering and queued follow-up are optional adapter methods.
- Capability descriptors now record `native`, `emulated`, or `experimental`; omission means unavailable. Pi advertises only native steering and queued follow-up.
- Added an experimental direct Codex adapter rather than translating Codex through ACP. It uses local stdio JSONL, narrow owned wire types, and an injected connection seam for deterministic checks.
- Until backend-neutral interactions land, started/resumed prototype threads use Codex `workspace-write` sandbox mode with `never` approval policy. Operations needing broader permission fail rather than hanging or receiving silent elevation.
- The prototype is characterized against generated schemas from installed Codex CLI `0.149.1`. It is not production-ready because official app-server status is experimental and Pho Code has not yet implemented server-to-client approvals, auth UI, source-owned configuration isolation, binary packaging/version enforcement, or production host composition.
- Native command, file-change, MCP, web-search, image, review, compaction, and collaboration/subagent items project into bounded backend-neutral transcript blocks. Dynamic tools are not enabled.
- Pho Code's existing tool block gained an optional backend-neutral kind hint. The current work-row icon selection uses that hint and continues to fall back to existing Pi tool names.
- Later subagent work is presentation of backend-owned activity. V5 does not add a Pho Agent multi-agent scheduler.
- Added a generic ACP stable-v1 prototype through exact official TypeScript SDK `1.4.0`. It negotiates initialize capabilities, supports new plus negotiated load/resume, prompt/cancel, and message/tool/plan/compaction projection. Permission requests cancel until the common interaction UI exists. A reviewed Claude-compatible agent artifact and real subprocess validation remain B3b.

## Source changes

- `@pho-agent/protocol`: support-level capability map and bounded normalized tool kinds/details.
- `@pho-agent/host`: optional steering/follow-up and shared scope adapter.
- `@pho-agent/runtime`: Pi descriptor correction and scope compatibility export.
- `@pho-agent/backend-codex`: app-server stdio connection, initialize handshake, thread create/resume, prompt/steer/interrupt, snapshot/event projection, bounded tool details, and deterministic adapter tests.
- `@pho-agent/backend-acp`: official stable-v1 SDK transport, negotiated lifecycle, prompt/cancel, bounded update projection, and deterministic adapter tests.
- `@pho-code/protocol` and `@pho-code/ui`: optional normalized tool kind and existing work-row icon mapping.

## Verification

- Root `bun run typecheck` — all eleven packages passed.
- Standalone Pho Agent `bun run typecheck` — all six packages passed.
- Standalone Pho Agent `bun test` — 57 passed, 0 failed.
- Focused Codex, ACP, host/protocol, Pho Code tool-row, and package-boundary tests passed; the final adapter/package-boundary subset was 17 passed, 0 failed.
- Focused ESLint for both adapters, host/protocol, changed tool presentation, and package-boundary test passed.
- Installed Codex CLI `0.149.1` app-server initialize/dispose smoke check passed against the real local binary. No thread or provider prompt was started.
- Parent and submodule `git diff --check` passed.

No real Codex prompt was sent: doing so would use owner credentials/provider capacity and is unnecessary for this transport/projection slice. No Claude-compatible ACP agent is installed or invoked. Production Electron routing, approvals, auth, desktop behavior, and packaged behavior are not verified in this prototype.

## Handoff

Next, finish B2a robustness and product-owned configuration/version diagnostics, then implement B2b interactions before composing Codex into production Pho Code. B1 should still migrate the current Pi path through `AgentHost` without changing public `workspaceId`. B3b chooses, packages, and validates a reviewed Claude-compatible ACP agent artifact before any Claude UI claim.
