# Parked: Cursor CLI as an external backend

Date: 2026-08-30
Status: **Parked** (not in source; not a V5 slice)
Owner: V5 — Pho Agent Foundation
Related: [external-backend ownership](./2026-08-27-external-backend-ownership.md), [Codex instruction/tool bridge](./2026-08-27-codex-instructions-and-tool-bridge.md), [V5 hold](./2026-08-28-blocked-pending-other-workstreams.md), UI [Cursor tools only on Cursor models](../../../ui/logs/2026-08-30-change-cursor-tools-cursor-model-only.md)

## Intent

Owner asked whether Cursor CLI could become a whole backend like Codex app-server or Claude ACP, instead of remaining a baked Pi provider (`pi-cursor-sdk`) whose tools leak into every Pi context prompt.

## Decision

Do **not** implement this while V5 is **Blocked**. A Cursor-CLI / ACP adapter would be new advertised capability: a reviewed `AgentBackendAdapter`, composer backend row, external install/auth/updates, and **no** Pi context prompt or Pi tool registry across the boundary. Stable ACP v1 has no Codex-style `developerInstructions` / dynamic-tool operation.

Today’s Cursor surface stays a Pi provider. The 2026-08-30 UI change only gates `cursor` / `cursor_*` tools to Cursor models inside Pi sessions. That is not a backend split.

If this is promoted after V5 unblocks, choose an explicit product rule for two Cursor surfaces:

1. Pi `cursor/*` models via `@cursor/sdk` (API key; local runtime; harness `settingSources=none`);
2. an external Cursor-agent backend (CLI or ACP), owning its own loop, tools, persistence, and auth.

Do not pass Pi compiled prompt A or baked ToolDefinitions into a Cursor-CLI session. Do not treat this as an add-on or urgent-queue item.

## Verification

Documentation only. No adapter, command pin, or composer row landed.

## Handoff

Resume only after the V5 unblock condition and an owner promotion. Re-read the hold record’s unverified Codex/ACP list before claiming any Cursor-backend evidence.
